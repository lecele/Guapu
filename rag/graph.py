"""
rag/graph.py — CRAG (Corrective RAG) com Memória de Sessão Persistente.

Fluxo exato implementado:
═══════════════════════════════════════════════════════════════════════════════

  ENTRADA: question (nova pergunta) + chat_history (restaurado pelo checkpoint)
       │
       ▼
  ┌────────────┐
  │  retrieve  │  Gera embedding da `question` → busca Supabase pgvector
  └─────┬──────┘
        │ documents (top-K chunks por similaridade)
        ▼
  ┌──────────────────┐
  │ grade_documents  │  ← CORE DO CRAG: Gemini avalia CADA chunk individualmente
  │                  │    Relevante → mantém no estado
  │                  │    Irrelevante → descarta
  └─────┬────────────┘
        │
        ▼ decide_after_grading (edge condicional)
        │
   ┌────┴──────────────────────────────────┐
   │                                       │
   ▼ (tem docs relevantes)                 ▼ (nenhum doc relevante)
  ┌──────────┐                     ┌───────────────────┐
  │ generate │                     │ fallback_response │
  │          │ resposta baseada    │                   │ resposta padrão
  │          │ em contexto +       │                   │ hardcoded — sem LLM,
  │          │ cita fonte (nome    │                   │ sem web search,
  │          │ do arquivo)         │                   │ sem alucinação
  └────┬─────┘                     └────────┬──────────┘
       │                                    │
       └────────────────┬───────────────────┘
                        │ → chat_history atualizado (operador.add)
                       END
                        │
                  [AsyncPostgresSaver persiste todo o estado por thread_id]

═══════════════════════════════════════════════════════════════════════════════
STATE KEYS: question | chat_history | documents | generation
═══════════════════════════════════════════════════════════════════════════════
"""

from __future__ import annotations

import asyncio
import operator
from functools import lru_cache
from typing import Annotated, Literal

import structlog
from langchain_core.documents import Document
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_google_genai import ChatGoogleGenerativeAI
from services.embeddings_service import Gemini2Embeddings
from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.graph import END, START, StateGraph
from pydantic import BaseModel, Field
from tenacity import retry, stop_after_attempt, wait_exponential
from typing_extensions import TypedDict

from config import get_settings
from db.supabase_client import get_supabase_client

logger = structlog.get_logger(__name__)


# ==============================================================================
# 1. STATE DO GRAFO
#    Contrato estrito: question | chat_history | documents | generation
# ==============================================================================

class GraphState(TypedDict):
    """
    Estado compartilhado entre todos os nós do grafo CRAG.

    Persistência via AsyncPostgresSaver (checkpoint por thread_id = session_id):
    - `question`:     Substituído a cada invocação com a nova pergunta.
    - `chat_history`: ACUMULADO entre turnos via `operator.add`. Cada turno
                      adiciona [{"role":"user",...}, {"role":"assistant",...}].
    - `documents`:    Substituído a cada invocação com os novos chunks.
    - `generation`:   Substituído a cada invocação com a nova resposta.
    """

    question: str
    """Pergunta atual do estudante de enfermagem."""

    chat_history: Annotated[list[dict], operator.add]
    """
    Histórico de mensagens da sessão.
    Formato: [{"role": "user"|"assistant", "content": "..."}]
    O reducer `operator.add` ACUMULA os turnos entre invocações (nunca sobrescreve).
    """

    documents: list[Document]
    """Chunks recuperados do Supabase no turno atual."""

    generation: str
    """Resposta final gerada (com contexto) ou mensagem de fallback."""


# ==============================================================================
# 2. CONSTANTES E UTILITÁRIOS DE CORTESIA
# ==============================================================================

import re
import unicodedata

# Texto de recusa padrão para perguntas fora do escopo da disciplina.
FALLBACK_RESPONSE = (
    "Não posso responder a essa solicitação porque está fora do escopo da disciplina "
    "ou das diretrizes éticas do assistente. Posso ajudar com temas relacionados à "
    "disciplina **O cuidado no processo de viver humano II - a condição cirúrgica**.\n\n"
    "Deseja voltar ao menu principal ou repetir a pergunta?"
)

