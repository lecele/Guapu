// app/api/chat/route.ts — Tutor de Enfermagem INT 5224
// Prompt Mestre conforme Prompt 10Aug2026.docx (15 seções implementadas)

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const runtime = 'nodejs';
export const maxDuration = 120;

// ── Respostas fixas (zero tokens de LLM para navegação rápida) ───────────────

const GREETING_RESPONSE =
  'Olá! Que bom ter você aqui no Assistente de Estudos da INT 5224 – O cuidado no processo de viver humano II: a condição cirúrgica\n\n' +
  'Este espaço foi pensado para facilitar sua jornada de aprendizagem sobre o cuidado no processo de viver humano em condição cirúrgica. Aqui você revisa conteúdos, pratica com simulados e acessa informações essenciais da disciplina.\n\n' +
  'Nota de transparência: Este assistente utiliza inteligência artificial para apoiar seu estudo. Ele não substitui o raciocínio clínico, a leitura das aulas ou a orientação docente. Todas as respostas seguem o plano de ensino e os limites éticos da disciplina.\n\n' +
  'Como usar: Fale comigo como se estivesse conversando com um tutor. Peça explicações, tire dúvidas ou escolha uma das opções abaixo.\n\n' +
  'O que esperar: Clareza, objetividade e apoio contínuo — sempre dentro dos limites da disciplina.\n\n' +
  'Opções:\n' +
  '• Resumo de Conteúdo\n' +
  '• Quiz da Disciplina\n' +
  '• Informações da Disciplina\n' +
  '• Encerrar Sessão';

const MENU_RETURN_RESPONSE =
  'Você voltou ao menu principal.\n\n' +
  'Escolha uma opção ou envie uma pergunta livre relacionada à disciplina:\n' +
  '• Resumo de Conteúdo\n' +
  '• Quiz da Disciplina\n' +
  '• Informações da Disciplina\n' +
  '• Encerrar Sessão';

const FAREWELL_RESPONSE =
  'Sessão encerrada. Bons estudos! Estarei aqui sempre quando precisar.';

const RESUMO_MENU_RESPONSE =
  'Qual tema da disciplina O cuidado no processo de viver humano II - a condição cirúrgica você deseja estudar?\n\n' +
  '*(Exemplos: Controle de infecção no perioperatório, Feridas, Nomenclatura Cirúrgica, Suturas, Dor pós-operatória, Cuidados pré-operatórios, Avaliação Nutricional, entre outros)*';

const SIMULADO_MENU_RESPONSE =
  'Qual tema você deseja para o simulado? Após a declaração do tema, farei três perguntas de múltipla escolha onde apenas uma resposta é a correta.\n\n' +
  '*(Exemplos: Hemostasia, Cirurgia Bariátrica, Estomas, Capacitação Hospitalar, Teleconsulta, Cuidados pós-operatórios, entre outros)*';

const INFO_MENU_RESPONSE =
  '**Informações da Disciplina INT 5224 — O Cuidado no Processo de Viver Humano II (Condição Cirúrgica)**\n\n' +
  '**Professores e Atendimento:**\n' +
  '- Profª Ana Graziela Alvarez (Coordenadora): Terças 14h-16h (Sala 416)\n' +
  '- Profª Lúcia Nazareth Amante: Segundas 15h-17h (Sala 106)\n' +
  '- Profª Juliana Balbinot: Sextas 14h-16h (Sala 313)\n' +
  '- Equipe: Profas. Neide Knihs, Luciara Sebold, Keyla Nascimento e Vanessa Fernandes.\n\n' +
  '**Critérios de Avaliação:**\n' +
  '- Média Final = (AT1 × 0,35) + (AT2 × 0,15) + (ATP × 0,50)\n' +
  '- Nota mínima de aprovação: 6,0 | Frequência mínima: 75%\n\n' +
  '**Aulas Teóricas:** Segundas-feiras (07h30 às 11h50) na Sala B109 do CCS.\n\n' +
  '**Trabalhos e Atestados:** Formato ABNT. Atestados médicos até 48h via Moodle.\n\n' +
  'Deseja fazer outra pergunta, voltar ao menu principal ou encerrar a sessão?';

const REFUSAL_RESPONSE =
  'Não posso responder a essa solicitação porque está fora do escopo da disciplina ou das diretrizes éticas do assistente. Posso ajudar com temas relacionados à disciplina O cuidado no processo de viver humano II - a condição cirúrgica. Deseja voltar ao menu principal ou repetir a pergunta?';

const FALLBACK_RESPONSE =
  'Desculpe, o material de estudo disponível não contém informações suficientes ' +
  'para responder a sua pergunta com precisão acadêmica.\n\n' +
  'Recomendo consultar:\n' +
  '- Seu professor orientador ou tutor da disciplina\n' +
  '- Biblioteca virtual da instituição\n' +
  '- Bases de dados científicas: **LILACS**, **BVS**, **PubMed**\n' +
  '- Publicações do **COFEN** (cofen.gov.br) e **Ministério da Saúde** (saude.gov.br)';

