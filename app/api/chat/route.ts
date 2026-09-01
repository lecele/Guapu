// app/api/chat/route.ts — Tutor de Enfermagem INT 5224
// Prompt Mestre conforme o pacote de prompts v1.3.0 do cliente.

import { randomUUID } from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';

import {
  finalizeGeneratedTurn,
  resolveTurn,
  type FastResponseKey,
  type GenerationMode,
  type ChatActionMode,
} from '@/lib/chat/session-flow';
import {
  findCompletedTurn,
  getSessionHistory,
  inferLegacySessionState,
  loadSessionState,
  saveTurn,
  type ChatHistoryItem,
  type TurnMetadata,
} from '@/lib/chat/session-store';
import { buildCorePrompt, PROMPT_VERSION } from '@/lib/chat/prompts/core';
import { buildFlowPrompt } from '@/lib/chat/prompts/flow';
import { buildModePrompt } from '@/lib/chat/prompts/modes';
import { inferStudentLevel, type StudentLevel } from '@/lib/chat/student-level';
import {
  finalizeReferences,
  isLikelyInfoInsufficient,
  sanitizeStudentFacingText,
} from '@/lib/chat/references';
import { enrichDocumentReferenceMetadata } from '@/lib/chat/document-catalog';
import { buildActivePlanProfessorResponse } from '@/lib/chat/course-catalog';

export const runtime = 'nodejs';
export const maxDuration = 120;

const ACTIVE_PLAN_SOURCE = (
  process.env.ACTIVE_PLAN_SOURCE ||
  'administrativo__plano_ensino_INT55224__plano__ufsc__2026_2.pdf'
).trim();
const INFECTION_CONTROL_SOURCE =
  'infeccao_sitio_cirurgico__enfermeiro_prevencao_infeccao_sitio_cirurgico__artigo__brazilian_journal_health_review__2020__v1';
const ACTIVE_PLAN_YEAR = ACTIVE_PLAN_SOURCE.match(/\b(20\d{2})\b/)?.[1] || String(new Date().getFullYear());
// Referências são parte obrigatória do contrato v1.3.0 e são montadas pela
// aplicação a partir dos chunks recuperados. Não dependem de configuração de
// ambiente para não desaparecerem por erro de implantação.
const RAG_REFERENCES_ENABLED = true;

// ── Respostas fixas (zero tokens de LLM para navegação rápida) ───────────────

const GREETING_RESPONSE =
  'Como posso ajudar? Escolha uma opção ou envie uma pergunta livre relacionada à disciplina:\n' +
  '- Resumo de conteúdo\n' +
  '- Quiz da disciplina\n' +
  '- Informações da disciplina\n' +
  '- Encerrar sessão';

const IDENTITY_RESPONSE =
  'Sou o Guapu, assistente educacional da disciplina INT 5224 — O cuidado no processo de viver humano II: a condição cirúrgica, da Universidade Federal de Santa Catarina (UFSC). Meu propósito é apoiar o estudo de enfermagem no cuidado ao paciente cirúrgico. Não substituo o raciocínio do estudante nem forneço respostas prontas para provas, trabalhos ou avaliações.';

const MENU_RETURN_RESPONSE =
  'Você voltou ao menu principal.\n\n' +
  'Escolha uma opção ou envie uma pergunta livre relacionada à disciplina:\n' +
  '- Resumo de conteúdo\n' +
  '- Quiz da disciplina\n' +
  '- Informações da disciplina\n' +
  '- Encerrar sessão';

const FAREWELL_RESPONSE =
  'Sessão encerrada. Bons estudos! Estarei aqui sempre quando precisar.';

const RESUMO_MENU_RESPONSE =
  'Qual tema da disciplina O cuidado no processo de viver humano II - a condição cirúrgica você deseja estudar?\n\n' +
  '*(Exemplos: Controle de infecção no perioperatório, Feridas, Nomenclatura Cirúrgica, Suturas, Dor pós-operatória, Cuidados pré-operatórios, Avaliação Nutricional, entre outros)*';

const SIMULADO_MENU_RESPONSE =
  'Qual tema você deseja para o quiz da disciplina? Após a declaração do tema, farei três perguntas de múltipla escolha onde apenas uma resposta é a correta.\n\n' +
  '*(Exemplos: Hemostasia, Cirurgia Bariátrica, Estomas, Capacitação Hospitalar, Teleconsulta, Cuidados pós-operatórios, entre outros)*';

const QUIZ_INVALID_RESPONSE =
  'Não entendi sua resposta. Digite apenas a letra da alternativa escolhida: A, B, C ou D.';

const INFO_MENU_RESPONSE =
  'Que informação da disciplina você deseja consultar?\n\n' +
  'Você pode perguntar sobre o plano de ensino, professores, horários, cronograma, avaliações, frequência, trabalhos ou conteúdo programático.';

const INFO_INSUFFICIENT_RESPONSE =
  'Consultar o plano de ensino na página da disciplina no Moodle.';

function insufficientContentResponse(topic: string): string {
  const safeTopic = topic.trim() || 'esse tema';
  return `Não encontrei, nos materiais da disciplina disponíveis, conteúdo suficiente sobre "${safeTopic}". Consulte o Moodle, a secretaria ou os docentes para mais informações. Deseja tentar outro tema ou voltar ao menu principal?`;
}

const TECHNICAL_FALLBACK_RESPONSE =
  'Ocorreu uma falha temporária ao consultar os materiais da disciplina. Tente novamente em instantes ou procure o Moodle e os docentes para confirmar a informação.';


// ── Tipos ─────────────────────────────────────────────────────────────────────

interface ChatRequest {
  session_id: string;
  request_id?: string;
  message: string;
  active_mode?: ChatActionMode;
}

interface Document {
  id: string;
  content: string;
  source: string;
  similarity: number;
  metadata: Record<string, unknown>;
}

interface RetrievalCacheEntry {
  docs: Document[];
  expiresAt: number;
}

interface MatchDocumentRow {
  id?: string;
  content: string;
  source?: string;
  similarity?: number;
  metadata?: Record<string, unknown>;
}

type MatchDocumentsRpc = (
  functionName: 'match_documents' | 'match_documents_filtered' | 'match_documents_hybrid',
  args: {
    query_embedding: number[];
    match_threshold: number;
    match_count: number;
    source_pattern?: string;
    query_text?: string;
  },
) => Promise<{ data: MatchDocumentRow[] | null; error: { message: string } | null }>;

function mapRetrievedDocuments(rows: MatchDocumentRow[] | null): Document[] {
  return (rows || []).map((row) => ({
    id: String(row.id ?? ''),
    content: row.content,
    source: row.source || 'desconhecido',
    similarity: row.similarity || 0,
    metadata: enrichDocumentReferenceMetadata(row.metadata || {}),
  }));
}

function tokenizeForLocalRanking(text: string): string[] {
  const stopWords = new Set([
    'a', 'as', 'o', 'os', 'um', 'uma', 'uns', 'umas', 'de', 'do', 'da', 'dos', 'das',
    'e', 'ou', 'em', 'no', 'na', 'nos', 'nas', 'para', 'por', 'com', 'sobre', 'qual',
    'quais', 'como', 'que', 'o que', 'mais', 'principais',
  ]);
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length >= 3 && !stopWords.has(token));
}

function rankExactSourceDocuments(docs: Document[], queryText?: string): Document[] {
  const queryTokens = tokenizeForLocalRanking(queryText || '');
  if (!queryTokens.length) return docs;
  return [...docs]
    .map((doc, index) => {
      const haystack = `${doc.content} ${doc.source}`.normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase('pt-BR');
      const score = queryTokens.reduce((total, token) => total + (haystack.includes(token) ? 1 : 0), 0);
      return { doc, score, index };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ doc }) => doc);
}

