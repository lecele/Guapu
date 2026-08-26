// app/api/chat/route.ts — Tutor de Enfermagem INT 5224
// Prompt Mestre conforme Prompt 10Aug2026.docx (15 seções implementadas)

import { randomUUID } from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';

import {
  finalizeGeneratedTurn,
  resolveTurn,
  type FastResponseKey,
  type GenerationMode,
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
import { FLOW_PROMPT } from '@/lib/chat/prompts/flow';
import { buildModePrompt } from '@/lib/chat/prompts/modes';

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

const QUIZ_INVALID_RESPONSE =
  'Não entendi sua resposta. Digite apenas a letra da alternativa escolhida: A, B, C ou D.';

const INFO_MENU_RESPONSE =
  'Que informação da disciplina você deseja consultar?\n\n' +
  'Você pode perguntar sobre o plano de ensino, professores, horários, cronograma, avaliações, frequência, trabalhos ou conteúdo programático.';

const FALLBACK_RESPONSE =
  'Desculpe, o material de estudo disponível não contém informações suficientes ' +
  'para responder a sua pergunta com precisão acadêmica.\n\n' +
  'Recomendo consultar:\n' +
  '- Seu professor orientador ou tutor da disciplina\n' +
  '- Biblioteca virtual da instituição\n' +
  '- Bases de dados científicas: **LILACS**, **BVS**, **PubMed**\n' +
  '- Publicações do **COFEN** (cofen.gov.br) e **Ministério da Saúde** (saude.gov.br)';


// ── Tipos ─────────────────────────────────────────────────────────────────────

interface ChatRequest {
  session_id: string;
  request_id?: string;
  message: string;
}

interface Document {
  id: string;
  content: string;
  source: string;
  similarity: number;
}

interface MatchDocumentRow {
  id?: string;
  content: string;
  source?: string;
  similarity?: number;
}

type MatchDocumentsRpc = (
  functionName: 'match_documents',
  args: { query_embedding: number[]; match_threshold: number; match_count: number },
) => Promise<{ data: MatchDocumentRow[] | null; error: { message: string } | null }>;

// ── Roteamento por intenção (sem LLM) ────────────────────────────────────────

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
let _genai: GoogleGenAI | null = null;

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_KEY;
  if (!url || !key) throw new Error('CONFIGURATION_MISSING_SUPABASE');
  if (!_supabase) _supabase = createClient(url, key);
  return _supabase;
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

async function retrieveDocs(embedding: number[], threshold = 0.35): Promise<Document[]> {
  const supabase = getSupabase();
  const matchDocuments = supabase.rpc.bind(supabase) as unknown as MatchDocumentsRpc;
  const { data, error } = await matchDocuments('match_documents', {
    query_embedding: embedding,
    match_threshold: threshold,
    match_count: parseInt(process.env.RAG_MATCH_COUNT || '5'),
  });
  if (error) throw new Error(`RETRIEVAL_FAILED: ${error.message}`);
  return (data || []).map((row) => ({
    id: String(row.id ?? ''),
    content: row.content,
    source: row.source || 'desconhecido',
    similarity: row.similarity || 0,
  }));
}

// ── System Prompt Mestre (Prompt 20Aug2026 — 15 seções) ──────────────────────

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
    // O modelo às vezes inclui o separador ou a pergunta de continuidade na
    // seção de referências. Esses textos não são fontes e não devem aparecer
    // como citação para o estudante.
    if (
      /^(?:refer[êe]ncia:\s*)?[-–—]+$/i.test(clean) ||
      /(?:refer[êe]ncia:\s*)?(?:gostaria de|deseja aprofundar|deseja continuar|voltar ao menu|encerrar a sess[aã]o)/i.test(clean)
    ) {
      return '';
    }
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

interface GenerationResult {
  text: string;
  modelRequested: string;
  modelUsed: string | null;
  fallbackUsed: boolean;
  fallbackReason: string | null;
  errorCode: string | null;
  latencyMs: number;
}

async function generateResponse(
  question: string,
  docs: Document[],
  history: Array<{ role: string; content: string }>,
  sessionMode: GenerationMode = 'livre',
  inlineTheme?: string,
  quizQuestion = 0,
): Promise<GenerationResult> {
  const generationStartedAt = Date.now();
  const systemPrompt = `${buildCorePrompt({
    context: formatContext(docs),
    history: formatHistory(history),
  })}\n\n${FLOW_PROMPT}`;

  const requestedModel = process.env.GEMINI_CHAT_MODEL ?? 'gemini-3.5-flash';
  const candidateModels = [...new Set([
    requestedModel,
    'gemini-3.5-flash',
    'gemini-3.1-flash-lite',
    'gemini-3.5-flash-lite',
    'gemini-3.6-flash',
    'gemini-3.7-flash',
  ])];

  const prompt = buildModePrompt({
    mode: sessionMode,
    question,
    topic: inlineTheme || question,
    quizQuestion,
  });

  let text = '';
  let lastErrorMessage = '';

  for (const modelName of candidateModels) {
    try {
      const result = await getGenAI().models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          systemInstruction: systemPrompt,
          maxOutputTokens: 2500,
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.LOW,
          },
        },
      });
      text = result.text ?? '';

      // Garante a presença da pergunta de encerramento sem re-execução custosa
      if (
        (sessionMode === 'resumo' || sessionMode === 'resumo_aprofundar' || sessionMode === 'resumo_reformular') &&
        !text.includes('Deseja')
      ) {
        text = `${text.trim()}\n\n` + 'Deseja aprofundar este tema, escolher outro tema, voltar ao menu principal ou encerrar a sessão?';
      }

      if (text && text.trim().length > 0) {
        return {
          text: normalizeReferencesFormat(text),
          modelRequested: candidateModels[0],
          modelUsed: modelName,
          fallbackUsed: modelName !== candidateModels[0],
          fallbackReason: modelName !== candidateModels[0] ? 'PRIMARY_MODEL_FAILED' : null,
          errorCode: null,
          latencyMs: Date.now() - generationStartedAt,
        };
      }
      lastErrorMessage = 'EMPTY_MODEL_RESPONSE';
    } catch (error: unknown) {
      lastErrorMessage = error instanceof Error ? error.message : String(error);
      console.warn(
        `[generateResponse] Model ${modelName} falhou; tentando o próximo modelo: ${lastErrorMessage.slice(0, 200)}`,
      );
    }
  }

  console.error('[generateResponse] Todos os modelos falharam:', lastErrorMessage.slice(0, 200));
  return {
    text: 'Ocorreu uma interrupção temporária na geração da resposta. Por favor, tente novamente em instantes.',
    modelRequested: candidateModels[0],
    modelUsed: null,
    fallbackUsed: true,
    fallbackReason: 'ALL_MODELS_FAILED',
    errorCode: 'MODEL_FAILED',
    latencyMs: Date.now() - generationStartedAt,
  };
}