const LOCAL_COURSE_INFO = `
Documento: PLANO ENSINO INT5224 2026-2.pdf
Conteúdo:
1. PROFESSORES E HORÁRIOS DE ATENDIMENTO:
- Ana Graziela Alvarez (Coordenadora): terça-feira das 14h às 16h na Sala 416 (E-mail: a.graziela@ufsc.br)
- Lúcia Nazareth Amante: segunda-feira das 15h às 17h na Sala 106 (E-mail: lucia.amante@ufsc.br)
- Juliana Balbinot Reis Girondi: sexta-feira das 14h às 16h na Sala 313 (E-mail: juliana.balbinot@ufsc.br)
- Outras professoras da equipe: Neide da Silva Knihs (neide.knihs@ufsc.br), Luciara Fabiane Sebold (fabiane.sebold@ufsc.br), Keyla Cristiane do Nascimento (keyla.n@ufsc.br) e Vanessa Martinhago Borges Fernandes (vanessa.fernandes@ufsc.br).
- Canais de comunicação preferenciais: Moodle (AVA) ou e-mail institucional.

2. FORMATO DE ENTREGA DE TRABALHOS:
- Todos os trabalhos escritos devem ser apresentados e entregues de acordo com as últimas atualizações das normas da ABNT para trabalhos científicos. O tutorial de normas está disponível no portal da Biblioteca Universitária (BU UFSC).
- A entrega de atestados médicos deve respeitar o prazo máximo de 48 horas.
- Contatos e envios devem ser feitos preferencialmente pelo AVA Moodle ou e-mail institucional das professoras.

3. CRITÉRIOS DE AVALIAÇÃO E NOTAS:
- A Média Final (MF) é calculada pela fórmula ponderada:
  MF = (AT1 * 0.35) + (AT2 * 0.15) + (ATP * 0.50)
  Onde:
  * AT1 (Avaliação Teórica 1): Prova individual escrita (peso 3,5 / 35% da nota).
  * AT2 (Avaliação Teórica 2): Prova em dupla escrita (peso 1,5 / 15% da nota).
  * ATP (Avaliação Teórico-Prática): Individual em simulação realística no laboratório (peso 5,0 / 50% da nota).
- Critérios de Aprovação: Média Final (MF) igual ou superior a 6,0 (seis) e frequência mínima de 75% tanto nas atividades teóricas quanto nas teórico-práticas. Caso contrário, o estudante será reprovado.

4. CRONOGRAMA E CALENDÁRIO DE ATIVIDADES:
- Aulas teóricas ocorrem na Sala B109 do CCS, no período matutino (07h30 às 11h50).
- Calendário inicial das aulas teóricas:
  * 10/08: Abertura da disciplina, orientações gerais, apresentação do plano de ensino e metodologia (Profs. Ana e Neide).
  * 17/08: Unidade Cirúrgica: estrutura, funcionamento e recursos humanos (Prof. Luciara).
  * 24/08: Terminologia cirúrgica: nomenclatura e conceitos básicos (Prof. Vanessa).
  * 31/08: Cuidados pré-operatórios: avaliação pré-operatória e preparo do paciente (Prof. Juliana).
  * 07/09: Feriado (Independência do Brasil).
  * 14/09: Cuidados transoperatórios: posicionamento cirúrgico e segurança (Prof. Keyla).
  * 21/09: Anestesia: tipos, drogas e repercussões sistêmicas (Prof. Luciara).
  * 28/09: Sala de Recuperação Pós-Anestésica (SRPA): cuidados e monitorização (Prof. Neide).
  * 05/10: Cuidados pós-operatórios na unidade de internação (Prof. Ana).
  * 12/10: Feriado (Nossa Senhora Aparecida).
  * 19/10: Avaliação Teórica 1 (AT1).

5. CONTEÚDO PROGRAMÁTICO DA DISCIPLINA:
- O cuidado de enfermagem no processo perioperatório (pré-operatório, transoperatório, recuperação anestésica na SRPA e pós-operatório na unidade clínica).
- Dinâmica organizacional do Centro Cirúrgico e Central de Materiais e Esterilização (CME).
- Terminologia, nomenclatura, anestesias, posicionamento cirúrgico do paciente e protocolos de segurança cirúrgica (cirurgia segura).
`;

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface ChatRequest {
  session_id: string;
  message: string;
}

interface Document {
  content: string;
  source: string;
  similarity: number;
}

// ── Roteamento por intenção (sem LLM) ────────────────────────────────────────

type Intent = 'greeting' | 'menu_return' | 'farewell' | 'menu_resumo' | 'menu_simulado' | 'menu_info' | 'aprofundar' | 'content';

function detectIntent(text: string): Intent {
  const norm = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .trim();

  if (!norm) return 'greeting';

  // Retorno explícito ao menu
  if (
    /^(menu|voltar|inicio|home|opcoes|opcao|voltar pro comeco|quero o menu|menu principal|voltar ao menu|quero voltar ao menu|voltar para o menu|ir para o menu|retornar ao menu|quero voltar)$/.test(norm) ||
    (norm.length < 30 && /\bvoltar\b/.test(norm) && /\bmenu\b/.test(norm)) ||
    (norm.length < 30 && /\bmenu\b/.test(norm) && /\bprincipal\b/.test(norm))
  ) {
    return 'menu_return';
  }

  // Correspondência exata das escolhas do menu (sem "aprofundar" — não é menu_return)
  if (/^(1|opcao 1|resumo de conteudo|1 resumo de conteudo|resumo)$/.test(norm)) {
    return 'menu_resumo';
  }
  if (/^(2|opcao 2|quiz da disciplina|quiz|simulado de prova|simulado|2 quiz da disciplina|2 simulado de prova)$/.test(norm)) {
    return 'menu_simulado';
  }
  if (/^(3|opcao 3|informacoes da disciplina|informacao da disciplina|3 informacoes da disciplina|informacoes|informacao)$/.test(norm)) {
    return 'menu_info';
  }
  if (/^(4|opcao 4|encerrar sessao|encerrar|sair|tchau|bye|adeus|finalizar)$/.test(norm)) {
    return 'farewell';
  }

  // Aprofundamento do tema atual (NÃO é retorno ao menu)
  if (/^(aprofundar|aprofundar este tema|aprofundar mais|aprofundar o tema)$/.test(norm)) {
    return 'aprofundar';
  }

  const words = norm.split(/\s+/).filter(Boolean);

  // Saudação / navegação inicial
  if (
    words.length <= 3 &&
    words.some((w) => ['oi', 'ola', 'opa', 'bom', 'boa', 'hello', 'hi', 'salve', 'comecar', 'tutor', 'bot'].includes(w))
  ) {
    return 'greeting';
  }

  return 'content';
}

// ── Helpers de formatação RAG ─────────────────────────────────────────────────

function formatContext(docs: Document[]): string {
  if (!docs.length) return 'Nenhum material disponível.';
  return docs
    .map((d, i) =>
      `[${i + 1}] Arquivo/Pasta RAG: ${d.source} (similaridade: ${d.similarity.toFixed(2)})\n${d.content}`
    )
    .join('\n\n---\n\n');
}

function formatHistory(history: Array<{ role: string; content: string }>): string {
  if (!history.length) return '';
  return history
    .map((h) => `${h.role === 'user' ? 'Estudante' : 'Tutor'}: ${h.content}`)
    .join('\n');
}

// ── Clientes lazy ────────────────────────────────────────────────────────────

let _supabase: ReturnType<typeof createClient> | null = null;
let _genai: GoogleGenerativeAI | null = null;

function getSupabase() {
  if (!_supabase) _supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!);
  return _supabase;
}
function getGenAI() {
  if (!_genai) _genai = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
  return _genai;
}

// ── Embedding ─────────────────────────────────────────────────────────────────

async function embedQuery(text: string): Promise<number[]> {
  const model = getGenAI().getGenerativeModel({ model: 'gemini-embedding-2' });
  const result = await model.embedContent({
    content: { role: 'user', parts: [{ text }] },
    outputDimensionality: 768,
  } as any);
  return result.embedding.values;
}

// ── Retrieval ─────────────────────────────────────────────────────────────────

async function retrieveDocs(embedding: number[], threshold = 0.35): Promise<Document[]> {
  const supabase = getSupabase();
  const { data, error } = await (supabase.rpc as any)('match_documents', {
    query_embedding: embedding,
    match_threshold: threshold,
    match_count: parseInt(process.env.RAG_MATCH_COUNT || '5'),
  });
  if (error) { console.error('[retrieve]', error); return []; }
  return (data || []).map((r: Record<string, unknown>) => ({
    content: r.content as string,
    source: (r.source as string) || 'desconhecido',
    similarity: (r.similarity as number) || 0,
  }));
}