async function retrieveExactSourceDocs(sourcePattern: string, matchCount: number, queryText?: string): Promise<Document[]> {
  const { data, error } = await getSupabase()
    .from('documents')
    .select('id, content, source, metadata')
    .eq('source', sourcePattern)
    .limit(Math.max(matchCount * 6, 30));
  if (error) throw new Error(`EXACT_SOURCE_RETRIEVAL_FAILED: ${error.message}`);

  // This path is used only after an explicit source restriction (for example,
  // the current plan). It keeps legacy Drive chunks usable when the vector RPC
  // is stale, while still excluding staging and unmanaged rows locally.
  const activeDocs = mapRetrievedDocuments(data as MatchDocumentRow[] | null).filter((document) => {
    const status = String(document.metadata.rag_status ?? '').trim().toLowerCase();
    return Boolean(document.metadata.drive_file_id) && (!status || status === 'active');
  });
  return rankExactSourceDocuments(activeDocs, queryText).slice(0, Math.max(matchCount, 5));
}

// Um título citado pelo estudante é uma restrição explícita de escopo, não
// uma tentativa de adivinhar a fonte. Nesses casos usamos a identidade exata
// do arquivo ativo; perguntas genéricas continuam usando a busca híbrida.
function resolveExplicitSourcePattern(query: string): string | undefined {
  const normalized = query
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR');
  const matches = [
    {
      aliases: [
        'plano de ensino',
        'int 5224',
        'int5224',
        'carga horaria',
        'carga horária',
        'periodo do plano',
        'período do plano',
      ],
      source: ACTIVE_PLAN_SOURCE,
    },
    {
      aliases: ['cuidados criticos', 'morton', 'fontaine'],
      source: 'biblioteca__cuidados_criticos_enfermagem__livro__patricia_morton_and_dorrie_fontaine__2011__v9.pdf',
    },
    {
      aliases: [
        'incision care',
        'surgical incision',
        'morgan-jones',
        'wounds international 2022',
        'consenso wounds international 2022',
        'cuidados da incisao cirurgica',
        'cuidados da incisão cirúrgica',
      ],
      source: 'ferida__consenso_ferida_cirurgica__guia__wounds_international__2022__v1',
    },
    {
      aliases: ['brunner', 'suddarth'],
      source: 'biblioteca__tratado_enfermagem_medico_cirurgico__livro__brunner_suddarth__2011__v2.pdf',
    },
    {
      aliases: [
        'diretrizes globais da oms',
        'diretrizes globais para prevencao de infeccao de sitio cirurgico',
        'diretrizes globais para prevenção de infecção de sítio cirúrgico',
        'global guidelines for the prevention of surgical site infection',
        'who surgical site infection',
        'oms para prevencao de infeccao de sitio cirurgico',
        'oms para prevenção de infecção de sítio cirúrgico',
      ],
      source: 'infeccao_sitio_cirurgico__prevention_surgical_site_infection__guia__who__2018__v2.pdf',
    },
    {
      aliases: [
        'nanda',
        'nanda-i',
        'diagnosticos de enfermagem',
        'diagnósticos de enfermagem',
        'diagnostico de enfermagem',
        'diagnóstico de enfermagem',
      ],
      source: 'biblioteca__diagnosticos_enfermagem_definicoes_classificacao__livro__nanda__2023__v12',
    },
    {
      aliases: [
        'anestesia no perioperatorio',
        'anestesia no perioperatório',
        'enfermagem perioperatoria na anestesia',
        'enfermagem perioperatória na anestesia',
        'cuidados de enfermagem relacionados a anestesia',
        'cuidados de enfermagem relacionados à anestesia',
        'atuacao da enfermagem na anestesia',
        'atuação da enfermagem na anestesia',
      ],
      source: 'anestesia__papel_enfermagem_perioperatória_anestesia__artigo__revista_escola_de_enfermagem_da_usp__2021__v1.pdf',
    },
    {
      aliases: [
        'preparo do paciente e sua familia para a alta hospitalar',
        'preparo do paciente e sua família para a alta hospitalar',
        'paciente e sua familia para a alta hospitalar',
        'paciente e sua família para a alta hospitalar',
      ],
      source: 'cuidados_pos__alta_hospitalar__aula__ufsc__nao_disponivel__v1',
    },
    {
      aliases: [
        'guia de preparo de medicamentos injetaveis',
        'guia de preparo de medicamentos injetáveis',
        'preparo de medicamentos injetaveis',
        'preparo de medicamentos injetáveis',
        'ebserh',
      ],
      source: 'dor_pos_operatoria__preparo_medicamentos_injetaveis__guia__ebserh__2019__v1.pdf',
    },
    {
      aliases: [
        'fios e padroes de sutura',
        'fios e padrões de sutura',
        'padroes de sutura',
        'padrões de sutura',
        'fios de sutura',
      ],
      source: 'ferida__fios_padroes_sutura__aula__ufsc__2020__v1',
    },
    {
      aliases: ['dehiscence', 'deiscencia', 'world union', 'surgical wound dehiscence'],
      source: 'ferida__consenso_deiscencia__guia__wounds_international__2018__v1',
    },
    {
      aliases: ['nutrition assessment', 'nancy munoz', 'melissa bernstein'],
      source: 'nutricao__nutrition_assessment__livro__nancy_munoz_melissa_bernstein__2019__v1.pdf',
    },
    {
      aliases: ['resolução cofen', 'resolucao cofen', 'cofen 696', 'telenfermagem'],
      source: 'teleconsulta__resolucao_cofen_telenfermagem__regulamento__cofen__2022__v1',
    },
    {
      aliases: ['praticas recomendadas', 'sobecc'],
      source: 'biblioteca__praticas_recomendadas__livro__sobecc__2013__v6',
    },
    {
      aliases: ['manual tecnico', 'tutor de enfermagem'],
      source: 'Manual Técnico - Tutor de Enfermagem.pdf',
    },
    {
      aliases: ['glossario tecnico', 'glossario'],
      source: 'glossario.docx',
    },
  ];
  return matches.find(({ aliases }) => aliases.some((alias) => normalized.includes(alias)))?.source;
}

function shouldBypassHybridRetrievalForClinicalGrounding(query: string): boolean {
  const normalized = query
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR');

  const asksInfectionControl = (
    /\b(?:controle|prevencao|prevenir|profilaxia).{0,80}\binfeccao\b/.test(normalized) ||
    /\binfeccao\s+(?:do|de)\s+sitio\s+cirurgico\b/.test(normalized)
  );
  const surgicalScope = /\b(?:perioperatorio|centro\s+cirurgico|cirurg(?:ia|ico|ica|ias|icos|icas)|sitio\s+cirurgico)\b/.test(normalized);

  return asksInfectionControl && surgicalScope;
}

function resolveClinicalGroundingSourcePattern(query: string): string | undefined {
  return shouldBypassHybridRetrievalForClinicalGrounding(query) ? INFECTION_CONTROL_SOURCE : undefined;
}

function sourceEmbeddingExpansion(sourcePattern: string): string {
  if (sourcePattern.includes('consenso_ferida_cirurgica')) {
    return 'According to the Wounds International 2022 consensus on incision care and dressing selection in surgical incision wounds, what care is recommended?';
  }
  if (sourcePattern.includes('consenso_deiscencia')) {
    return 'surgical wound dehiscence improving prevention outcomes risk factors';
  }
  return sourcePattern.replace(/[_.-]+/g, ' ');
}

type ResponseKind = 'navigation' | 'summary' | 'quiz_question' | 'quiz_feedback' | 'info' | 'free' | 'fallback';