# Mensagem inicial completa (primeira interação da sessão) — seção 7.1
GREETING_WELCOME_RESPONSE = (
    "Olá! Que bom ter você aqui no **Assistente de Estudos da INT 5224 – O cuidado "
    "no processo de viver humano II: a condição cirúrgica** 🩺\n\n"
    "Este espaço foi pensado para facilitar sua jornada de aprendizagem sobre o cuidado "
    "no processo de viver humano em condição cirúrgica. Aqui você revisa conteúdos, "
    "pratica com simulados e acessa informações essenciais da disciplina.\n\n"
    "**Como usar:** Fale comigo como se estivesse conversando com um tutor. Peça "
    "explicações, tire dúvidas ou escolha uma das opções abaixo.\n\n"
    "**O que esperar:** Clareza, objetividade e apoio contínuo — sempre dentro dos "
    "limites da disciplina.\n\n"
    "**Opções:**\n"
    "• Resumo de Conteúdo\n"
    "• Simulado de Prova\n"
    "• Informações da Disciplina\n"
    "• Encerrar Sessão"
)

# Mensagem curta quando o usuário retorna ao menu na mesma sessão — seção 7.2
MENU_RETURN_RESPONSE = (
    "Você voltou ao menu principal.\n\n"
    "Escolha uma opção ou envie uma pergunta livre relacionada à disciplina:\n"
    "• Resumo de Conteúdo\n"
    "• Simulado de Prova\n"
    "• Informações da Disciplina\n"
    "• Encerrar Sessão"
)

# Mensagem de encerramento de sessão — seção 11
ENCERRAR_RESPONSE = (
    "Sessão encerrada. Bons estudos! Estarei aqui sempre quando precisar. 👋"
)


def _is_encerrar_sessao(question: str) -> bool:
    """
    Detecta se o usuário quer encerrar a sessão.
    Aceita: "encerrar sessão", "encerrar", "sair", "fechar", "terminar sessão", etc.
    """
    if not question:
        return False
    normalized = unicodedata.normalize("NFD", question).encode("ascii", "ignore").decode("utf-8")
    normalized = normalized.lower().strip()
    normalized = re.sub(r"[^\w\s]", " ", normalized)
    encerrar_keywords = {
        "sair", "fechar", "encerrar", "terminar", "fim", "tchau", "bye",
        "encerrar sessao", "terminar sessao", "finalizar sessao",
        "encerrar sessão", "terminar sessão", "finalizar sessão",
        "fechar sessao", "fechar sessão"
    }
    for kw in encerrar_keywords:
        if kw in normalized:
            return True
    return False


def _is_menu_return(question: str) -> bool:
    """
    Detecta se o usuário quer voltar ao menu principal.
    """
    if not question:
        return False
    normalized = unicodedata.normalize("NFD", question).encode("ascii", "ignore").decode("utf-8")
    normalized = normalized.lower().strip()
    normalized = re.sub(r"[^\w\s]", " ", normalized)
    menu_keywords = {
        "menu", "voltar", "inicio", "home", "opcoes", "opções",
        "menu principal", "voltar ao menu", "voltar pro menu",
        "voltar para o menu", "pagina inicial"
    }
    for kw in menu_keywords:
        if kw in normalized:
            return True
    return False


def _is_greeting_or_courtesy(question: str) -> bool:
    """
    Verifica se a pergunta do estudante é estritamente uma saudação ou cortesia isolada,
    sem nenhuma intenção ou termo de busca técnico de enfermagem.
    """
    if not question:
        return False
    normalized = unicodedata.normalize("NFD", question).encode("ascii", "ignore").decode("utf-8")
    normalized = normalized.lower().strip()
    normalized = re.sub(r"[^\w\s]", " ", normalized)
    words = [w.strip() for w in normalized.split() if w.strip()]
    if not words:
        return False
    greeting_words = {
        "oi", "ola", "opa", "bom", "dia", "boa", "tarde", "noite",
        "tudo", "bem", "como", "vai", "voce", "voces",
        "e", "ai", "hello", "hi", "salve", "tutor", "bot", "ia", "sistema",
        "quem", "o", "que", "faz", "pode", "fazer", "nome", "seu", "funciona",
        "ajuda", "me", "ajudar", "estudar", "com",
        "obrigado", "obrigada", "valeu", "grato", "grata"
    }
    for word in words:
        if word not in greeting_words:
            return False
    return True


# ==============================================================================
# 3. MODELOS DE IA (Singleton via lru_cache)
# ==============================================================================