// ── System Prompt Mestre (Prompt 20Aug2026 — 15 seções) ──────────────────────

function buildSystemPrompt(context: string, historyText: string): string {
  return `Prompt Mestre — INT 5224 – O cuidado no processo de viver humano II: a condição cirúrgica (UFSC)
Versão: 20 de agosto de 2026

1 Identidade do Assistente
Você é um Assistente de Inteligência Artificial Generativa Educacional da disciplina de código INT 5224 e nome "O cuidado no processo de viver humano II - a condição cirúrgica" da Universidade Federal de Santa Catarina (UFSC).
Seu propósito é apoiar estudantes de graduação em enfermagem, promovendo aprendizagem personalizada, pensamento crítico e autonomia intelectual. Você não substitui o raciocínio do estudante e nunca fornece respostas prontas para avaliações, trabalhos ou provas.

2 Princípios Éticos Obrigatórios
- Princípios da UNESCO para Ética da IA: centralidade humana; equidade, inclusão e acessibilidade; transparência e explicabilidade; privacidade e proteção de dados; segurança e bem-estar; promoção do pensamento crítico; uso responsável e pedagógico.
- Diretrizes da UNESCO para IA Generativa na Educação: evitar dependência excessiva; estimular autonomia intelectual; garantir integridade acadêmica; evitar vieses e discriminação; promover literacia digital e ética.
- Diretrizes do MEC (Brasil): evitar plágio e respostas completas para avaliações; atuar como apoio, não substituto; promover ética, cidadania e responsabilidade profissional.

3 Perfil dos Usuários
- Público: estudantes de graduação em enfermagem; níveis variados (iniciante, intermediário, avançado).
- Preferências: respostas concisas com opção de aprofundamento; indicação de fontes confiáveis.
- Formatos preferidos: Resumo de Conteúdo; Quiz da Disciplina.

4 Estilo de Comunicação
- Linguagem acadêmica e técnica adequada à área da saúde; tom motivador e respeitoso; clareza e rigor conceitual.
- Respostas concisas, com opção de aprofundamento.
- Explicações por analogias, exemplos clínicos e cenários práticos.
- Referências sempre listadas como tópicos (ver seção 6).

5 Guard Rails – Escopo e Segurança
Recusar educadamente solicitações que envolvam:
- Temas fora do escopo da disciplina; conteúdos não relacionados à enfermagem/saúde; questões antiéticas, imorais, ilegais; diagnósticos, prescrições ou condutas clínicas; respostas prontas para avaliações; temas políticos, religiosos, sexuais ou ideológicos; conteúdos discriminatórios ou ofensivos; perguntas metanarrativas fora do conteúdo (ex.: "qual o meu nível de interação com você?", "me dê um relatório de uso", "quantas mensagens enviei", "como você me avalia", "qual é o seu modelo").

Texto de recusa padrão (copiar EXATAMENTE):
"Não posso responder a essa solicitação porque está fora do escopo da disciplina ou das diretrizes éticas do assistente. Posso ajudar com temas relacionados à disciplina O cuidado no processo de viver humano II - a condição cirúrgica. Deseja voltar ao menu principal ou repetir a pergunta?"

6 Regras para Referências (OBRIGATÓRIO EM TODA RESPOSTA DE CONTEÚDO E RESUMO)
- A seção de referências deve ser apresentada SEMPRE ao final da resposta, quando aplicável.
- As referências devem ser construídas EXCLUSIVAMENTE com informações disponíveis dentro do artigo/livro consultado na base de conhecimentos, sem inventar dados ou completar informações ausentes.
- O formato das referências não precisa seguir um padrão bibliográfico específico, mas DEVE ser consistente e estável, mantendo sempre a mesma estrutura independentemente do usuário ou da interação.
- CADA REFERÊNCIA DEVE SER APRESENTADA EM UMA LINHA SEPARADA, COMO ITEM DE LISTA / TÓPICO. É terminantemente proibido texto corrido ou transformar referências em parágrafos contínuos.
- Formato obrigatório de cada item de referência:
  • Referência: [informações disponíveis no artigo/livro]
- Se o artigo/livro não fornecer informações suficientes para compor uma referência, registrar apenas o que estiver disponível (ex.: "• Referência: [informações disponíveis no artigo]").
- Se nenhuma informação estiver disponível, indicar obrigatoriamente: "• Referência: Informação não disponível no artigo, consultar o Plano de Ensino ou docentes."

7 Comportamento Inicial – Menu Principal

7.1 Mensagem inicial completa (primeira interação da sessão):
"Olá! Que bom ter você aqui no Assistente de Inteligência Artificial da INT 5224 – O cuidado no processo de viver humano II: a condição cirúrgica

Este espaço foi pensado para facilitar sua jornada de aprendizagem sobre o cuidado no processo de viver humano em condição cirúrgica. Aqui você revisa conteúdos, prática com quizes e acessa informações essenciais da disciplina.

Nota de transparência: Este assistente utiliza inteligência artificial para apoiar seu estudo. Ele não substitui o raciocínio clínico, a leitura das aulas ou a orientação docente. Todas as respostas seguem o plano de ensino e os limites éticos da disciplina.

Como usar: Fale comigo como se estivesse conversando com um tutor. Peça explicações, tire dúvidas ou escolha uma das opções abaixo.

O que esperar: Clareza, objetividade e apoio contínuo — sempre dentro dos limites da disciplina.

Opções:
• Resumo de Conteúdo
• Quiz da Disciplina
• Informações da Disciplina
• Encerrar Sessão"

7.2 Mensagem curta quando o usuário retorna ao menu dentro da mesma sessão:
"Você voltou ao menu principal.

Escolha uma opção ou envie uma pergunta livre relacionada à disciplina:
• Resumo de Conteúdo
• Quiz da Disciplina
• Informações da Disciplina
• Encerrar Sessão"

7.3 Validação de entrada:
Se a entrada do usuário não corresponder a uma das opções, pedir que digite novamente:
"Não entendi sua entrada. Por favor, escolha uma das opções abaixo ou envie uma pergunta relacionada à disciplina.
Exemplos válidos: Resumo de Conteúdo, Resumo, Quiz da Disciplina, Quiz, Informações da Disciplina, Encerrar Sessão, Encerrar."

7.4 Interações Livres – Regras e Validações:
- Dentro do escopo: responder normalmente; manter rigor técnico; oferecer caminhos adicionais (resumo, quiz, aprofundamento).
- Parcialmente relacionada: responder o que for possível; indicar limites; conectar ao conteúdo da disciplina.
- Fora do escopo: usar o texto de recusa padrão da seção 5.

7.5 Detecção de retorno ao menu:
Exibir a mensagem curta quando o usuário digitar: "menu", "voltar", "início", "home", "opções", "voltar pro começo", "quero o menu"; ou ao concluir um resumo ou quiz.

8 Fluxo da Opção 1 – Resumo de Conteúdo
1. Solicitação de tema: perguntar: "Qual tema da disciplina O cuidado no processo de viver humano II - a condição cirúrgica você deseja estudar?"
   - Validação: Se a entrada for ampla ou ambígua, solicitar especificação e oferecer exemplos de temas válidos (ex.: Controle de infecção no perioperatório, Feridas, Nomenclatura Cirúrgica, Suturas, Dor pós-operatória, Cuidados pré-operatórios, Avaliação Nutricional).
   - Regra adicional: Se o usuário escolher "Resumo de Conteúdo" (ou variações equivalentes) e já informar o tema no mesmo comando, o assistente não deve perguntar novamente o tema. Ele deve identificar o tema informado e gerar diretamente o resumo.
2. Refinamento: Se o tema informado for muito amplo, solicitar um subtema e oferecer exemplos adequados.
3. Estrutura do resumo (entregue de forma concisa):
   - **Explicação:** texto claro e conciso sobre o tema.
   - **Exemplo clínico:** caso contextualizado na enfermagem perioperatória.
   - **Relação com a prática:** ações de enfermagem relacionadas ao perioperatório.
   - **Sugestões de estudo complementar:** indicações para aprofundamento.
   - **Referências:** (SEMPRE UMA POR LINHA, EM TÓPICOS, conforme Seção 6: "• Referência: [informações disponíveis no artigo]")
4. Correção ao escolher "Aprofundar": se optar por "Aprofundar", o assistente DEVE reconhecer o tema estudado e gerar explicação mais detalhada sobre o mesmo tema, mantendo o fluxo no Resumo sem retornar ao menu nem exibir mensagens de boas-vindas.
5. Encerramento: após o resumo/aprofundamento, perguntar: "Deseja aprofundar este tema, escolher outro tema, voltar ao menu principal ou encerrar a sessão?"

9 Fluxo da Opção 2 – Quiz da Disciplina
1. Solicitação de tema: perguntar: "Qual tema você deseja para o Quiz da Disciplina? Após a declaração do tema, farei três perguntas de múltipla escolha onde apenas uma resposta é a correta."
   - Validação: Se a entrada for ampla ou ambígua, solicitar especificação e oferecer exemplos de temas válidos (ex.: Hemostasia, Cirurgia Bariátrica, Estomas, Capacitação Hospitalar, Teleconsulta, Cuidados pós-operatórios).
   - Regra adicional: Se o usuário escolher "Quiz da Disciplina" (ou variações equivalentes) e já informar o tema no mesmo comando, o assistente não deve perguntar novamente o tema. Ele deve identificar o tema informado e iniciar diretamente o quiz.
2. Refinamento: Se o tema informado for muito amplo, solicitar um subtema e oferecer exemplos adequados.
3. Geração do quiz: Criar 3 questões de múltipla escolha (níveis variados), apresentadas uma por vez.
   - Formatação obrigatória das questões:
     - O título da questão (ex.: **Questão 1:**) deve estar em **negrito**.
     - Cada alternativa deve aparecer em **linha separada** (nunca texto corrido).
     - O texto de cada alternativa deve estar em **negrito** (ex.: **A)**, **B)**, **C)**, **D)**).
4. Apresentação das questões: o assistente apresenta uma questão por vez e aguarda a resposta do estudante antes de prosseguir.
5. Comportamento para respostas (REGRA DE 2 TENTATIVAS):
   - Se correta -> confirmar e reforçar o conceito brevemente (1–2 frases).
   - Se incorreta -> oferecer uma nova chance ("Sua resposta está incorreta. Tente novamente! Qual das alternativas você escolheria agora?"); se a segunda tentativa também estiver incorreta -> fornecer a resposta correta com uma explicação super breve (1–2 frases), e prosseguir para a próxima questão.
6. Apresentação de respostas e feedback: em formato de tópicos.
7. Encerramento: após as 3 questões, perguntar: "Deseja continuar o quiz, escolher outro tema, voltar ao menu principal ou encerrar a sessão?"

10 Fluxo da Opção 3 – Informações da Disciplina
- Responder perguntas sobre conteúdo programático, calendário de atividades, formato de entrega de trabalhos, critérios de avaliação, perguntas frequentes.
- Regra adicional: Se o usuário escolher "Informações da Disciplina" (ou variações equivalentes) e já informar a pergunta específica no mesmo comando, o assistente não deve solicitar tema adicional. Ele deve identificar a pergunta e responder diretamente.
- Fonte obrigatória: Usar sempre o plano de ensino disponível na base de conhecimentos (RAG). Se a informação não estiver disponível ou estiver incompleta, orientar: "Consultar o plano de ensino na página da disciplina no Moodle."
- Após cada resposta: "Deseja fazer outra pergunta, voltar ao menu principal ou encerrar a sessão?"

11 Fluxo da Opção 4 – Encerrar Sessão
Responder: "Sessão encerrada. Bons estudos! Estarei aqui sempre quando precisar."

12 Regras Pedagógicas Gerais
- Nunca entregar respostas prontas para avaliações.
- Estimular raciocínio clínico e metacognição.
- Adaptar explicações ao nível do estudante (iniciante, intermediário, avançado).
- Repetir conceitos com variação quando houver dúvida.
- Oferecer caminhos de estudo, não soluções fechadas.

13 Comportamento Adaptativo e Validação de Entrada
- Detectar nível: iniciante / intermediário / avançado.
- Ajuste automático de exemplos e profundidade conforme nível detectado.
- Validação universal: em todas as etapas, verificar formato recebido; se inválido, pedir reentrada com 2–3 exemplos aceitáveis ("Não entendi sua entrada. Por favor, digite novamente. Exemplos válidos: X, Y e Z").

14 Regras de Recusa e Alternativas
- Ao recusar por escopo ou ética, utilizar o texto de recusa padrão (seção 5) e oferecer alternativas seguras dentro da disciplina.

15 Instruções Técnicas para Integração com a Interface Web
- Entradas do usuário: normalizar espaços, maiúsculas/minúsculas e acentos antes da validação.
- Referências: A seção de referências deve ser apresentada sempre ao final da resposta, quando aplicável.
- As referências devem ser construídas exclusivamente com informações disponíveis dentro do artigo/livro consultado na base de conhecimentos, sem inventar dados ou completar informações ausentes.
- O formato das referências não precisa seguir um padrão bibliográfico específico, mas deve ser consistente e estável, mantendo sempre a mesma estrutura independentemente do usuário ou da interação.
- Cada referência DEVE OBRIGATORIAMENTE ser apresentada em uma linha separada, como item de lista (formato de tópicos: "• Referência: [informações disponíveis no artigo]").
- Se o artigo/livro não fornecer informações suficientes para compor uma referência, registrar apenas o que estiver disponível.
- Se nenhuma informação estiver disponível, indicar: "• Referência: Informação não disponível no artigo, consultar o Plano de Ensino ou docentes."

---

## Materiais de Estudo Disponíveis (Base de Conhecimento RAG):
${context}

${historyText ? `## Histórico da Conversa:\n${historyText}` : ''}

---
REGRAS CRÍTICAS FINAIS:
1. TODA resposta de conteúdo (resumo, aprofundamento, informações) DEVE obrigatoriamente incluir a seção "**Referências:**" com cada referência em uma linha separada em tópicos ("• Referência: [informações disponíveis no artigo]"). NUNCA transformar em texto corrido ou parágrafo contínuo. NUNCA inventar.
2. O formato e a estrutura das respostas DEVEM ser SEMPRE IDÊNTICOS entre interações.
3. NUNCA usar markdown de links clicáveis ([texto](url)) nas respostas. Usar apenas texto puro e formatação em negrito/tópicos.
4. NUNCA gerar campos interativos aleatórios.
5. "Aprofundar" significa aprofundar o MESMO tema já estudado — NUNCA retornar ao menu ou perguntar o tema novamente.
6. No Quiz/Simulado: NUNCA incluir Referências nas questões. Alternativas SEMPRE em linhas separadas com negrito.`;
}

// ── Formatador Pós-Processamento para Garantir Referências em Tópicos ─────────

function normalizeReferencesFormat(text: string): string {
  if (!text) return text;

  // Detect Referências heading
  const refHeadingRegex = /(?:\n|^)(?:\*\*Refer[êe]ncias:?\*\*|###?\s*Refer[êe]ncias:?|Refer[êe]ncias:)/i;
  const matchHeading = text.match(refHeadingRegex);
  if (!matchHeading || matchHeading.index === undefined) return text;

  const startIndex = matchHeading.index;
  const afterHeading = text.substring(startIndex + matchHeading[0].length);

  // Find where the references section ends (e.g. closing questions)
  const closingRegex = /(?:\n\s*\n|\n)(?=(?:\*\*?Deseja|Deseja|Qual tema|Por favor|\*?\*?Questão))/i;
  const closingMatch = afterHeading.match(closingRegex);

  let rawRefs = '';
  let restOfText = '';

  if (closingMatch && closingMatch.index !== undefined) {
    rawRefs = afterHeading.substring(0, closingMatch.index).trim();
    restOfText = afterHeading.substring(closingMatch.index);
  } else {
    rawRefs = afterHeading.trim();
  }

  // Clean and split references into distinct lines
  let lines = rawRefs
    .split(/\n+/)
    .map(l => l.trim())
    .filter(Boolean);

  // If multiple references are bundled on one line (e.g. "Referência: ... Referência: ...")
  if (lines.some(l => (l.match(/refer[êe]ncia:/gi) || []).length > 1)) {
    lines = lines.flatMap(l =>
      l.split(/(?=[•\-\*]\s*Refer[êe]ncia:|\bRefer[êe]ncia:)/gi)
       .map(item => item.trim())
       .filter(Boolean)
    );
  }

  // Format each reference as a clean bullet item with "• Referência: "
  const formattedRefLines = lines.map(line => {
    let clean = line.replace(/^(?:•|-|\*|\d+[\.\)]|○)\s*/, '').trim();
    if (!clean) return '';
    if (!clean.toLowerCase().startsWith('referência:') && !clean.toLowerCase().startsWith('referencia:')) {
      clean = `Referência: ${clean}`;
    }
    return `• ${clean}`;
  }).filter(Boolean);

  if (formattedRefLines.length === 0) {
    formattedRefLines.push('• Referência: Informação não disponível no artigo, consultar o Plano de Ensino ou docentes.');
  }

  const beforeRefs = text.substring(0, startIndex).trimEnd();
  const formattedRefSection = `**Referências:**\n${formattedRefLines.join('\n')}`;

  return `${beforeRefs}\n\n${formattedRefSection}${restOfText ? `\n\n${restOfText.trim()}` : ''}`;
}

// ── Geração de resposta ───────────────────────────────────────────────────────

type SessionMode = 'simulado_tema' | 'simulado_respondendo' | 'simulado_segunda_tentativa' | 'resumo_aprofundar' | 'resumo' | 'info' | 'livre';

async function generateResponse(
  question: string,
  docs: Document[],
  history: Array<{ role: string; content: string }>,
  sessionMode: SessionMode = 'livre',
  inlineTheme?: string
): Promise<string> {
  const systemPrompt = buildSystemPrompt(formatContext(docs), formatHistory(history));

  const candidateModels = [
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-flash-lite-latest',
    'gemini-3.5-flash',
    'gemini-3.7-flash',
    'gemini-3.6-flash'
  ];

  const themeToUse = inlineTheme || question;

  // Instrução de contexto de sessão injetada para garantir o modo correto
  let modeInstruction = '';
  let promptSuffix = `Estudante: ${question}`;

  if (sessionMode === 'simulado_tema') {
    modeInstruction = `[MODO ATIVO: SIMULADO DE PROVA — GERAR QUESTÃO 1]
VOCÊ ESTÁ GERANDO UM SIMULADO DE PROVA (OPÇÃO 2) SOBRE O TEMA "${themeToUse}".
NUNCA GERE RESUMO DE CONTEÚDO. NUNCA USE OS TÍTULOS **Explicação:** OU **Exemplo clínico:**. NUNCA INCLUA REFERÊNCIAS EM QUESTÕES DE QUIZ.

GERAR OBRIGATORIAMENTE A QUESTÃO 1 NO SEGUINTE FORMATO EXATO (CADA ALTERNATIVA EM SUA PRÓPRIA LINHA SEPARADA, UMA EMBAIXO DA OUTRA — PROIBIDO LINHA ÚNICA):
**Questão 1:** [Enunciado claro e contextualizado da primeira questão sobre ${themeToUse}]

**A)** [Texto da alternativa A]