// ── Histórico e Cache de Estado ───────────────────────────────────────────────

// ── HANDLER ───────────────────────────────────────────────────────────────────

const EMBEDDING_MODEL = 'gemini-embedding-2';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SESSION_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

const FAST_RESPONSES: Record<FastResponseKey, string> = {
  greeting: GREETING_RESPONSE,
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
  docs: Document[];
  modelRequested: string | null;
  modelUsed: string | null;
  fallbackUsed: boolean;
  fallbackReason: string | null;
  embeddingLatency: number;
  retrievalLatency: number;
  generationLatency: number;
  totalLatency: number;
  errorCode: string | null;
}): TurnMetadata {
  return {
    request_id: params.requestId,
    flow_version: 'v1',
    prompt_version: PROMPT_VERSION,
    mode: params.mode,
    state_before: params.stateBefore,
    state_after: params.stateAfter,
    current_topic: params.topic,
    model_requested: params.modelRequested,
    model_used: params.modelUsed,
    fallback_used: params.fallbackUsed,
    fallback_reason: params.fallbackReason,
    embedding_model: params.docs.length > 0 ? EMBEDDING_MODEL : null,
    has_context: params.docs.length > 0,
    sources_found: params.docs.length,
    retrieval: params.docs.map((doc, index) => ({
      document_id: doc.id || `source:${doc.source}:${index + 1}`,
      source: doc.source,
      rank: index + 1,
      similarity: doc.similarity,
    })),
    latency_ms: {
      embedding: params.embeddingLatency,
      retrieval: params.retrievalLatency,
      generation: params.generationLatency,
      total: params.totalLatency,
    },
    error_code: params.errorCode,
  };
}