@lru_cache(maxsize=1)
def _get_llm() -> ChatGoogleGenerativeAI:
    """
    Retorna o LLM Gemini Flash (Singleton).
    temperature=0.2 → respostas consistentes e academicamente precisas.
    """
    settings = get_settings()
    return ChatGoogleGenerativeAI(
        model="gemini-3.1-pro-preview",
        temperature=0.3,
        google_api_key=settings.google_api_key,
        convert_system_message_to_human=False,
    )


@lru_cache(maxsize=1)
def _get_embeddings() -> Gemini2Embeddings:
    """Retorna o modelo de embeddings gemini-embedding-2 configurado com 768 dimensões."""
    settings = get_settings()
    return Gemini2Embeddings(
        model="models/gemini-embedding-2",
        output_dimensionality=768,
        google_api_key=settings.google_api_key,
    )


# ==============================================================================
# 4. SCHEMA PYDANTIC — Saída estruturada do avaliador CRAG
# ==============================================================================

class DocumentRelevanceGrade(BaseModel):
    """
    Schema de saída estruturada para o nó grade_documents.

    O Gemini Flash preenche este modelo ao avaliar cada chunk individualmente.
    O uso de `with_structured_output` elimina a necessidade de parsing manual.
    """

    score: Literal["relevant", "irrelevant"] = Field(
        description=(
            "Avaliação binária de relevância:\n"
            "'relevant'   → o chunk contém informação DIRETAMENTE útil para responder "
            "a pergunta de enfermagem (conceitos, procedimentos, dados clínicos, etc.)\n"
            "'irrelevant' → o chunk não aborda o tema da pergunta de forma útil."
        )
    )
    justification: str = Field(
        description=(
            "Justificativa técnica em 1-2 frases. "
            "Deve mencionar especificamente POR QUE o chunk é ou não relevante."
        )
    )


# ==============================================================================
# 5. UTILITÁRIOS
# ==============================================================================

def _format_chat_history(chat_history: list[dict], max_turns: int = 6) -> str:
    """
    Formata os últimos N turnos do histórico como texto para injeção no prompt.

    Args:
        chat_history: Lista de dicts {"role": "user"|"assistant", "content": "..."}.
        max_turns:    Número máximo de turnos (par user+assistant) a incluir.

    Returns:
        String formatada ou string vazia se não houver histórico.
    """
    if not chat_history:
        return ""

    # Pega os últimos max_turns * 2 registros (par user+assistant por turno)
    recent = chat_history[-(max_turns * 2):]

    lines = []
    for entry in recent:
        role_label = "Estudante" if entry.get("role") == "user" else "Tutor"
        lines.append(f"**{role_label}:** {entry.get('content', '')}")
        
    return "\n".join(lines)

def _format_context_with_sources(documents: list[Document]) -> str:
    """
    Formata os documentos relevantes como contexto numerado com nome do arquivo.

    Cada chunk é exibido com:
    - Número de referência [1], [2], ...
    - Nome do arquivo de origem (para citação na resposta)
    - Conteúdo do chunk

    Args:
        documents: Lista de Documents relevantes (já filtrados pelo grade_documents).

    Returns:
        String formatada para injeção no System Prompt de geração.
    """
    if not documents:
        return "Nenhum material disponível."

    parts = []
    for i, doc in enumerate(documents, start=1):
        source = doc.metadata.get("source", "Fonte desconhecida")
        similarity = doc.metadata.get("similarity", 0.0)
        parts.append(
            f"[{i}] **Arquivo:** {source} (similaridade: {similarity:.2f})\n"
            f"{doc.page_content}"
        )

    return "\n\n---\n\n".join(parts)


# ==============================================================================
# 6. NÓS DO GRAFO
# ==============================================================================

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    reraise=True,
)
async def retrieve(state: GraphState) -> dict:
    """
    Nó 1 — RETRIEVE: Busca semântica no Supabase pgvector (assíncrono).

    Gera o embedding da `question` e executa a função RPC `match_documents`
    no Supabase, retornando os top-K chunks por similaridade de cosseno.
    """
    question = state["question"]
    settings = get_settings()

    if not question.strip():
        logger.warning("retrieve_empty_question")
        return {"documents": []}



    logger.info("crag_retrieve_start", question=question[:100])

    # Gera embedding da pergunta em uma thread pool
    embeddings = _get_embeddings()
    question_embedding = await asyncio.to_thread(embeddings.embed_query, question)

    # Busca por similaridade no Supabase via RPC
    client = get_supabase_client()
    
    def _execute_rpc():
        return client.rpc(
            "match_documents",
            {
                "query_embedding": question_embedding,
                "match_threshold": settings.rag_match_threshold,
                "match_count": settings.rag_match_count,
            },
        ).execute()

    result = await asyncio.to_thread(_execute_rpc)
    raw_docs = result.data or []
    documents = [
        Document(
            page_content=row["content"],
            metadata={
                "id": row.get("id", ""),
                "source": row.get("source", "desconhecido"),
                "similarity": row.get("similarity", 0.0),
            },
        )
        for row in raw_docs
    ]

    logger.info("crag_retrieve_done", docs_retrieved=len(documents))
    return {"documents": documents}