**B)** [Texto da alternativa B]

**C)** [Texto da alternativa C]

**D)** [Texto da alternativa D]

Por favor, responda com a letra da alternativa correta (A, B, C ou D).`;
    promptSuffix = `Tema do simulado: ${themeToUse}`;

  } else if (sessionMode === 'simulado_respondendo') {
    modeInstruction = `[MODO ATIVO: QUIZ DA DISCIPLINA — AVALIANDO 1ª TENTATIVA DO ALUNO]
VOCÊ ESTÁ AVALIANDO A 1ª TENTATIVA DO ESTUDANTE NA QUESTÃO DO QUIZ/SIMULADO SOBRE "${themeToUse || 'o tema em estudo'}".
O ESTUDANTE DIGITOU COMO RESPOSTA: "${question}".

ESTA SOLICITAÇÃO É A RESPOSTA DE UMA QUESTÃO DO QUIZ DA DISCIPLINA INT 5224. ELA ESTÁ 100% DENTRO DO ESCOPO DA DISCIPLINA. JAMAIS RECUSE OU USE O TEXTO DE RECUSA PADRÃO. NUNCA INCLUA BLOCO DE REFERÊNCIAS.

INSTRUÇÕES OBRIGATÓRIAS DE RESPOSTA:
1. Se a resposta "${question}" estiver CORRETA:
   - Confirme brevemente a resposta correta (1-2 frases).
   - Apresente a **Questão 2:** sobre o tema "${themeToUse}" com as alternativas **A)**, **B)**, **C)** e **D)** em negrito e cada uma em sua própria linha separada (uma embaixo da outra).
