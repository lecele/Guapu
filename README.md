# Guapu — Tutor de Enfermagem

Esta é a base independente da nova versão do Guapu. O aplicativo legado permanece no diretório pai e não deve receber novas alterações funcionais.

## Segurança do repositório

- Nunca versionar `.env`, `.env.local` ou outras variações com valores reais.
- Nunca versionar `credentials/service_account.json`.
- Configurar segredos localmente e nas variáveis protegidas da plataforma de deploy.
- O arquivo `.env.example` contém apenas nomes e valores de exemplo.
- Para operar a sincronização de documentos grandes na VPS, siga [deploy/VPS_WORKER.md](deploy/VPS_WORKER.md). O chat e o painel continuam na Vercel.

## Estado do Guapu

- Backend principal do chat: Next.js Route Handler em `app/api/chat/route.ts`.
- Migração de estado persistente preparada em `db/migrations/004_add_persistent_chat_state.sql`.
- Máquina de estados inicial em `lib/chat/session-flow.ts`.
- Testes de fluxo executados por `npm run test:flow`.

---

# Documentação da versão legada

O **Tutor de Enfermagem** é um assistente virtual de inteligência artificial generativa educacional especializado em **Enfermagem Perioperatória**. Ele foi desenvolvido para apoiar estudantes de graduação em enfermagem, promovendo a aprendizagem personalizada, o pensamento crítico e a autonomia intelectual através de um sistema de RAG (Retrieval-Augmented Generation) robusto e interativo.

O projeto faz parte do ecossistema de soluções voltadas à saúde da plataforma **Agentes na Saúde**.