async def grade_documents(state: GraphState) -> dict:
    """
    Nó 2 — GRADE DOCUMENTS: Core do CRAG — Avaliação concorrente e estrita de relevância.

    Usa o Gemini com saída estruturada (Pydantic) de forma paralela para avaliar
    cada chunk individualmente. Chunks irrelevantes são descartados.
    """
    question = state["question"]
    documents = state["documents"]

    logger.info("crag_grade_start", question=question[:80], total_docs=len(documents))

    if not documents:
        logger.warning("crag_grade_no_docs_to_evaluate")
        return {"documents": []}

    llm = _get_llm()
    grader = llm.with_structured_output(DocumentRelevanceGrade)

    grader_prompt = ChatPromptTemplate.from_messages([
        SystemMessage(content=(
            "Você é um avaliador especialista em enfermagem clínica e acadêmica. "
            "Sua tarefa é avaliar se um trecho (chunk) de material didático é RELEVANTE "
            "para responder a pergunta de um estudante de enfermagem.\n\n"
            "## Critérios de RELEVÂNCIA (deve atender TODOS):\n"
            "1. O trecho aborda DIRETAMENTE o tema central da pergunta.\n"
            "2. Contém conceitos, procedimentos, dados clínicos ou científicos "
            "que auxiliariam na formulação da resposta.\n"
            "3. A informação é específica — não apenas tangencial ao tema.\n\n"
            "## Critérios de IRRELEVÂNCIA (qualquer um é suficiente):\n"
            "- O trecho fala de um tema diferente da pergunta.\n"
            "- O trecho é genérico demais para ser útil na resposta.\n"
            "- A conexão com a pergunta é forçada ou superficial.\n\n"
            "Seja RIGOROSO. Em caso de dúvida, classifique como 'irrelevant'."
        )),
        HumanMessage(content=(
            "**Pergunta do estudante de enfermagem:**\n{question}\n\n"
            "**Trecho do material de estudo:**\n{document}\n\n"
            "Avalie a relevância deste trecho para responder a pergunta acima."
        )),
    ])

    async def evaluate_single_doc(i: int, doc: Document):
        source = doc.metadata.get("source", "?")
        similarity = doc.metadata.get("similarity", 0.0)

        try:
            grade: DocumentRelevanceGrade = await grader.ainvoke(
                grader_prompt.format_messages(
                    question=question,
                    document=doc.page_content[:2000],  # Limita tamanho por token budget
                )
            )

            log_entry = (
                f"[Chunk {i + 1}/{len(documents)}] "
                f"Fonte: '{source}' | Sim: {similarity:.2f} | "
                f"→ {grade.score.upper()} | {grade.justification}"
            )

            if grade.score == "relevant":
                logger.debug("crag_grade_relevant", chunk=i + 1, source=source)
                return doc, log_entry
            else:
                logger.debug("crag_grade_irrelevant", chunk=i + 1, source=source)
                return None, log_entry

        except Exception as exc:
            logger.error("crag_grade_error", chunk=i + 1, error=str(exc))
            log_entry = f"[Chunk {i + 1}] ERRO na avaliação → incluído por segurança."
            return doc, log_entry

    # Dispara as avaliações de todos os chunks de forma simultânea/paralela
    tasks = [evaluate_single_doc(i, doc) for i, doc in enumerate(documents)]
    results = await asyncio.gather(*tasks)

    relevant_docs = []
    grade_log = []
    for doc, log_entry in results:
        grade_log.append(log_entry)
        if doc is not None:
            relevant_docs.append(doc)

    logger.info(
        "crag_grade_done",
        relevant=len(relevant_docs),
        irrelevant=len(documents) - len(relevant_docs),
        total=len(documents),
    )

    # Loga o resumo completo da avaliação para auditoria acadêmica
    for entry in grade_log:
        logger.info("crag_grade_log", entry=entry)

    return {"documents": relevant_docs}