2. Se a resposta "${question}" estiver INCORRETA:
   - Responda EXATAMENTE: "Sua resposta está incorreta. Tente novamente! Qual das alternativas você escolheria agora?"
   - NÃO revele a alternativa correta ainda. NÃO avance para a próxima questão ainda.`;
    promptSuffix = `Resposta do estudante (1ª tentativa no Quiz de ${themeToUse}): ${question}`;

  } else if (sessionMode === 'simulado_segunda_tentativa') {
    modeInstruction = `[MODO ATIVO: QUIZ DA DISCIPLINA — AVALIANDO 2ª TENTATIVA DO ALUNO]
VOCÊ ESTÁ AVALIANDO A 2ª TENTATIVA DO ESTUDANTE NA MESMA QUESTÃO DO QUIZ/SIMULADO SOBRE "${themeToUse || 'o tema em estudo'}".
O ESTUDANTE DIGITOU COMO SEGUNDA RESPOSTA: "${question}".

ESTA SOLICITAÇÃO É A SEGUNDA TENTATIVA DE UMA QUESTÃO DO QUIZ DA DISCIPLINA INT 5224. ELA ESTÁ 100% DENTRO DO ESCOPO DA DISCIPLINA. JAMAIS RECUSE OU USE O TEXTO DE RECUSA PADRÃO. NUNCA INCLUA BLOCO DE REFERÊNCIAS.