* **Chatbot (Vercel):** [https://guapu.vercel.app](https://guapu.vercel.app)
* **Painel Administrativo & Analytics:** [https://guapu-painel.vercel.app](https://guapu-painel.vercel.app)

---

## 📊 Painel Administrativo & Dashboard Analytics (Estilo Power BI)

O sistema possui um **Painel de Analytics e Gestão em Tempo Real** localizado em `/admin`, projetado com a estética **Power BI** no tema do app:

1. **KPI Cards em Tempo Real:**
   - Total de Conversas / Sessões Únicas de Estudantes.
   - Tempo Médio de Resposta do Assistente (`1.4s`).
   - Taxa de Assertividade RAG (`96%`).
   - Taxa de Sucesso e Resolução no Quiz da Disciplina.

2. **Gráficos e Visualizações:**
   - **Volume de Atividade:** Gráfico de frequência de interações por período (`7d`, `30d`, `90d`).
   - **Categorias de Consulta:** Proporção de solicitações por Resumos, Quizes, Informações e Perguntas Livres.
   - **Ranking de Temas Frequentes:** Dúvidas mais solicitadas pelos alunos (Hemostasia, Feridas, Cirurgia Bariátrica, Anestesia, Estomas, etc.).
   - **Assertividade do Quiz:** Acertos na 1ª tentativa vs resoluções na 2ª tentativa vs erros.

3. **Dossiê Completo das Conversas (Exportação em PDF/TXT e CSV):**
   - Tabela com histórico completo de atendimentos.
   - Modal interativo para **visualizar e baixar o dossiê da sessão em TXT/PDF** para acompanhamento pedagógico dos docentes.
   - Botão para **Exportar todos os dados em CSV**.

4. **Base de Conhecimento RAG e Telemetria:**
   - Visualização de documentos indexados e contagem de chunks em tempo real via Supabase.
   - Status dos servidores (Supabase, Google Gemini API, Vercel).

---

## 🚀 Arquitetura e Tecnologias

O sistema é composto por uma arquitetura moderna e de alta performance:

1. **Frontend (Next.js 15 + React 19 + TailwindCSS 4):**
   - Rápido, responsivo e adaptado para múltiplos dispositivos (celulares iOS, Android e desktop).
   - Interface inspirada no design premium do projeto **InterAtiva**, personalizada na identidade visual **Azul Médico**.
   - Menu lateral flutuante, logo dinâmica, opções de chat em formato pill e suporte nativo a **Dark Mode** com persistência.
   - **Interação por Voz (STT e TTS):** Integração com `SpeechRecognition` (Microfone) e `SpeechSynthesis` (Auto-leitura) para chat acessível por áudio, com modo mudo (mute toggle) sincronizado.
   - **Menu Interativo Clicável:** Opções do menu renderizadas automaticamente como botões para facilitar a navegação em telas touch.

2. **Backend Serverless (Next.js API Route / App Router):**
   - Processamento de chat integrado em `app/api/chat/route.ts` com **otimização rigorosa de tokens** (-61% no prompt, bypass de RAG para navegação de menu e limites seguros de histórico/geração).
   - Tempo de resposta ultrarrápido (<200ms para navegação) e 3-6s para conteúdo denso.

3. **Banco de Vetores (Supabase + pgvector):**
   - Tabela `documents` para armazenamento dos materiais acadêmicos indexados em formato vetorial.
   - Busca de similaridade por Cosseno usando a extensão `vector` com indexação HNSW de alta performance.
   - Tabela `chat_messages` para histórico persistente de conversas (limitado estrategicamente a 3 trocas para economizar contexto).

4. **Modelos de IA (Google Gemini):**
   - **Embedding:** `gemini-embedding-2` (dimensões de saída: 768) para máxima precisão na busca semântica de materiais de estudo.
   - **Geração:** `gemini-2.5-flash` para respostas rápidas, fluidas e cumprimento estrito do **Prompt Mestre** de personalidade pedagógica (capped em 1024 tokens).

---

## 📚 Processamento de Documentos e Ingestão (Otimizado)

O Tutor conta com um pipeline de processamento de documentos localizado no script `ingest_docling.py`:

* **Roteamento Inteligente de Documentos:**
  - **PDFs:** São processados diretamente usando o leitor leve em Python puro `pypdf`. Isso garante **100% de estabilidade** e evita o erro de estouro de memória C++ (`std::bad_alloc`) ao processar livros extensos da disciplina (como os manuais de *Cuidados Críticos* e o *Brunner & Suddarth*).
  - **Outros formatos (.docx, .pptx):** São processados usando o framework `Docling`, aproveitando a extração inteligente de estrutura em Markdown.
* **Volume do RAG (Enfermagem Perioperatória):**
  - **35.572 trechos (chunks)** de conhecimento acadêmico indexados com sucesso no banco de dados do Supabase.
* **Deduplicação Inteligente:**
  - Gera hash de conteúdo para cada bloco. Chunks idênticos já existentes no banco de dados são pulados automaticamente, otimizando o tempo de processamento e o consumo da API de embeddings.

---

## 🛠️ Como Executar o Projeto

### Pré-requisitos
- Node.js (v18+)
- Python (v3.10+) com `pip`

### 1. Configuração de Variáveis de Ambiente
Crie um arquivo `.env` na raiz do projeto com base no modelo abaixo:

```env
# --- Google AI (Gemini) ---
GOOGLE_API_KEY=sua_chave_do_gemini
GOOGLE_SERVICE_ACCOUNT_FILE=./credentials/service_account.json

# --- Supabase ---
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_KEY=sua_anon_key_ou_service_role
SUPABASE_DB_URL=postgresql://postgres:<password>@<host>:5432/postgres

# --- Ingestão ---
RAG_MATCH_THRESHOLD=0.45
RAG_MATCH_COUNT=5
RAG_TABLE_NAME=documents
INGESTION_BATCH_SIZE=20
```

### 2. Executando o Ingestor de Documentos
Coloque seus arquivos `.pdf`, `.docx` ou `.pptx` dentro da pasta `nova_base/enfermagem_perioperatoria` e execute:

```bash
# Instale as dependências python do projeto
pip install -r requirements.txt

# Execute a ingestão
python ingest_docling.py --pasta "nova_base/enfermagem_perioperatoria"
```

### 3. Rodando o Servidor de Desenvolvimento
Instale as dependências do Node e inicie o projeto localmente:

```bash
npm install
npm run dev
```
Abra [http://localhost:3000](http://localhost:3000) no seu navegador.

### 4. Executando a Suíte de Testes
Para homologar a precisão das respostas do RAG, o método socrático e o comportamento de fallback, execute a suíte de testes automatizada local:

```bash
python scratch_test_rag.py
```

---

## ⚙️ Prompt Mestre de Personalidade

O comportamento do Tutor é regido estritamente pelas regras pedagógicas do curso, integradas na rota da API. Ele suporta:
- **Menu Principal Interativo:** Com opções de *Resumo de Conteúdo*, *Simulado de Prova*, *Informações do Curso* e *Encerrar Sessão*.
- **Método Socrático:** O Tutor estimula o raciocínio clínico do aluno fazendo perguntas direcionadas (uma por vez) e evitando entregar respostas prontas de imediato.
- **Grader de Relevância (CRAG):** Toda resposta técnica de enfermagem passa por um avaliador secundário automático para garantir que a informação vem estritamente da base de conhecimentos aprovada. Caso contrário, a resposta padrão de fallback é exibida.nte da base de conhecimentos aprovada. Caso contrário, a resposta padrão de fallback é exibida.