function chatResponse(params: {
  answer: string;
  sessionId: string;
  requestId: string;
  sourcesFound: number;
  historyLength: number;
  processingTimeMs: number;
}) {
  return NextResponse.json({
    answer: params.answer,
    session_id: params.sessionId,
    request_id: params.requestId,
    sources_found: params.sourcesFound,
    has_context: params.sourcesFound > 0,
    chat_history_length: params.historyLength,
    processing_time_ms: params.processingTimeMs,
  });
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  let requestId: string = randomUUID();

  try {
    const body = await req.json().catch(() => null) as Partial<ChatRequest> | null;
    const sessionId = body?.session_id?.trim() ?? '';
    const question = body?.message?.trim() ?? '';

    if (body?.request_id) {
      if (!UUID_PATTERN.test(body.request_id)) {
        return NextResponse.json(
          { error: 'Requisição inválida', error_code: 'INVALID_REQUEST', request_id: requestId },
          { status: 400 },
        );
      }
      requestId = body.request_id;
    }

    if (!SESSION_ID_PATTERN.test(sessionId) || !question || question.length > 8_000) {
      return NextResponse.json(
        { error: 'Sessão ou mensagem inválida', error_code: 'INVALID_REQUEST', request_id: requestId },
        { status: 400 },
      );
    }

    const supabase = getSupabase();
    const history = await getSessionHistory(supabase, sessionId);
    const completedTurn = await findCompletedTurn(supabase, sessionId, requestId);

    if (completedTurn) {
      const metadata = completedTurn.metadata;
      return chatResponse({
        answer: completedTurn.content,
        sessionId,
        requestId,
        sourcesFound: Number(metadata.sources_found ?? 0),
        historyLength: history.length,
        processingTimeMs: Date.now() - startedAt,
      });
    }

    let sessionState;
    try {
      sessionState = await loadSessionState(supabase, sessionId, history);
    } catch (error) {
      console.warn('[chat] Falha ao carregar estado persistente; usando inferência legada.', error);
      sessionState = inferLegacySessionState(sessionId, history);
    }

    const decision = resolveTurn(sessionState, question);

    if (decision.kind === 'fast' && decision.fastResponse) {
      const answer = FAST_RESPONSES[decision.fastResponse];
      const totalLatency = Date.now() - startedAt;
      const metadata = buildTurnMetadata({
        requestId,
        mode: decision.stateAfter.mode,
        stateBefore: decision.stateBefore.state,
        stateAfter: decision.stateAfter.state,
        topic: decision.topic,
        docs: [],
        modelRequested: null,
        modelUsed: null,
        fallbackUsed: false,
        fallbackReason: null,
        embeddingLatency: 0,
        retrievalLatency: 0,
        generationLatency: 0,
        totalLatency,
        errorCode: null,
      });

      await saveTurn(supabase, {
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
      });
    }

    let docs: Document[] = [];
    let embeddingLatency = 0;
    let retrievalLatency = 0;
    let retrievalErrorCode: string | null = null;
    const searchQuery = decision.topic || question;

    try {
      const embeddingStartedAt = Date.now();
      const embedding = await embedQuery(searchQuery);
      embeddingLatency = Date.now() - embeddingStartedAt;

      const retrievalStartedAt = Date.now();
      const isCourseQuery =
        decision.generationMode === 'info' ||
        /prof|hor[aá]r|atend|cron|calend|nota|avali|plano|trabalho|conte[uú]do|carga|disciplin|ementa|frequ[eê]nc|moodle|email|contato|m[eé]dia|prova/i.test(searchQuery);
      docs = await retrieveDocs(embedding, isCourseQuery ? 0.25 : 0.35);
      retrievalLatency = Date.now() - retrievalStartedAt;

      if (docs.length === 0) retrievalErrorCode = 'NO_RELEVANT_CONTEXT';
    } catch (error) {
      retrievalErrorCode = embeddingLatency === 0 ? 'EMBEDDING_FAILED' : 'RETRIEVAL_FAILED';
      console.warn(`[chat] ${retrievalErrorCode} para request_id=${requestId}`, error);
    }

    let answer: string;
    let finalState = decision.stateAfter;
    let modelRequested: string | null = null;
    let modelUsed: string | null = null;
    let fallbackUsed = false;
    let fallbackReason: string | null = null;
    let generationLatency = 0;
    let generationErrorCode: string | null = null;

    if (docs.length === 0) {
      answer = FALLBACK_RESPONSE;
      finalState = decision.stateBefore;
      fallbackUsed = true;
      fallbackReason = retrievalErrorCode;
    } else {
      const generation = await generateResponse(
        question,
        docs,
        history.slice(-12) as ChatHistoryItem[],
        decision.generationMode ?? 'livre',
        decision.topic,
        decision.quizQuestion,
      );
      answer = generation.text;
      modelRequested = generation.modelRequested;
      modelUsed = generation.modelUsed;
      fallbackUsed = generation.fallbackUsed;
      fallbackReason = generation.fallbackReason;
      generationLatency = generation.latencyMs;
      generationErrorCode = generation.errorCode;
      finalState = generation.errorCode
        ? decision.stateBefore
        : finalizeGeneratedTurn(decision, answer);
    }

    const totalLatency = Date.now() - startedAt;
    const metadata = buildTurnMetadata({
      requestId,
      mode: finalState.mode,
      stateBefore: decision.stateBefore.state,
      stateAfter: finalState.state,
      topic: decision.topic,
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
    });

    await saveTurn(supabase, {
      sessionId,
      requestId,
      userMessage: question,
      assistantMessage: answer,
      state: finalState,
      metadata,
    });

    return chatResponse({
      answer,
      sessionId,
      requestId,
      sourcesFound: docs.length,
      historyLength: history.length + 2,
      processingTimeMs: Date.now() - startedAt,
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