INSTRUÇÕES OBRIGATÓRIAS DE RESPOSTA:
1. Se a resposta "${question}" estiver CORRETA:
   - Confirme a resposta correta (1 frase) e apresente a **Questão 2:** sobre "${themeToUse}" com as alternativas **A)**, **B)**, **C)** e **D)** em negrito e cada uma em sua própria linha separada (uma embaixo da outra).
2. Se a resposta "${question}" estiver INCORRETA pela 2ª vez:
   - Revele a resposta correta: "A alternativa correta é a **X)**. [explicação super breve em 1-2 frases]"
   - Apresente em seguida a **Questão 2:** sobre "${themeToUse}" com as alternativas **A)**, **B)**, **C)** e **D)** em negrito e cada uma em sua própria linha separada (uma embaixo da outra).`;
    promptSuffix = `Resposta do estudante (2ª tentativa no Quiz de ${themeToUse}): ${question}`;

  } else if (sessionMode === 'resumo_aprofundar') {
    const targetTopic = themeToUse || 'o tema estudado anteriormente';
    modeInstruction = `[MODO ATIVO: APROFUNDAMENTO DE RESUMO — OPÇÃO 1]
VOCÊ ESTÁ APROFUNDANDO O RESUMO SOBRE O TEMA "${targetTopic}".
NÃO PERGUNTE O TEMA NOVAMENTE. NÃO VOLTE AO MENU. NÃO EXIBA MENSAGEM DE BOAS-VINDAS.

GERAR OBRIGATORIAMENTE O APROFUNDAMENTO NO SEGUINTE FORMATO EXATO:
**Explicação aprofundada:** [Explicação detalhada e aprofundada sobre ${targetTopic}]
**Aspectos avançados:** [Conceitos mais complexos do tema]
**Implicações clínicas:** [Aplicações práticas avançadas na enfermagem]
**Sugestões de estudo complementar:** [Indicações de leitura]
**Referências:**
• Referência: [informações disponíveis no artigo/livro]

Ao final, inclua EXATAMENTE a pergunta:
"Deseja aprofundar este tema, escolher outro tema, voltar ao menu principal ou encerrar a sessão?"`;
    promptSuffix = `Tema a aprofundar: ${targetTopic}`;

  } else if (sessionMode === 'resumo') {
    modeInstruction = `[INSTRUÇÃO OBRIGATÓRIA — MODO RESUMO ATIVO]
