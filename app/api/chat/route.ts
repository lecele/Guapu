// app/api/chat/route.ts — Tutor de Enfermagem INT 5224
// Prompt Mestre conforme o pacote de prompts v1.3.0 do cliente.

import { randomUUID } from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';

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
import { finalizeReferences } from '@/lib/chat/references';

export const runtime = 'nodejs';
export const maxDuration = 120;

const ACTIVE_PLAN_SOURCE = (
  process.env.ACTIVE_PLAN_SOURCE ||
  'administrativo__plano_ensino_INT55224__plano__ufsc__2026_2.pdf'
).trim();
const RAG_REFERENCES_ENABLED = process.env.RAG_REFERENCES_ENABLED === 'true';

// ── Respostas fixas (zero tokens de LLM para navegação rápida) ───────────────

const GREETING_RESPONSE =
  'Como posso ajudar? Escolha uma opção ou envie uma pergunta livre relacionada à disciplina:\n' +
  '- Resumo de conteúdo\n' +
  '- Quiz da disciplina\n' +
  '- Informações da disciplina\n' +
  '- Encerrar sessão';

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

type ResponseKind = 'navigation' | 'summary' | 'quiz_question' | 'quiz_feedback' | 'info' | 'free' | 'fallback';

// ── Roteamento por intenção (sem LLM) ────────────────────────────────────────

// ── Helpers de formatação RAG ─────────────────────────────────────────────────

function formatContext(docs: Document[]): string {
  if (!docs.length) return 'Nenhum material disponível.';
  return docs
    .map((d, i) =>
      `[${i + 1}] Trecho RAG ${i + 1} (similaridade: ${d.similarity.toFixed(2)})\n${d.content}`
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

async function retrieveDocs(
  embedding: number[],
  threshold = 0.35,
  sourcePattern?: string,
  queryText?: string,
): Promise<Document[]> {
  const supabase = getSupabase();
  const matchDocuments = supabase.rpc.bind(supabase) as unknown as MatchDocumentsRpc;
  const { data, error } = await matchDocuments(
    sourcePattern ? 'match_documents_filtered' : queryText ? 'match_documents_hybrid' : 'match_documents',
    {
    query_embedding: embedding,
    match_threshold: threshold,
    match_count: parseInt(process.env.RAG_MATCH_COUNT || '5'),
      ...(sourcePattern ? { source_pattern: sourcePattern } : {}),
      ...(!sourcePattern && queryText ? { query_text: queryText } : {}),
    },
  );
  if (error) throw new Error(`RETRIEVAL_FAILED: ${error.message}`);
  return (data || []).map((row) => ({
    id: String(row.id ?? ''),
    content: row.content,
    source: row.source || 'desconhecido',
    similarity: row.similarity || 0,
    metadata: row.metadata || {},
  }));
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
): Promise<GenerationResult> {
  const generationStartedAt = Date.now();
  const systemPrompt = `${buildCorePrompt({
    context: formatContext(docs),
    history: formatHistory(history),
  })}\n\n${buildFlowPrompt({ state: sessionState, mode: activeMode, topic: inlineTheme || '', quizQuestion })}`;

  const requestedModel = process.env.GEMINI_CHAT_MODEL ?? 'gemini-3.5-flash';
  const candidateModels = [...new Set([
    requestedModel,
    'gemini-3.5-flash',
    'gemini-3.1-flash-lite',
    'gemini-3.5-flash-lite',
    'gemini-3.6-flash',
    'gemini-3.7-flash',
  ])];

  const prompt = `${buildModePrompt({
    mode: sessionMode,
    question,
    topic: inlineTheme || question,
    quizQuestion,
  })}${completionRequirement ? `\n\n[VALIDAÇÃO OBRIGATÓRIA]\n${completionRequirement}` : ''}`;

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
          text: finalizeReferences(text, docs, sessionMode, RAG_REFERENCES_ENABLED),
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
  quizQuestion: number;
  quizAttempt: number;
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
    quiz_question: params.quizQuestion,
    quiz_attempt: params.quizAttempt,
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
    const sessionId = body?.session_id?.trim() ?? '';
    const question = body?.message?.trim() ?? '';
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
      !question ||
      question.length > 8_000 ||
      (activeMode !== undefined && !['resumo', 'quiz', 'info', 'encerrar'].includes(activeMode))
    ) {
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
        responseKind: 'navigation',
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
      docs = await retrieveDocs(
        embedding,
        decision.generationMode === 'info' ? -1 : isCourseQuery ? 0.25 : 0.35,
        decision.generationMode === 'info' ? ACTIVE_PLAN_SOURCE : undefined,
        searchQuery,
      );
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
      answer = retrievalErrorCode === 'NO_RELEVANT_CONTEXT'
        ? insufficientContentResponse(decision.topic || searchQuery)
        : TECHNICAL_FALLBACK_RESPONSE;
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
        decision.stateBefore.state,
        decision.stateBefore.mode,
      );
      answer = generation.text;
      modelRequested = generation.modelRequested;
      modelUsed = generation.modelUsed;
      fallbackUsed = generation.fallbackUsed;
      fallbackReason = generation.fallbackReason;
      generationLatency = generation.latencyMs;
      generationErrorCode = generation.errorCode;
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
    });

    await saveTurn(supabase, {
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
      try {
        await enqueueQualityEvaluation(supabase, sessionId, requestId);
      } catch (error) {
        console.warn(`[chat] Falha ao enfileirar avaliação para request_id=${requestId}`, error);
      }
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