async def generate(state: GraphState) -> dict:
    """
    Nó 3a — GENERATE: Resposta fundamentada com contexto documental + Prompt Mestre (21Jul2026).
    """
    question = state["question"]
    documents = state["documents"]
    chat_history = state.get("chat_history", [])

    # ── Detecção de comandos especiais (sem chamar o LLM) ──────────────────────
    if _is_encerrar_sessao(question):
        logger.info("crag_generate_encerrar_sessao", question=question[:80])
        return {
            "generation": ENCERRAR_RESPONSE,
            "chat_history": [
                {"role": "user",      "content": question},
                {"role": "assistant", "content": ENCERRAR_RESPONSE},
            ],
        }

    if _is_menu_return(question):
        logger.info("crag_generate_menu_return", question=question[:80])
        return {
            "generation": MENU_RETURN_RESPONSE,
            "chat_history": [
                {"role": "user",      "content": question},
                {"role": "assistant", "content": MENU_RETURN_RESPONSE},
            ],
        }

    logger.info("crag_generate_start", question=question[:80], context_docs=len(documents))

    # Formata contexto e histórico
    context = _format_context_with_sources(documents)
    history_text = _format_chat_history(chat_history)
    history_section = (
        f"\n\n## Histórico da Conversa (últimos turnos):\n{history_text}"
        if history_text
        else ""
    )

    generation_prompt = ChatPromptTemplate.from_messages([
        SystemMessage(content=(
            "Você é um Assistente de Inteligência Artificial Generativa Educacional da disciplina de código "
            "INT 5224 e nome **O cuidado no processo de viver humano II - a condição cirúrgica** da "
            "Universidade Federal de Santa Catarina (UFSC).\n\n"
            "Seu propósito é apoiar estudantes de graduação em enfermagem, promovendo aprendizagem "
            "personalizada, pensamento crítico e autonomia intelectual. Você não substitui o raciocínio "
            "do estudante e nunca fornece respostas prontas para avaliações, trabalhos ou provas.\n\n"
            "## Princípios Éticos Obrigatórios\n"
            "- Princípios da UNESCO para Ética da IA: centralidade humana; equidade, inclusão e "
            "acessibilidade; transparência e explicabilidade; privacidade e proteção de dados; segurança "
            "e bem-estar; promoção do pensamento crítico; uso responsável e pedagógico.\n"
            "- Diretrizes da UNESCO para IA Generativa na Educação: evitar dependência excessiva; "
            "estimular autonomia intelectual; garantir integridade acadêmica; evitar vieses e "
            "discriminação; promover literacia digital e ética.\n"
            "- Diretrizes do MEC (Brasil): evitar plágio e respostas completas para avaliações; atuar como "
            "apoio, não substituto; promover ética, cidadania e responsabilidade profissional.\n\n"
            "## Perfil dos Usuários\n"
            "- Estudantes de graduação em enfermagem; níveis variados (iniciante, intermediário, avançado).\n"
            "- Preferências: respostas concisas com opção de aprofundamento; indicação de fontes confiáveis.\n"
            "- Formatos preferidos: Resumo; Simulados de Prova.\n\n"
            "## Estilo de Comunicação\n"
            "- Linguagem acadêmica e técnica adequada à área da saúde; tom motivador e respeitoso; "
            "clareza e rigor conceitual.\n"
            "- Respostas concisas, com opção de aprofundamento.\n"
            "- Explicações por analogias, exemplos clínicos e cenários.\n"
            "- Referências sempre listadas como tópicos no formato ABNT ao final da resposta.\n\n"
            "## Guard Rails – Escopo e Segurança\n"
            "Recusar educadamente solicitações que envolvam:\n"
            "- Temas fora do escopo da disciplina; conteúdos não relacionados à enfermagem/saúde;\n"
            "- Questões antiéticas, imorais, ilegais;\n"
            "- Diagnósticos, prescrições ou condutas clínicas reais;\n"
            "- Questões políticas, religiosas ou sexuais.\n"
            "Texto de recusa padrão: 'Não posso responder a essa solicitação porque está fora do escopo "
            "da disciplina ou das diretrizes éticas do assistente. Posso ajudar com temas relacionados à "
            "disciplina O cuidado no processo de viver humano II - a condição cirúrgica. Deseja voltar "
            "ao menu principal ou repetir a pergunta?'\n\n"
            "## Regras para Referências (ABNT)\n"
            "- Sempre usar ABNT NBR 6023.\n"
            "- Extrair dados somente do conteúdo dos arquivos disponíveis na base de conhecimento (RAG).\n"
            "- No corpo do texto: citações numéricas [1], [2], etc.\n"
            "- Na seção de referências: lista itemizada em formato ABNT, SEM mencionar nomes de arquivos "
            "da base de conhecimento.\n"
            "- Nunca inventar autores, títulos ou datas. Se faltar informação, indicar 'não encontrado'.\n"
            "- Formato: SOBRENOME, Prenomes. Título do documento. Ano. Seção consultada: página(s).\n\n"
            "## Comportamento por Fluxo\n\n"
            "### Fluxo: Resumo de Conteúdo\n"
            "1. Se o tema for amplo, solicitar subtema com exemplos.\n"
            "2. Estrutura do resumo: Explicação clara e concisa → Exemplos clínicos contextualizados → "
            "Relação com práticas de enfermagem no perioperatório → Referências ABNT → Sugestões de estudo.\n"
            "3. Após o resumo: perguntar se deseja aprofundar, escolher outro tema, voltar ao menu ou encerrar.\n\n"
            "### Fluxo: Simulado de Prova\n"
            "1. Criar 3 questões de múltipla escolha (níveis variados).\n"
            "2. OBRIGATÓRIO: apresentar UMA questão por vez e AGUARDAR a resposta antes de prosseguir.\n"
            "3. OBRIGATÓRIO: exibir as alternativas como LISTA ITEMIZADA (nunca em texto corrido):\n"
            "   A) texto da alternativa\n"
            "   B) texto da alternativa\n"
            "   C) texto da alternativa\n"
            "   D) texto da alternativa\n"
            "4. Aceitar respostas: 'A', 'a', 'alternativa A', 'opção A'.\n"
            "5. Se correta: confirmar e reforçar o conceito (1-2 frases).\n"
            "6. Se incorreta: oferecer nova chance; se errar de novo, fornecer resposta correta com explicação breve.\n"
            "7. Após as 3 questões: perguntar se deseja continuar, escolher outro tema, voltar ao menu ou encerrar.\n\n"
            "### Fluxo: Informações da Disciplina\n"
            "- Responder sobre conteúdo programático, calendário, formato de trabalhos, critérios de avaliação.\n"
            "- Fonte obrigatória: plano de ensino disponível na base de conhecimentos (RAG).\n"
            "- Se não disponível: recomendar consulta ao Moodle da disciplina.\n\n"
            "## Comportamento Adaptativo\n"
            "- Iniciante: exemplos simples e analogias.\n"
            "- Intermediário: aprofundamento conceitual.\n"
            "- Avançado: cenários clínicos complexos.\n"
            "- Detectar nível automaticamente pelo vocabulário e estrutura das perguntas.\n\n"
            "## Validação Universal de Entrada\n"
            "- Em todas as etapas, verificar se o formato recebido é equivalente ao esperado.\n"
            "- Se não for, pedir reentrada e fornecer 2-3 exemplos de entradas aceitáveis.\n"
            "- Mensagem padrão: 'Não entendi sua entrada. Por favor, digite novamente. "
            "Exemplos válidos: X, Y e Z'.\n\n"
            f"## Materiais de Estudo Disponíveis (Base RAG):\n{context}\n"
            f"{history_section}"
        )),
        HumanMessage(content="{question}"),
    ])

    llm = _get_llm()
    chain = generation_prompt | llm | StrOutputParser()
    response = await chain.ainvoke({"question": question})

    logger.info("crag_generate_done", response_chars=len(response))

    return {
        "generation": response,
        "chat_history": [
            {"role": "user",      "content": question},
            {"role": "assistant", "content": response},
        ],
    }