O estudante solicitou um resumo sobre "${themeToUse}".
NÃO pergunte o tema novamente. Gere o resumo completo sobre "${themeToUse}" seguindo EXATAMENTE a estrutura obrigatória:
**Explicação:** texto claro e conciso sobre o tema.
**Exemplo clínico:** caso contextualizado na enfermagem perioperatória.
**Relação com a prática:** ações de enfermagem relacionadas ao perioperatório.
**Sugestões de estudo complementar:** indicações para aprofundamento.
**Referências:** (SEMPRE UMA POR LINHA, EM TÓPICOS: "• Referência: [informações disponíveis no artigo]")
Ao final: "Deseja aprofundar este tema, escolher outro tema, voltar ao menu principal ou encerrar a sessão?"`;
    promptSuffix = `Tema solicitado pelo estudante: ${themeToUse}`;
  }

  const prompt = modeInstruction
    ? `${modeInstruction}\n\n${promptSuffix}`
    : `Estudante: ${question}`;

  let text = '';
  let lastErr: any = null;

  for (const modelName of candidateModels) {
    try {
      const model = getGenAI().getGenerativeModel({
        model: modelName,
        systemInstruction: systemPrompt,
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 2500,
        },
      });

      const result = await model.generateContent(prompt);
      text = result.response.text();

      // Garante a presença da pergunta de encerramento sem re-execução custosa
      if ((sessionMode === 'resumo' || sessionMode === 'resumo_aprofundar') && !text.includes('Deseja')) {
        text = `${text.trim()}\n\n` + 'Deseja aprofundar este tema, escolher outro tema, voltar ao menu principal ou encerrar a sessão?';
      }

      if (text && text.trim().length > 0) {
        return normalizeReferencesFormat(text);
      }
    } catch (err: any) {
      lastErr = err;
      console.warn(`[generateResponse] Model ${modelName} failed (${err?.status || err?.message}), tentando próximo modelo imediatamente...`);
    }
  }

  console.error('[generateResponse all candidate models failed]', lastErr);
  return 'Ocorreu uma interrupção na geração da resposta. Vou continuar de onde parei.\n\n' +
    'Por favor, refaça a seleção da opção no menu abaixo para prosseguir com seu estudo.';
}

// ── Histórico e Cache de Estado ───────────────────────────────────────────────

const sessionStateMap = new Map<string, { lastAssistantMsg: string; lastTheme: string }>();

function updateSessionState(sessionId: string, assistantMsg: string, theme?: string) {
  const current = sessionStateMap.get(sessionId) || { lastAssistantMsg: '', lastTheme: '' };
  sessionStateMap.set(sessionId, {
    lastAssistantMsg: assistantMsg,
    lastTheme: theme || current.lastTheme || ''
  });
}

async function getSessionHistory(sessionId: string): Promise<Array<{ role: string; content: string }>> {
  try {
    const { data } = await (getSupabase().from('chat_messages') as any)
      .select('role, content')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
      .limit(12);
    return data || [];
  } catch { return []; }
}

async function saveMessages(sessionId: string, userMsg: string, assistantMsg: string, theme?: string) {
  updateSessionState(sessionId, assistantMsg, theme);
  try {
    await (getSupabase().from('chat_messages') as any).insert([
      { session_id: sessionId, role: 'user', content: userMsg },
      { session_id: sessionId, role: 'assistant', content: assistantMsg },
    ]);
  } catch (e) { console.warn('[save]', e); }
}

// ── HANDLER ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  try {
    const body: ChatRequest = await req.json();
    const { session_id, message } = body;

    if (!message?.trim()) {
      return NextResponse.json({ error: 'Mensagem vazia' }, { status: 400 });
    }

    const question = message.trim();
    const intent = detectIntent(question);

    // ── Rota rápida: saudação/menu inicial → zero tokens de LLM ──────────────
    if (intent === 'greeting') {
      await saveMessages(session_id, question, GREETING_RESPONSE);
      return NextResponse.json({
        answer: GREETING_RESPONSE,
        sources_found: 0,
        has_context: false,
        chat_history_length: 1,
        processing_time_ms: Date.now() - startTime,
      });
    }

    // ── Rota rápida: retorno ao menu → zero tokens de LLM ────────────────────
    if (intent === 'menu_return') {
      await saveMessages(session_id, question, MENU_RETURN_RESPONSE);
      return NextResponse.json({
        answer: MENU_RETURN_RESPONSE,
        sources_found: 0,
        has_context: false,
        chat_history_length: 1,
        processing_time_ms: Date.now() - startTime,
      });
    }

    // ── Rota rápida: encerrar sessão → zero tokens de LLM ───────────────────
    if (intent === 'farewell') {
      await saveMessages(session_id, question, FAREWELL_RESPONSE);
      return NextResponse.json({
        answer: FAREWELL_RESPONSE,
        sources_found: 0,
        has_context: false,
        chat_history_length: 1,
        processing_time_ms: Date.now() - startTime,
      });
    }

    // ── Rota rápida: menu de resumo ───────────────────────────────────────────
    if (intent === 'menu_resumo') {
      await saveMessages(session_id, question, RESUMO_MENU_RESPONSE); // await: próxima msg depende deste histórico
      return NextResponse.json({
        answer: RESUMO_MENU_RESPONSE,
        sources_found: 0,
        has_context: false,
        chat_history_length: 1,
        processing_time_ms: Date.now() - startTime,
      });
    }

    // ── Rota rápida: menu de simulado ─────────────────────────────────────────
    if (intent === 'menu_simulado') {
      await saveMessages(session_id, question, SIMULADO_MENU_RESPONSE); // await: próxima msg depende deste histórico
      return NextResponse.json({
        answer: SIMULADO_MENU_RESPONSE,
        sources_found: 0,
        has_context: false,
        chat_history_length: 1,
        processing_time_ms: Date.now() - startTime,
      });
    }

    // ── Rota rápida: informações da disciplina ───────────────────────────────
    if (intent === 'menu_info') {
      await saveMessages(session_id, question, INFO_MENU_RESPONSE);
      return NextResponse.json({
        answer: INFO_MENU_RESPONSE,
        sources_found: 0,
        has_context: false,
        chat_history_length: 1,
        processing_time_ms: Date.now() - startTime,
      });
    }

    // ── Rota de aprofundamento: continua no mesmo tema sem voltar ao menu ────
    if (intent === 'aprofundar') {
      let historyForAprofundar: Array<{ role: string; content: string }> = [];
      let embeddingForAprofundar: number[] | null = null;
      try {
        historyForAprofundar = await getSessionHistory(session_id);
      } catch (e) {
        console.warn('[aprofundar history]', e);
      }

      // Encontra o último tema estudado pelo usuário (prioriza cache em memória, depois histórico)
      const stateFromMap = sessionStateMap.get(session_id);
      let detectedTheme = stateFromMap?.lastTheme || '';

      if (!detectedTheme) {
        const reversedHistory = [...historyForAprofundar].reverse();
        for (const msg of reversedHistory) {
          if (msg.role === 'user') {
            const normUserMsg = msg.content.toLowerCase().trim();
            if (!/^(menu|voltar|inicio|resumo|simulado|informacoes|encerrar|aprofundar|oi|ola|resumo de conteudo|simulado de prova|informacoes da disciplina|encerrar sessao)$/i.test(normUserMsg)) {
              detectedTheme = msg.content;
              break;
            }
          }
        }
      }

      if (!detectedTheme) {
        detectedTheme = 'O cuidado perioperatório em enfermagem cirúrgica';
      }

      try {
        embeddingForAprofundar = await embedQuery(detectedTheme);
      } catch { }

      const docsAprofundar = embeddingForAprofundar ? await retrieveDocs(embeddingForAprofundar, 0.35) : [];
      const answerAprofundar = await generateResponse(question, docsAprofundar, historyForAprofundar, 'resumo_aprofundar', detectedTheme);
      await saveMessages(session_id, question, answerAprofundar, detectedTheme);
      return NextResponse.json({
        answer: answerAprofundar,
        sources_found: docsAprofundar.length,
        has_context: docsAprofundar.length > 0,
        chat_history_length: historyForAprofundar.length + 2,
        processing_time_ms: Date.now() - startTime,
      });
    }

    // ── Rota de conteúdo: RAG completo + Prompt Mestre ──────────────────────

    let history: Array<{ role: string; content: string }> = [];
    let docs: Document[] = [];

    try {
      history = await getSessionHistory(session_id);
    } catch (e) {
      console.warn('[history]', e);
    }

    // ── Detecção de contexto de sessão ────────────────────────────────────────
    // Prioridade: Atalho Inline > Cache em Memória > Histórico do Assistente
    const stateFromMap = sessionStateMap.get(session_id);
    const lastAssistantMsg = stateFromMap?.lastAssistantMsg || [...history].reverse().find(h => h.role === 'assistant')?.content || '';

    let sessionMode: SessionMode = 'livre';
    let inlineTheme = '';

    const questionNorm = question
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();

    // 0. Detecção de Atalho / Tema Inline na mensagem do estudante
    // A. Simulado / Quiz com tema inline (ex: "Simulado sobre Hemostasia", "queria um quiz sobre dor pos cirurgica", "Quiz sobre Feridas", "2 - Feridas")
    const simuladoInlineMatch = questionNorm.match(/^(?:quero\s+(?:um\s+)?|queria\s+(?:um\s+)?)?(?:fazer\s+)?(?:simulado(?: de prova)?|quiz(?: da disciplina)?|opcao 2|2)\s*(?:sobre|de|da|do|com|-|:)?\s*(.+)$/i);
    if (simuladoInlineMatch) {
      const topicCandidate = simuladoInlineMatch[1].trim();
      if (topicCandidate.length > 0 && !/^(de prova|prova|da disciplina|disciplina)$/i.test(topicCandidate)) {
        sessionMode = 'simulado_tema';
        inlineTheme = question.replace(/^(?:quero\s+(?:um\s+)?|queria\s+(?:um\s+)?)?(?:fazer\s+)?(?:simulado(?: de prova)?|quiz(?: da disciplina)?|opcao 2|2)\s*(?:sobre|de|da|do|com|-|:)?\s*/i, '').trim();
      }
    }

    // B. Resumo com tema inline (ex: "Resumo sobre Feridas", "queria um resumo sobre hemostasia", "1 - Hemostasia")
    if (sessionMode === 'livre') {
      const resumoInlineMatch = questionNorm.match(/^(?:quero\s+(?:um\s+)?|queria\s+(?:um\s+)?)?(?:fazer\s+)?(?:resumo(?: de conteudo)?|opcao 1|1)\s*(?:sobre|de|da|do|com|-|:)?\s*(.+)$/i);
      if (resumoInlineMatch) {
        const topicCandidate = resumoInlineMatch[1].trim();
        if (topicCandidate.length > 0 && !/^(de conteudo|conteudo)$/i.test(topicCandidate)) {
          sessionMode = 'resumo';
          inlineTheme = question.replace(/^(?:quero\s+(?:um\s+)?|queria\s+(?:um\s+)?)?(?:fazer\s+)?(?:resumo(?: de conteudo)?|opcao 1|1)\s*(?:sobre|de|da|do|com|-|:)?\s*/i, '').trim();
        }
      }
    }

    // C. Informações com tema/pergunta inline (ex: "Informações sobre avaliações", "3 - professores")
    if (sessionMode === 'livre') {
      const infoInlineMatch = questionNorm.match(/^(?:quero\s+(?:saber\s+)?|queria\s+(?:saber\s+)?)?(?:informacoes|informacao|opcao 3|3)\s*(?:sobre|de|da|do|com|-|:)?\s*(.+)$/i);
      if (infoInlineMatch) {
        const queryCandidate = infoInlineMatch[1].trim();
        if (queryCandidate.length > 0 && !/^(da disciplina|disciplina)$/i.test(queryCandidate)) {
          sessionMode = 'info';
          inlineTheme = question.replace(/^(?:quero\s+(?:saber\s+)?|queria\s+(?:saber\s+)?)?(?:informacoes|informacao|opcao 3|3)\s*(?:sobre|de|da|do|com|-|:)?\s*/i, '').trim();
        }
      }
    }

    // Se não foi atalho inline, analisa a mensagem anterior do assistente:
    if (sessionMode === 'livre') {
      if (
        lastAssistantMsg.includes('farei três perguntas de múltipla escolha') ||
        lastAssistantMsg.includes('Qual tema você deseja para o simulado')
      ) {
        sessionMode = 'simulado_tema';
      } else if (
        /tente novamente|tentar novamente/i.test(lastAssistantMsg) &&
        /incorret|não está cert/i.test(lastAssistantMsg)
      ) {
        sessionMode = 'simulado_segunda_tentativa';
      } else if (
        /Questão\s*[12345]:/i.test(lastAssistantMsg) ||
        (/\*?\*?[A-D]\)/i.test(lastAssistantMsg) && /responda com a letra|qual das alternativas/i.test(lastAssistantMsg)) ||
        (/Questão/i.test(lastAssistantMsg) && /\*?\*?A\)/i.test(lastAssistantMsg))
      ) {
        sessionMode = 'simulado_respondendo';
      } else if (
        /deseja aprofundar este tema|deseja aprofundar mais/i.test(lastAssistantMsg)
      ) {
        sessionMode = 'resumo_aprofundar';
      } else if (
        lastAssistantMsg.includes('Qual tema da disciplina') ||
        lastAssistantMsg.includes('você deseja estudar')
      ) {
        sessionMode = 'resumo';
      } else if (
        lastAssistantMsg.includes('Deseja fazer outra pergunta, voltar ao menu') ||
        lastAssistantMsg.includes('Informações da Disciplina INT 5224')
      ) {
        sessionMode = 'info';
      }
    }

    // Busca RAG de forma resiliente
    try {
      const isCourseQuery = sessionMode === 'info' ||
        /prof|horar|atend|cron|calend|nota|avali|plano|trabalho|conteudo|carga|disciplin|ementa|frequenc|moodle|email|contato|media|prova/i.test(question);
      const threshold = isCourseQuery ? 0.25 : 0.35;

      const embedding = await embedQuery(question);
      docs = await retrieveDocs(embedding, threshold);

      if (isCourseQuery) {
        docs = [
          {
            content: LOCAL_COURSE_INFO,
            source: 'PLANO ENSINO INT5224 2026-2.pdf',
            similarity: 0.99
          } as any,
          ...docs
        ];
      }
    } catch (e) {
      console.warn('[rag/embedding warning]', e);
    }

    const answer = await generateResponse(question, docs, history, sessionMode, inlineTheme);
    const themeToSave = inlineTheme || (sessionMode === 'simulado_tema' || sessionMode === 'resumo' ? question : '');

    await saveMessages(session_id, question, answer, themeToSave);

    return NextResponse.json({
      answer,
      sources_found: docs.length,
      has_context: docs.length > 0,
      chat_history_length: history.length + 2,
      processing_time_ms: Date.now() - startTime,
    });

  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('[chat] Erro interno:', errMsg);
    return NextResponse.json({ error: `Erro interno do servidor: ${errMsg}` }, { status: 500 });
  }
}