// ── Roteamento por intenção (sem LLM) ────────────────────────────────────────

// ── Helpers de formatação RAG ─────────────────────────────────────────────────

function formatContext(docs: Document[]): string {
  if (!docs.length) return 'Nenhum material disponível.';
  return docs
    .map((d, i) => {
      const page = Number(d.metadata.page_number);
      const chunk = Number(d.metadata.chunk_index);
      const location = [
        `arquivo: ${d.source}`,
        Number.isFinite(page) && page > 0 ? `página: ${page}` : null,
        Number.isFinite(chunk) && chunk >= 0 ? `trecho: ${chunk + 1}` : null,
      ].filter(Boolean).join('; ');
      return `[${i + 1}] Trecho RAG ${i + 1} (${location}; similaridade: ${d.similarity.toFixed(2)})\n${d.content}`;
    })
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
let _genai: GoogleGenAI | null = null;

const SUPABASE_REQUEST_TIMEOUT_MS = 6_000;
// Evita que uma indisponibilidade do modelo primário deixe o aluno aguardando
// dezenas de segundos antes de cair para o próximo modelo validado.
// Evita que uma indisponibilidade transitória de um modelo segure a resposta
// por toda a cadeia de fallback. O limite mantém tempo para uma tentativa
// normal e deixa a próxima opção assumir rapidamente.
// O prompt RAG completo inclui contexto, histórico e regras de fluxo. O
// limite anterior de 8 s abortava gerações válidas do OpenAI/Moonshot antes
// que pudessem responder; o fallback continuava funcionando, mas mascarava
// a disponibilidade das chaves. Mantemos limite finito para não prender a
// requisição indefinidamente.
const MODEL_REQUEST_TIMEOUT_MS = 20_000;
const MODEL_FAILURE_COOLDOWN_MS = 60_000;
const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
const MOONSHOT_BASE_URL = (process.env.MOONSHOT_BASE_URL || 'https://api.moonshot.ai/v1').replace(/\/$/, '');
const CORPUS_VERSION_TIMEOUT_MS = 800;
const RETRIEVAL_CACHE_TTL_MS = 5 * 60 * 1_000;
const RETRIEVAL_CACHE_MAX_ENTRIES = 128;
const RETRIEVAL_CACHE_ENABLED = process.env.RAG_RETRIEVAL_CACHE_ENABLED === 'true';
const retrievalCache = new Map<string, RetrievalCacheEntry>();
const modelCooldownUntil = new Map<string, number>();

async function fetchSupabaseWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SUPABASE_REQUEST_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_KEY;
  if (!url || !key) throw new Error('CONFIGURATION_MISSING_SUPABASE');
  if (!_supabase) {
    _supabase = createClient(url, key, {
      global: { fetch: fetchSupabaseWithTimeout },
    });
  }
  return _supabase;
}

let _corpusVersionSupabase: ReturnType<typeof createClient> | null = null;

async function fetchCorpusVersionWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CORPUS_VERSION_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function getCorpusVersionSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_KEY;
  if (!url || !key) throw new Error('CONFIGURATION_MISSING_SUPABASE');
  if (!_corpusVersionSupabase) {
    _corpusVersionSupabase = createClient(url, key, {
      global: { fetch: fetchCorpusVersionWithTimeout },
    });
  }
  return _corpusVersionSupabase;
}

async function readCorpusVersion(): Promise<string | null> {
  if (!RETRIEVAL_CACHE_ENABLED) return null;
  try {
    const { data, error } = await getCorpusVersionSupabase().rpc('get_rag_corpus_version');
    if (error || typeof data !== 'string' || !data) return null;
    return data;
  } catch (error) {
    console.warn('[chat] versão do corpus indisponível; seguindo sem cache:', error);
    return null;
  }
}

function normalizeCachePart(value: string | number | null | undefined): string {
  return String(value ?? '').trim().toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ');
}

function retrievalCacheKey(params: {
  query: string;
  threshold: number;
  sourcePattern?: string;
  mode: string;
  corpusVersion: string;
}): string {
  return [
    params.corpusVersion,
    normalizeCachePart(params.query),
    normalizeCachePart(params.threshold),
    normalizeCachePart(params.sourcePattern),
    normalizeCachePart(params.mode),
  ].join('|');
}

function getCachedRetrieval(key: string): Document[] | null {
  const entry = retrievalCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    retrievalCache.delete(key);
    return null;
  }
  retrievalCache.delete(key);
  retrievalCache.set(key, entry);
  return entry.docs;
}

function setCachedRetrieval(key: string, docs: Document[]): void {
  retrievalCache.delete(key);
  retrievalCache.set(key, { docs, expiresAt: Date.now() + RETRIEVAL_CACHE_TTL_MS });
  while (retrievalCache.size > RETRIEVAL_CACHE_MAX_ENTRIES) {
    const oldestKey = retrievalCache.keys().next().value;
    if (typeof oldestKey !== 'string') break;
    retrievalCache.delete(oldestKey);
  }
}

function isHistoricalPlanQuery(text: string): boolean {
  if (/\b(?:plano|documento|vers[aã]o)\s+(?:de\s+ensino\s+)?(?:anterior|antigo|antiga|passado|passada)\b|\bplano\s+anterior\b|\bplano\s+antigo\b/i.test(text)) {
    return true;
  }
  const refersToOfficialMaterial = /\b(?:plano(?:\s+de\s+ensino)?|documento|vers[aã]o)\b/i.test(text);
  if (!refersToOfficialMaterial) return false;
  return [...text.matchAll(/\b(20\d{2})\b/g)].some((match) => match[1] !== ACTIVE_PLAN_YEAR);
}

function isPlanLoadPeriodQuestion(text: string): boolean {
  const normalized = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR');
  return /\b(?:int\s*5224|plano\s+de\s+ensino)\b/.test(normalized)
    && /\b(?:carga\s+horaria|periodo|vigente)\b/.test(normalized);
}

function isProfessorListQuestion(text: string): boolean {
  const normalized = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR');
  // A opção do menu envia apenas “professores”; no modo Informações isso já
  // identifica inequivocamente a consulta da lista do plano vigente.
  return /\b(?:professor|professores|docente|docentes)\b/.test(normalized);
}

function buildPlanLoadPeriodResponse(): string {
  return [
    'Conforme o Plano de Ensino 2026-2 da disciplina INT 5224:',
    '',
    '- **Carga horária total:** 216 horas.',
    '- **Atividades teóricas:** 126 horas.',
    '- **Atividades teórico-práticas:** 90 horas, incluindo 18 horas de Curricularização da Extensão.',
    '- **Carga semanal:** 25 horas teóricas e 30 horas teórico-práticas.',
    '',
    '**Período vigente:** semestre 2026-2.',
  ].join('\n');
}

function getGenAI() {
  const apiKey = process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('CONFIGURATION_MISSING_GEMINI');
  if (!_genai) _genai = new GoogleGenAI({ apiKey });
  return _genai;
}

// ── Embedding ─────────────────────────────────────────────────────────────────

async function embedQuery(text: string): Promise<number[]> {
  const result = await getGenAI().models.embedContent({
    model: 'gemini-embedding-2',
    contents: text,
    config: {
      outputDimensionality: 768,
      taskType: 'RETRIEVAL_QUERY',
    },
  });
  const values = result.embeddings?.[0]?.values;
  if (!values?.length) throw new Error('EMBEDDING_EMPTY');
  return values;
}

// ── Retrieval ─────────────────────────────────────────────────────────────────