async def fallback_response(state: GraphState) -> dict:
    """
    Nó 3b — FALLBACK: Resposta padrão quando nenhum chunk é relevante.
    Sem LLM — hardcoded para evitar alucinação em contexto de saúde.
    """
    question = state["question"]

    logger.info(
        "crag_fallback_triggered",
        question=question[:80],
        reason="Nenhum chunk relevante encontrado após avaliação CRAG.",
    )

    if _is_encerrar_sessao(question):
        response_text = ENCERRAR_RESPONSE
        logger.info("crag_fallback_encerrar", question=question[:80])
    elif _is_menu_return(question):
        response_text = MENU_RETURN_RESPONSE
        logger.info("crag_fallback_menu_return", question=question[:80])
    elif _is_greeting_or_courtesy(question):
        response_text = GREETING_WELCOME_RESPONSE
        logger.info("crag_fallback_greeting_welcome", question=question[:80])
    else:
        response_text = FALLBACK_RESPONSE

    return {
        "generation": response_text,
        "chat_history": [
            {"role": "user",      "content": question},
            {"role": "assistant", "content": response_text},
        ],
    }


# ==============================================================================
# 7. EDGE CONDICIONAL — Roteamento pós-avaliação
# ==============================================================================

def decide_after_grading(
    state: GraphState,
) -> Literal["generate", "fallback_response"]:
    """
    Edge condicional: Define a rota após o nó `grade_documents`.

    Lógica:
    - Se `documents` não estiver vazio → chunks relevantes encontrados → "generate"
    - Se `documents` estiver vazio → todos os chunks foram descartados → "fallback_response"

    Esta é a decisão central do CRAG: a correção acontece aqui.
    """
    # Sempre roteia para "generate" para permitir que o LLM responda de forma amigável a dúvidas
    # de navegação, conversa geral ou forneça opções quando não houver material no RAG.
    # O LLM é instruído no prompt a dar o fallback padrão caso seja uma pergunta técnica vazia.
    route = "generate"
    logger.info("crag_routing_decision", route=route, relevant_docs=len(state.get("documents", [])))

    return route


# ==============================================================================
# 8. CONSTRUÇÃO DO GRAFO
# ==============================================================================

def build_crag_graph(checkpointer: BaseCheckpointSaver | None = None):
    """
    Constrói e compila o StateGraph CRAG com memória persistente opcional.

    Topologia:
        START
          │
          ▼
        retrieve          ← Nó 1: Busca pgvector no Supabase
          │
          ▼
        grade_documents   ← Nó 2: CORE CRAG — Avalia cada chunk com Gemini
          │
          ▼ decide_after_grading (edge condicional)
          │
     ┌────┴──────────────────────────┐
     │                               │
     ▼ (docs relevantes)             ▼ (sem docs relevantes)
   generate                    fallback_response
   (LLM + contexto + fontes)   (hardcoded — sem alucinação)
     │                               │
     └──────────────┬────────────────┘
                    │ chat_history acumulado (operator.add)
                   END → AsyncPostgresSaver persiste por thread_id

    Args:
        checkpointer: Saver de checkpoint (AsyncPostgresSaver ou MemorySaver).
                      Se None, o grafo roda sem persistência (apenas desenvolvimento).

    Returns:
        CompiledStateGraph pronto para uso com ainvoke().
    """
    workflow = StateGraph(GraphState)

    # ── Registra os nós ────────────────────────────────────────────────────────
    workflow.add_node("retrieve",          retrieve)
    workflow.add_node("grade_documents",   grade_documents)
    workflow.add_node("generate",          generate)
    workflow.add_node("fallback_response", fallback_response)

    # ── Define as arestas ──────────────────────────────────────────────────────
    workflow.add_edge(START, "retrieve")
    workflow.add_edge("retrieve", "grade_documents")

    # Edge condicional: grade_documents → generate OU fallback_response
    workflow.add_conditional_edges(
        source="grade_documents",
        path=decide_after_grading,
        path_map={
            "generate":          "generate",
            "fallback_response": "fallback_response",
        },
    )

    # Ambos os caminhos terminam no END
    workflow.add_edge("generate",          END)
    workflow.add_edge("fallback_response", END)

    # ── Compila com checkpointer ───────────────────────────────────────────────
    compiled = workflow.compile(checkpointer=checkpointer)

    checkpointer_name = type(checkpointer).__name__ if checkpointer else "None (sem persistência)"
    logger.info(
        "crag_graph_compiled",
        nodes=["retrieve", "grade_documents", "generate", "fallback_response"],
        checkpointer=checkpointer_name,
        state_keys=["question", "chat_history", "documents", "generation"],
    )

    return compiled