async function retrieveDocs(
  embedding: number[],
  threshold = 0.35,
  sourcePattern?: string,
  queryText?: string,
  corpusVersion?: string | null,
  mode = 'livre',
  requestedMatchCount?: number,
): Promise<{ docs: Document[]; cacheHit: boolean }> {
  const cacheKey = RETRIEVAL_CACHE_ENABLED && corpusVersion && queryText
    ? retrievalCacheKey({ query: queryText, threshold, sourcePattern, mode, corpusVersion })
    : null;
  if (cacheKey) {
    const cached = getCachedRetrieval(cacheKey);
    if (cached) return { docs: cached, cacheHit: true };
  }

  const supabase = getSupabase();
  const matchDocuments = supabase.rpc.bind(supabase) as unknown as MatchDocumentsRpc;
  const configuredMatchCount = parseInt(process.env.RAG_MATCH_COUNT || '5');
  const matchCount = requestedMatchCount ?? configuredMatchCount;
  // A recuperação híbrida é o caminho padrão de produção: a variável só
  // pode desligá-la explicitamente para diagnóstico controlado.
  const hybridEnabled = process.env.RAG_HYBRID_ENABLED !== 'false';

  // Se a pergunta já restringe uma obra/fonte, a leitura exata dessa fonte é
  // mais segura e barata que esperar RPC vetorial. O RPC fica como fallback
  // quando a fonte exata não retornar chunks ativos.
  if (sourcePattern) {
    try {
      const exactSourceDocuments = await retrieveExactSourceDocs(sourcePattern, matchCount, queryText);
      if (exactSourceDocuments.length) {
        if (cacheKey) setCachedRetrieval(cacheKey, exactSourceDocuments);
        return { docs: exactSourceDocuments, cacheHit: false };
      }
    } catch {
      // Mantém o caminho vetorial abaixo como segunda tentativa.
    }
  }

  const strategies: Array<{
    functionName: 'match_documents' | 'match_documents_filtered' | 'match_documents_hybrid';
    args: Parameters<MatchDocumentsRpc>[1];
    attempts: number;
    sourceOnly?: boolean;
  }> = sourcePattern
    ? [
      {
        functionName: 'match_documents_filtered',
        args: { query_embedding: embedding, match_threshold: threshold, match_count: matchCount, source_pattern: sourcePattern },
        attempts: 2,
      },
      // Alguns lotes antigos do Supabase foram indexados antes da função
      // filtrada existir. O fallback consulta candidatos vetoriais e aplica
      // o mesmo escopo localmente, sem permitir mistura de obras.
      {
        functionName: 'match_documents',
        args: { query_embedding: embedding, match_threshold: -1, match_count: Math.max(matchCount, 20) },
        attempts: 1,
        sourceOnly: true,
      },
    ]
    : [
      ...(hybridEnabled && queryText
        ? [{
          functionName: 'match_documents_hybrid' as const,
          args: { query_embedding: embedding, match_threshold: threshold, match_count: matchCount, query_text: queryText },
          attempts: 1,
        }]
        : []),
      {
        functionName: 'match_documents' as const,
        args: { query_embedding: embedding, match_threshold: threshold, match_count: matchCount },
        attempts: 2,
      },
    ];

  let lastError = 'erro desconhecido';
  for (const strategy of strategies) {
    for (let attempt = 1; attempt <= strategy.attempts; attempt += 1) {
      try {
        const { data, error } = await matchDocuments(strategy.functionName, strategy.args);
        if (!error) {
          const documents = mapRetrievedDocuments(data);
          const scopedDocuments = strategy.sourceOnly
            ? documents.filter((document) => document.source.toLocaleLowerCase('pt-BR') === sourcePattern?.toLocaleLowerCase('pt-BR'))
            : documents;
          // Um híbrido sem candidatos não deve bloquear uma resposta que a
          // busca semântica ainda consegue fundamentar.
          const keepTryingForScopedMiss = Boolean(sourcePattern) && scopedDocuments.length === 0;
          if (!keepTryingForScopedMiss && (scopedDocuments.length || strategy.functionName !== 'match_documents_hybrid')) {
            if (cacheKey && scopedDocuments.length) setCachedRetrieval(cacheKey, scopedDocuments);
            return { docs: scopedDocuments, cacheHit: false };
          }
        } else {
          lastError = error.message;
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
      if (attempt < strategy.attempts) {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
  }
  if (sourcePattern) {
    try {
      const exactSourceDocuments = await retrieveExactSourceDocs(sourcePattern, matchCount, queryText);
      if (exactSourceDocuments.length) {
        if (cacheKey) setCachedRetrieval(cacheKey, exactSourceDocuments);
        return { docs: exactSourceDocuments, cacheHit: false };
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  throw new Error(`RETRIEVAL_FAILED: ${lastError}`);
}

// ── System Prompt Mestre (Prompt 20Aug2026 — 15 seções) ──────────────────────

// ── Geração de resposta ───────────────────────────────────────────────────────

interface GenerationResult {
  text: string;
  modelRequested: string;
  modelUsed: string | null;
  fallbackUsed: boolean;
  fallbackReason: string | null;
  errorCode: string | null;
  latencyMs: number;
}

type ChatProvider = 'openai' | 'moonshot' | 'gemini';
type CandidateModel = { provider: ChatProvider; name: string };

async function generateOpenAIResponse(
  modelName: string,
  systemPrompt: string,
  prompt: string,
  maxOutputTokens: number,
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_NOT_CONFIGURED');
  const body: Record<string, unknown> = {
    model: modelName,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt },
    ],
  };
  if (modelName.startsWith('gpt-5')) body.max_completion_tokens = maxOutputTokens;
  else {
    body.max_tokens = maxOutputTokens;
    body.temperature = 0;
  }
  const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(MODEL_REQUEST_TIMEOUT_MS),
  });
  const payload = await response.json() as { error?: { message?: string }; choices?: Array<{ message?: { content?: string } }> };
  if (!response.ok) throw new Error(`OPENAI_${response.status}:${payload.error?.message || 'request_failed'}`);
  const text = payload.choices?.[0]?.message?.content ?? '';
  if (!text.trim()) throw new Error('OPENAI_EMPTY_RESPONSE');
  return text;
}

async function generateMoonshotResponse(
  modelName: string,
  systemPrompt: string,
  prompt: string,
  maxOutputTokens: number,
): Promise<string> {
  const apiKey = process.env.MOONSHOT_API_KEY;
  if (!apiKey) throw new Error('MOONSHOT_NOT_CONFIGURED');
  const response = await fetch(`${MOONSHOT_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: modelName,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      temperature: 1,
      max_tokens: maxOutputTokens,
    }),
    signal: AbortSignal.timeout(MODEL_REQUEST_TIMEOUT_MS),
  });
  const payload = await response.json() as { error?: { message?: string }; choices?: Array<{ message?: { content?: string } }> };
  if (!response.ok) throw new Error(`MOONSHOT_${response.status}:${payload.error?.message || 'request_failed'}`);
  const text = payload.choices?.[0]?.message?.content ?? '';
  if (!text.trim()) throw new Error('MOONSHOT_EMPTY_RESPONSE');
  return text;
}

async function generateWithProvider(
  candidate: CandidateModel,
  systemPrompt: string,
  prompt: string,
  maxOutputTokens: number,
): Promise<string> {
  if (candidate.provider === 'openai') return generateOpenAIResponse(candidate.name, systemPrompt, prompt, maxOutputTokens);
  if (candidate.provider === 'moonshot') return generateMoonshotResponse(candidate.name, systemPrompt, prompt, maxOutputTokens);
  const result = await getGenAI().models.generateContent({
    model: candidate.name,
    contents: prompt,
    config: {
      systemInstruction: systemPrompt,
      maxOutputTokens,
      abortSignal: AbortSignal.timeout(MODEL_REQUEST_TIMEOUT_MS),
    },
  });
  return result.text ?? '';
}

function maxOutputTokensForMode(mode: GenerationMode): number {
  if (mode === 'simulado_tema' || mode === 'simulado_respondendo' || mode === 'simulado_segunda_tentativa') {
    return 900;
  }
  if (mode === 'info') return 1_200;
  if (mode === 'resumo' || mode === 'resumo_aprofundar') return 1_800;
  return 1_600;
}

async function generateResponse(
  question: string,
  docs: Document[],
  history: Array<{ role: string; content: string }>,
  sessionMode: GenerationMode = 'livre',
  inlineTheme?: string,
  quizQuestion = 0,
  sessionState = 'LIVRE',
  activeMode = 'livre',
  completionRequirement?: string,
  referenceSourcePattern?: string,
  studentLevel?: StudentLevel,
): Promise<GenerationResult> {
  const generationStartedAt = Date.now();
  const effectiveStudentLevel = studentLevel ?? inferStudentLevel(history as ChatHistoryItem[]);
  const systemPrompt = `${buildCorePrompt({
    context: formatContext(docs),
    history: formatHistory(history),
    studentLevel: effectiveStudentLevel,
  })}\n\n${buildFlowPrompt({ state: sessionState, mode: activeMode, topic: inlineTheme || '', quizQuestion, studentLevel: effectiveStudentLevel })}`;

  // A ordem pode ser canariada por ambiente sem tocar no RAG. A estratégia
  // recomendada é OpenAI -> Moonshot -> Gemini; sem as novas chaves, o app
  // preserva automaticamente a cadeia Gemini já validada.
  const requestedGeminiModel = process.env.GEMINI_CHAT_MODEL ?? 'gemini-2.5-flash-lite';
  const primaryProvider = (process.env.CHAT_PRIMARY_PROVIDER ||
    (process.env.OPENAI_API_KEY ? 'openai' : process.env.MOONSHOT_API_KEY ? 'moonshot' : 'gemini')).trim() as ChatProvider;
  const openaiModel = process.env.OPENAI_CHAT_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const moonshotModel = process.env.MOONSHOT_CHAT_MODEL || process.env.MOONSHOT_MODEL || 'kimi-k3';
  const geminiCandidates: CandidateModel[] = [
    requestedGeminiModel,
    'gemini-2.5-flash-lite',
    'gemini-2.5-flash',
  ].map((name) => ({ provider: 'gemini', name }));
  const providerCandidates: Record<ChatProvider, CandidateModel[]> = {
    openai: [
      { provider: 'openai', name: openaiModel },
      { provider: 'moonshot', name: moonshotModel },
      ...geminiCandidates,
    ],
    moonshot: [
      { provider: 'moonshot', name: moonshotModel },
      { provider: 'openai', name: openaiModel },
      ...geminiCandidates,
    ],
    gemini: geminiCandidates,
  };
  const candidateModels = providerCandidates[primaryProvider] || providerCandidates.gemini;

  const effectiveCompletionRequirement = [
    completionRequirement,
    isPostoperativeImmediateQuestion(question) ? POSTOPERATIVE_COVERAGE_REQUIREMENT : '',
  ].filter(Boolean).join('\n\n');

  const prompt = `${buildModePrompt({
    mode: sessionMode,
    question,
    topic: inlineTheme || question,
    quizQuestion,
  })}${effectiveCompletionRequirement ? `\n\n[VALIDAÇÃO OBRIGATÓRIA]\n${effectiveCompletionRequirement}` : ''}`;

  let text = '';
  let lastErrorMessage = '';

  for (let index = 0; index < candidateModels.length; index += 1) {
    const candidate = candidateModels[index];
    const modelKey = `${candidate.provider}:${candidate.name}`;
    const cooldownUntil = modelCooldownUntil.get(modelKey) ?? 0;
    if (cooldownUntil > Date.now()) {
      lastErrorMessage = `MODEL_COOLDOWN:${modelKey}`;
      continue;
    }

    try {
      text = await generateWithProvider(
        candidate,
        systemPrompt,
        prompt,
        maxOutputTokensForMode(sessionMode),
      );

      // Garante a presença da pergunta de encerramento sem re-execução custosa
      if (
        (sessionMode === 'resumo' || sessionMode === 'resumo_aprofundar' || sessionMode === 'resumo_reformular') &&
        !text.includes('Deseja')
      ) {
        text = `${text.trim()}\n\n` + 'Deseja aprofundar este tema, escolher outro tema, voltar ao menu principal ou encerrar a sessão?';
      }

      if (text && text.trim().length > 0) {
        return {
          text: finalizeReferences(
            text,
            docs,
            sessionMode,
            RAG_REFERENCES_ENABLED,
            `${question}\n${inlineTheme}${referenceSourcePattern ? `\n__SOURCE_SCOPE__${referenceSourcePattern}__` : ''}`,
          ),
          modelRequested: candidateModels[0].name,
          modelUsed: candidate.name,
          fallbackUsed: index !== 0,
          fallbackReason: index !== 0 ? 'PRIMARY_MODEL_FAILED' : null,
          errorCode: null,
          latencyMs: Date.now() - generationStartedAt,
        };
      }
      lastErrorMessage = 'EMPTY_MODEL_RESPONSE';
    } catch (error: unknown) {
      lastErrorMessage = error instanceof Error ? error.message : String(error);
      if (/(?:503|UNAVAILABLE|429|RESOURCE_EXHAUSTED|aborted|timeout)/i.test(lastErrorMessage)) {
        modelCooldownUntil.set(modelKey, Date.now() + MODEL_FAILURE_COOLDOWN_MS);
      }
      console.warn(
        `[generateResponse] Model ${modelKey} falhou; tentando o próximo modelo: ${lastErrorMessage.slice(0, 200)}`,
      );
    }
  }

  console.error('[generateResponse] Todos os modelos falharam:', lastErrorMessage.slice(0, 200));
  return {
    text: 'Ocorreu uma interrupção temporária na geração da resposta. Por favor, tente novamente em instantes.',
    modelRequested: candidateModels[0].name,
    modelUsed: null,
    fallbackUsed: true,
    fallbackReason: 'ALL_MODELS_FAILED',
    errorCode: 'MODEL_FAILED',
    latencyMs: Date.now() - generationStartedAt,
  };
}

function requiresNextQuizQuestion(decision: ReturnType<typeof resolveTurn>, answer: string): boolean {
  if (
    decision.generationMode !== 'simulado_respondendo' &&
    decision.generationMode !== 'simulado_segunda_tentativa'
  ) return false;
  const currentQuestion = Math.max(1, decision.quizQuestion);
  if (currentQuestion >= 3) return false;
  if (/resposta est[aá] incorreta[\s\S]{0,80}tente novamente/i.test(answer)) return false;
  return !new RegExp(`quest[aã]o\\s*${currentQuestion + 1}\\s*:`, 'i').test(answer);
}

function isPostoperativeImmediateQuestion(question: string): boolean {
  const normalizedQuestion = question.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return /principais cuidados.*pos-?operatorio imediato/i.test(normalizedQuestion);
}

function needsClinicalCoverageRepair(question: string, answer: string): boolean {
  if (!isPostoperativeImmediateQuestion(question)) return false;

  // O RAG já fornece estes eixos nos materiais recuperados. A verificação
  // evita que uma resposta correta, porém incompleta, omita um cuidado central.
  return !/sinais vitais/i.test(answer)
    || !/respirat/i.test(answer)
    || !/(?:dor|conforto|analges)/i.test(answer);
}

function answerBodyBeforeReferences(answer: string): string {
  return answer.split(/\n\s*\*\*Refer[êe]ncias\*\*/i)[0].trim();
}

function isClinicalQuestion(question: string): boolean {
  return /\b(?:perioperat[oó]rio|cir[uú]rgic|cirurgia|infec[cç][aã]o|ferida|curativo|sutura|enfermagem)\b/i.test(question);
}

function asksForExample(question: string): boolean {
  return /\b(?:exemplo|caso|situa[cç][aã]o|cen[aá]rio)\b/i.test(question);
}

function hasExampleSection(answer: string): boolean {
  return /\b(?:exemplo|caso|cen[aá]rio|por exemplo|paciente)\b/i.test(answer);
}

function isLikelyTruncatedAnswer(answer: string): boolean {
  const body = answerBodyBeforeReferences(answer).replace(/\s+/g, ' ').trim();
  if (!body) return false;
  return /(?:[,;:—-]|\b(?:a|as|o|os|de|do|da|das|dos|em|no|na|nos|nas|com|para|por|que|e|ou|se|como|quando|embora|durante|entre|incluindo))$/i.test(body);
}

function needsClinicalCompletenessRepair(question: string, answer: string): boolean {
  if (!isClinicalQuestion(question)) return false;
  const body = answerBodyBeforeReferences(answer);
  return isLikelyTruncatedAnswer(answer) || (asksForExample(question) && !hasExampleSection(body));
}

const CLINICAL_COMPLETENESS_REQUIREMENT = [
  'A resposta anterior ficou incompleta ou deixou de atender a um item pedido.',
  'Refaça de forma objetiva, completa e curta, usando somente os trechos disponíveis.',
  'Inclua uma explicação, um exemplo clínico de enfermagem quando o estudante pedir exemplo, e a relação com a prática profissional.',
  'Não interrompa frases; se algum ponto não estiver sustentado pelos materiais disponíveis, declare essa limitação sem completar por conta própria.',
].join(' ');

const POSTOPERATIVE_COVERAGE_REQUIREMENT = `Revise a resposta antes de finalizá-la. Como a pergunta pede os principais cuidados no pós-operatório imediato, organize os cuidados sustentados pelos trechos RAG e inclua explicitamente os três rótulos abaixo, quando houver evidência no contexto: "Sinais vitais", "Avaliação respiratória" e "Dor e conforto". Desenvolva cada eixo em uma frase objetiva e acrescente os demais cuidados relevantes encontrados. Não invente condutas nem informações ausentes; se algum eixo não estiver sustentado, declare essa limitação.`;

// ── Histórico e Cache de Estado ───────────────────────────────────────────────

// ── HANDLER ───────────────────────────────────────────────────────────────────

const EMBEDDING_MODEL = 'gemini-embedding-2';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SESSION_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

async function saveTurnBounded(
  supabase: ReturnType<typeof createClient>,
  params: Parameters<typeof saveTurn>[1],
): Promise<void> {
  const persistence = saveTurn(supabase, params).catch((error) => {
    console.warn('[chat] Falha ao persistir telemetria:', error);
  });
  await Promise.race([
    persistence,
    new Promise<void>((resolve) => setTimeout(resolve, 1_500)),
  ]);
}

const FAST_RESPONSES: Record<FastResponseKey, string> = {
  greeting: GREETING_RESPONSE,
  identity: IDENTITY_RESPONSE,
  menu: MENU_RETURN_RESPONSE,
  farewell: FAREWELL_RESPONSE,
  resumo_menu: RESUMO_MENU_RESPONSE,
  quiz_menu: SIMULADO_MENU_RESPONSE,
  quiz_invalid: QUIZ_INVALID_RESPONSE,
  info_menu: INFO_MENU_RESPONSE,
};

function buildTurnMetadata(params: {
  requestId: string;
  mode: TurnMetadata['mode'];
  stateBefore: TurnMetadata['state_before'];
  stateAfter: TurnMetadata['state_after'];
  topic: string;
  quizQuestion: number;
  quizAttempt: number;
  docs: Document[];
  retrievalCacheHit: boolean;
  modelRequested: string | null;
  modelUsed: string | null;
  fallbackUsed: boolean;
  fallbackReason: string | null;
  embeddingLatency: number;
  retrievalLatency: number;
  generationLatency: number;
  totalLatency: number;
  errorCode: string | null;
  corpusVersion: string | null;
}): TurnMetadata {
  return {
    request_id: params.requestId,
    flow_version: 'v1',
    prompt_version: PROMPT_VERSION,
    mode: params.mode,
    state_before: params.stateBefore,
    state_after: params.stateAfter,
    current_topic: params.topic,
    quiz_question: params.quizQuestion,
    quiz_attempt: params.quizAttempt,
    model_requested: params.modelRequested,
    model_used: params.modelUsed,
    fallback_used: params.fallbackUsed,
    fallback_reason: params.fallbackReason,
    embedding_model: params.docs.length > 0 ? EMBEDDING_MODEL : null,
    has_context: params.docs.length > 0,
    sources_found: params.docs.length,
    retrieval_cache_hit: params.retrievalCacheHit,
    retrieval: params.docs.map((doc, index) => ({
      document_id: doc.id || `source:${doc.source}:${index + 1}`,
      source: doc.source,
      rank: index + 1,
      similarity: doc.similarity,
      drive_file_id: typeof doc.metadata.drive_file_id === 'string' ? doc.metadata.drive_file_id : null,
      content_hash: typeof doc.metadata.content_hash === 'string' ? doc.metadata.content_hash : null,
      page_number: Number.isFinite(Number(doc.metadata.page_number)) ? Number(doc.metadata.page_number) : null,
      chunk_index: Number.isFinite(Number(doc.metadata.chunk_index)) ? Number(doc.metadata.chunk_index) : null,
      reference_section: typeof doc.metadata.reference_section === 'string' ? doc.metadata.reference_section : null,
    })),
    latency_ms: {
      embedding: params.embeddingLatency,
      retrieval: params.retrievalLatency,
      generation: params.generationLatency,
      total: params.totalLatency,
    },
    error_code: params.errorCode,
    corpus_version: params.corpusVersion,
  };
}

function chatResponse(params: {
  answer: string;
  sessionId: string;
  requestId: string;
  sourcesFound: number;
  historyLength: number;
  processingTimeMs: number;
  responseKind: ResponseKind;
}) {
  return NextResponse.json({
    answer: params.answer,
    session_id: params.sessionId,
    request_id: params.requestId,
    sources_found: params.sourcesFound,
    has_context: params.sourcesFound > 0,
    chat_history_length: params.historyLength,
    processing_time_ms: params.processingTimeMs,
    response_kind: params.responseKind,
  });
}

function generatedResponseKind(mode: GenerationMode, answer: string): ResponseKind {
  if (mode === 'resumo' || mode === 'resumo_aprofundar' || mode === 'resumo_reformular') return 'summary';
  if (mode === 'info') return 'info';
  if (mode === 'simulado_tema') return 'quiz_question';
  if (mode === 'simulado_respondendo' || mode === 'simulado_segunda_tentativa') {
    return /quest[aã]o\s*\d+\s*:/i.test(answer) ? 'quiz_question' : 'quiz_feedback';
  }
  return 'free';
}

async function enqueueQualityEvaluation(
  supabase: ReturnType<typeof createClient>,
  sessionId: string,
  requestId: string,
): Promise<void> {
  const { error } = await supabase.rpc('enqueue_response_quality_evaluation' as never, {
    p_session_id: sessionId,
    p_request_id: requestId,
  } as never);
  if (error) throw new Error(`QUALITY_EVALUATION_ENQUEUE_FAILED: ${error.message}`);
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  let requestId: string = randomUUID();

  try {
    const body = await req.json().catch(() => null) as Partial<ChatRequest> | null;
    const sessionId = typeof body?.session_id === 'string' ? body.session_id.trim() : '';
    const question = typeof body?.message === 'string' ? body.message.trim() : '';
    const activeMode = body?.active_mode;

    if (body?.request_id) {
      if (!UUID_PATTERN.test(body.request_id)) {
        return NextResponse.json(
          { error: 'Requisição inválida', error_code: 'INVALID_REQUEST', request_id: requestId },
          { status: 400 },
        );
      }
      requestId = body.request_id;
    }

    if (
      !SESSION_ID_PATTERN.test(sessionId) ||
      (!question && !activeMode) ||
      question.length > 8_000 ||
      (activeMode !== undefined && !['resumo', 'quiz', 'info', 'encerrar'].includes(activeMode))
    ) {
      return NextResponse.json(
        { error: 'Sessão ou mensagem inválida', error_code: 'INVALID_REQUEST', request_id: requestId },
        { status: 400 },
      );
    }

    const supabase = getSupabase();
    // As duas leituras são independentes. Executá-las em paralelo remove uma
    // ida sequencial ao Supabase sem alterar a ordem do histórico nem a
    // idempotência por request_id.
    const [history, completedTurn] = await Promise.all([
      getSessionHistory(supabase, sessionId),
      findCompletedTurn(supabase, sessionId, requestId),
    ]);

    if (completedTurn) {
      const metadata = completedTurn.metadata;
      return chatResponse({
        answer: completedTurn.content,
        sessionId,
        requestId,
        sourcesFound: Number(metadata.sources_found ?? 0),
        historyLength: history.length,
        processingTimeMs: Date.now() - startedAt,
        responseKind: 'navigation',
      });
    }

    let sessionState;
    try {
      sessionState = await loadSessionState(supabase, sessionId, history);
    } catch (error) {
      console.warn('[chat] Falha ao carregar estado persistente; usando inferência legada.', error);
      sessionState = inferLegacySessionState(sessionId, history);
    }

    const decision = resolveTurn(sessionState, question, activeMode);

    if (decision.kind === 'fast' && decision.fastResponse) {
      const answer = FAST_RESPONSES[decision.fastResponse];
      const totalLatency = Date.now() - startedAt;
      const metadata = buildTurnMetadata({
        requestId,
        mode: decision.stateAfter.mode,
        stateBefore: decision.stateBefore.state,
        stateAfter: decision.stateAfter.state,
        topic: decision.topic,
        quizQuestion: decision.stateAfter.quizQuestion,
        quizAttempt: decision.stateAfter.quizAttempt,
        docs: [],
        retrievalCacheHit: false,
        modelRequested: null,
        modelUsed: null,
        fallbackUsed: false,
        fallbackReason: null,
        embeddingLatency: 0,
        retrievalLatency: 0,
        generationLatency: 0,
        totalLatency,
        errorCode: null,
        corpusVersion: null,
      });

      await saveTurnBounded(supabase, {
        sessionId,
        requestId,
        userMessage: question,
        assistantMessage: answer,
        state: decision.stateAfter,
        metadata,
      });

      return chatResponse({
        answer,
        sessionId,
        requestId,
        sourcesFound: 0,
        historyLength: history.length + 2,
        processingTimeMs: Date.now() - startedAt,
        responseKind: 'navigation',
      });
    }

    let docs: Document[] = [];
    let embeddingLatency = 0;
    let retrievalLatency = 0;
    let retrievalErrorCode: string | null = null;
    let retrievalCacheHit = false;
    const corpusVersionPromise = readCorpusVersion();
    let corpusVersion: string | null = null;
    const searchQuery = decision.topic || question;
    const explicitSourcePattern = resolveExplicitSourcePattern(question);
    const bypassHybridRetrieval = shouldBypassHybridRetrievalForClinicalGrounding(searchQuery);
    const professorListQuestion = isProfessorListQuestion(searchQuery);
    const retrievalSourcePattern =
      decision.generationMode === 'info'
        ? ACTIVE_PLAN_SOURCE
        : explicitSourcePattern ?? resolveClinicalGroundingSourcePattern(searchQuery);

    try {
      const embeddingStartedAt = Date.now();
      const embeddingQuery = explicitSourcePattern
        ? explicitSourcePattern.includes('consenso_ferida_cirurgica')
          ? sourceEmbeddingExpansion(explicitSourcePattern)
          : `${searchQuery}\nFonte citada: ${sourceEmbeddingExpansion(explicitSourcePattern)}`
        : searchQuery;
      const embedding = await embedQuery(embeddingQuery);
      embeddingLatency = Date.now() - embeddingStartedAt;
      corpusVersion = await corpusVersionPromise;

      const retrievalStartedAt = Date.now();
      const isCourseQuery =
        decision.generationMode === 'info' ||
        /prof|hor[aá]r|atend|cron|calend|nota|avali|plano|trabalho|conte[uú]do|carga|disciplin|ementa|frequ[eê]nc|moodle|email|contato|m[eé]dia|prova/i.test(searchQuery);
      // Use a pergunta original para não perder o nome da obra quando o
      // roteador reduz o texto a um tema antes da recuperação.
      const retrieval = await retrieveDocs(
        embedding,
        decision.generationMode === 'info' || retrievalSourcePattern ? -1 : isCourseQuery ? 0.25 : 0.35,
        retrievalSourcePattern,
        bypassHybridRetrieval && !retrievalSourcePattern ? undefined : searchQuery,
        corpusVersion,
        decision.generationMode ?? 'livre',
        professorListQuestion ? 12 : undefined,
      );
      docs = retrieval.docs;
      retrievalCacheHit = retrieval.cacheHit;
      retrievalLatency = Date.now() - retrievalStartedAt;

      // Perguntas sobre versões antigas não podem ser respondidas com trechos
      // genéricos de outros livros. Se a versão histórica não está na base
      // vigente, o comportamento seguro é o fallback de contexto insuficiente.
      if (isHistoricalPlanQuery(searchQuery)) {
        docs = [];
        retrievalErrorCode = 'NO_RELEVANT_CONTEXT';
      }

      if (docs.length === 0) retrievalErrorCode = 'NO_RELEVANT_CONTEXT';
    } catch (error) {
      retrievalErrorCode = embeddingLatency === 0 ? 'EMBEDDING_FAILED' : 'RETRIEVAL_FAILED';
      console.warn(`[chat] ${retrievalErrorCode} para request_id=${requestId}`, error);
    }

    // A versão do corpus existe no banco para auditoria e futura invalidação
    // de cache, mas não é consultada no caminho crítico do aluno. A leitura
    // será ativada somente com timeout/telemetria próprios.

    let answer: string;
    let finalState = decision.stateAfter;
    let modelRequested: string | null = null;
    let modelUsed: string | null = null;
    let fallbackUsed = false;
    let fallbackReason: string | null = null;
    let generationLatency = 0;
    let generationErrorCode: string | null = null;

    if (docs.length === 0) {
      answer = retrievalErrorCode === 'NO_RELEVANT_CONTEXT'
        ? decision.generationMode === 'info'
          ? INFO_INSUFFICIENT_RESPONSE
          : insufficientContentResponse(decision.topic || searchQuery)
        : TECHNICAL_FALLBACK_RESPONSE;
      finalState = decision.stateBefore;
      fallbackUsed = true;
      fallbackReason = retrievalErrorCode;
    } else if (
      professorListQuestion
      && docs.length > 0
      && docs.every((doc) => doc.source === ACTIVE_PLAN_SOURCE)
    ) {
      // A lista oficial é um fato administrativo estruturado. Depois de
      // confirmar que a recuperação está restrita ao plano vigente, usamos
      // o catálogo verificado para impedir omissões e variações entre modelos
      // ou dispositivos.
      answer = buildActivePlanProfessorResponse();
      modelUsed = 'deterministic-active-plan-catalog';
      finalState = finalizeGeneratedTurn(decision, answer);
    } else if (
      isPlanLoadPeriodQuestion(question)
      && docs.length > 0
      && docs.every((doc) => doc.source === ACTIVE_PLAN_SOURCE)
    ) {
      // Fatos administrativos estruturados não devem depender de uma
      // geração probabilística que pode trocar total, semanal e modalidade.
      // Os números abaixo são os campos da tabela de carga horária da p. 1;
      // a referência ainda é montada deterministicamente pelo catálogo.
      answer = finalizeReferences(
        buildPlanLoadPeriodResponse(),
        docs,
        decision.generationMode ?? 'livre',
        RAG_REFERENCES_ENABLED,
        question,
      );
      modelUsed = 'deterministic-plan-facts';
      finalState = finalizeGeneratedTurn(decision, answer);
    } else {
      const generation = await generateResponse(
        question,
        docs,
        history.slice(-12) as ChatHistoryItem[],
        decision.generationMode ?? 'livre',
        decision.topic,
        decision.quizQuestion,
        decision.stateBefore.state,
        decision.stateBefore.mode,
        professorListQuestion
          ? 'Para esta pergunta administrativa, liste todos os professores que aparecem no plano atual recuperado, usando o nome completo exatamente como está no contexto. Não abrevie nomes, não deduza nomes ausentes e não substitua a lista por exemplos. Se houver mais de um trecho do plano, consolide todos os nomes sem repetir.\n'
          : undefined,
        retrievalSourcePattern,
      );
      answer = generation.text;
      modelRequested = generation.modelRequested;
      modelUsed = generation.modelUsed;
      fallbackUsed = generation.fallbackUsed;
      fallbackReason = generation.fallbackReason;
      generationLatency = generation.latencyMs;
      generationErrorCode = generation.errorCode;
      if (
        !generationErrorCode &&
        decision.generationMode === 'info' &&
        isLikelyInfoInsufficient(question, answer)
      ) {
        answer = 'Consultar o plano de ensino na página da disciplina no Moodle.';
        finalState = decision.stateBefore;
      } else {
        answer = sanitizeStudentFacingText(answer);
      }
      if (!generation.errorCode && needsClinicalCoverageRepair(question, answer)) {
        const repair = await generateResponse(
          question,
          docs,
          history.slice(-12) as ChatHistoryItem[],
          decision.generationMode ?? 'livre',
          decision.topic,
          decision.quizQuestion,
          decision.stateBefore.state,
          decision.stateBefore.mode,
          POSTOPERATIVE_COVERAGE_REQUIREMENT,
          retrievalSourcePattern,
        );
        if (!repair.errorCode && !needsClinicalCoverageRepair(question, repair.text)) {
          answer = repair.text;
          modelUsed = repair.modelUsed;
          fallbackUsed = fallbackUsed || repair.fallbackUsed;
          fallbackReason = repair.fallbackReason ?? fallbackReason;
          generationLatency += repair.latencyMs;
        }
      }
      if (!generation.errorCode && needsClinicalCompletenessRepair(question, answer)) {
        const repair = await generateResponse(
          question,
          docs,
          history.slice(-12) as ChatHistoryItem[],
          decision.generationMode ?? 'livre',
          decision.topic,
          decision.quizQuestion,
          decision.stateBefore.state,
          decision.stateBefore.mode,
          CLINICAL_COMPLETENESS_REQUIREMENT,
          retrievalSourcePattern,
        );
        if (!repair.errorCode && !needsClinicalCompletenessRepair(question, repair.text)) {
          answer = repair.text;
          modelUsed = repair.modelUsed;
          fallbackUsed = fallbackUsed || repair.fallbackUsed;
          fallbackReason = repair.fallbackReason ?? fallbackReason;
          generationLatency += repair.latencyMs;
        }
      }
      if (!generation.errorCode && requiresNextQuizQuestion(decision, answer)) {
        const expectedQuestion = Math.max(1, decision.quizQuestion) + 1;
        const repair = await generateResponse(
          question,
          docs,
          history.slice(-12) as ChatHistoryItem[],
          decision.generationMode ?? 'livre',
          decision.topic,
          decision.quizQuestion,
          decision.stateBefore.state,
          decision.stateBefore.mode,
          `Sua resposta deve obrigatoriamente corrigir a Questão ${expectedQuestion - 1} e, em seguida, incluir a linha **Questão ${expectedQuestion}:** com quatro alternativas A, B, C e D. Não termine a resposta antes dessa nova questão.`,
        );
        if (!repair.errorCode && !requiresNextQuizQuestion(decision, repair.text)) {
          answer = repair.text;
          modelUsed = repair.modelUsed;
          fallbackUsed = fallbackUsed || repair.fallbackUsed;
          fallbackReason = repair.fallbackReason ?? fallbackReason;
          generationLatency += repair.latencyMs;
        } else {
          answer = 'Não consegui formular a próxima questão com segurança. Escolha outro tema, volte ao menu ou encerre a sessão.';
          generationErrorCode = 'QUIZ_NEXT_QUESTION_MISSING';
        }
      }
      finalState = generationErrorCode
        ? decision.stateBefore
        : finalizeGeneratedTurn(decision, answer);
    }

    // Última barreira antes de persistir e enviar a resposta ao estudante.
    // Isso também cobre respostas produzidas por uma chamada de reparo.
    answer = sanitizeStudentFacingText(answer);

    const totalLatency = Date.now() - startedAt;
    const metadata = buildTurnMetadata({
      requestId,
      mode: finalState.mode,
      stateBefore: decision.stateBefore.state,
      stateAfter: finalState.state,
      topic: decision.topic,
      quizQuestion: finalState.quizQuestion,
      quizAttempt: finalState.quizAttempt,
      docs,
      modelRequested,
      modelUsed,
      fallbackUsed,
      fallbackReason,
      embeddingLatency,
      retrievalLatency,
      generationLatency,
      totalLatency,
      errorCode: generationErrorCode ?? retrievalErrorCode,
      corpusVersion,
      retrievalCacheHit,
    });

    await saveTurnBounded(supabase, {
      sessionId,
      requestId,
      userMessage: question,
      assistantMessage: answer,
      state: finalState,
      metadata,
    });

    // A avaliação usa outro worker/modelo e não participa da latência percebida
    // pelo estudante. Se a fila estiver indisponível, a resposta continua válida.
    if (docs.length > 0 && !generationErrorCode) {
      // A avaliação é assíncrona e não deve aumentar o tempo percebido pelo
      // estudante. A resposta já foi persistida antes deste disparo.
      void enqueueQualityEvaluation(supabase, sessionId, requestId).catch((error) => {
        console.warn(`[chat] Falha ao enfileirar avaliação para request_id=${requestId}`, error);
      });
    }

    return chatResponse({
      answer,
      sessionId,
      requestId,
      sourcesFound: docs.length,
      historyLength: history.length + 2,
      processingTimeMs: Date.now() - startedAt,
      responseKind: generationErrorCode || docs.length === 0
        ? 'fallback'
        : generatedResponseKind(decision.generationMode ?? 'livre', answer),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[chat] request_id=${requestId} erro interno:`, message.slice(0, 300));
    return NextResponse.json(
      {
        error: 'Não foi possível processar a mensagem neste momento.',
        error_code: 'INTERNAL_ERROR',
        request_id: requestId,
      },
      { status: 500 },
    );
  }
}
