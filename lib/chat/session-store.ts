import type { SupabaseClient } from '@supabase/supabase-js';

import {
  createDefaultSessionState,
  type ChatFlowState,
  type ChatMode,
  type SessionState,
} from './session-flow.ts';

export interface ChatHistoryItem {
  role: 'user' | 'assistant';
  content: string;
}

export interface TurnMetadata {
  request_id: string;
  flow_version: string;
  prompt_version: string;
  mode: ChatMode;
  state_before: ChatFlowState;
  state_after: ChatFlowState;
  current_topic: string;
  quiz_question: number;
  quiz_attempt: number;
  model_requested: string | null;
  model_used: string | null;
  fallback_used: boolean;
  fallback_reason: string | null;
  embedding_model: string | null;
  has_context: boolean;
  sources_found: number;
  retrieval: Array<{
    document_id: string;
    source: string;
    rank: number;
    similarity: number;
  }>;
  latency_ms: {
    embedding: number;
    retrieval: number;
    generation: number;
    total: number;
  };
  error_code: string | null;
}

interface StoredSessionState {
  session_id: string;
  state: ChatFlowState;
  mode: ChatMode;
  current_topic: string | null;
  quiz_question: number;
  quiz_attempt: number;
  flow_version: string;
  revision: number;
}

interface DatabaseErrorLike {
  code?: string;
  message?: string;
}

function isSchemaCompatibilityError(error: DatabaseErrorLike): boolean {
  return (
    ['42703', '42P01', 'PGRST204', 'PGRST205'].includes(error.code ?? '') ||
    /chat_session_state|request_id|metadata|schema cache/i.test(error.message ?? '')
  );
}

function lastTopicFromHistory(history: ChatHistoryItem[]): string {
  const ignored = /^(?:[a-d]|menu|voltar|in[ií]cio|resumo|simulado|quiz|informa[cç][oõ]es|encerrar|aprofundar|oi|ol[aá]|seja mais concis[oa]|mais concis[oa]|resuma mais|resuma isso|simplifique|resposta mais curta)$/i;
  const inlinePrefix = /^(?:(?:quero|queria)\s+(?:um\s+)?|fazer\s+)?(?:resumo(?:\s+de\s+conte[uú]do)?|quiz(?:\s+da\s+disciplina)?|simulado(?:\s+de\s+prova)?|op[cç][aã]o\s+[12]|[12])\s*(?:sobre|de|da|do|com|-|:)?\s*/i;
  for (const message of [...history].reverse()) {
    if (message.role !== 'user') continue;
    const content = message.content.trim();
    if (ignored.test(content)) continue;
    const topic = content.replace(inlinePrefix, '').trim();
    if (topic) return topic;
  }
  return '';
}

export function inferLegacySessionState(sessionId: string, history: ChatHistoryItem[]): SessionState {
  const fallback = createDefaultSessionState(sessionId);
  const lastAssistant = [...history].reverse().find((message) => message.role === 'assistant')?.content ?? '';
  const currentTopic = lastTopicFromHistory(history);
  const lastQuizQuestion = [...history]
    .reverse()
    .filter((message) => message.role === 'assistant')
    .map((message) => Number(message.content.match(/quest[aã]o\s*([123])/i)?.[1] ?? 0))
    .find((question) => question > 0) ?? 1;

  if (/qual tema[\s\S]*(resumo|estudar)|qual tema da disciplina/i.test(lastAssistant)) {
    return { ...fallback, state: 'RESUMO_AGUARDANDO_TEMA', mode: 'resumo' };
  }
  if (/qual tema[\s\S]*(quiz|simulado)|farei tr[eê]s perguntas/i.test(lastAssistant)) {
    return { ...fallback, state: 'QUIZ_AGUARDANDO_TEMA', mode: 'quiz' };
  }
  if (/resposta est[aá] incorreta[\s\S]{0,80}tente novamente/i.test(lastAssistant)) {
    return {
      ...fallback,
      state: 'QUIZ_SEGUNDA_TENTATIVA',
      mode: 'quiz',
      currentTopic,
      quizQuestion: lastQuizQuestion,
      quizAttempt: 2,
    };
  }
  const questionMatch = lastAssistant.match(/quest[aã]o\s*([123])/i);
  if (questionMatch) {
    return {
      ...fallback,
      state: 'QUIZ_EM_ANDAMENTO',
      mode: 'quiz',
      currentTopic,
      quizQuestion: Number(questionMatch[1]),
      quizAttempt: 1,
    };
  }
  if (/deseja aprofundar este tema|deseja aprofundar mais/i.test(lastAssistant)) {
    return { ...fallback, state: 'RESUMO_CONCLUIDO', mode: 'resumo', currentTopic };
  }
  if (/deseja fazer outra pergunta|informa[cç][oõ]es da disciplina/i.test(lastAssistant)) {
    return { ...fallback, state: 'INFORMACOES_AGUARDANDO_PERGUNTA', mode: 'info', currentTopic };
  }
  return fallback;
}

export async function getSessionHistory(client: SupabaseClient, sessionId: string): Promise<ChatHistoryItem[]> {
  const { data, error } = await client
    .from('chat_messages')
    .select('role, content')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) throw new Error(`HISTORY_READ_FAILED: ${error.message}`);

  return (data ?? [])
    .reverse()
    .filter((item): item is ChatHistoryItem =>
      (item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string',
    );
}

export async function loadSessionState(
  client: SupabaseClient,
  sessionId: string,
  history: ChatHistoryItem[],
): Promise<SessionState> {
  const { data, error } = await client
    .from('chat_session_state')
    .select('session_id, state, mode, current_topic, quiz_question, quiz_attempt, flow_version, revision')
    .eq('session_id', sessionId)
    .maybeSingle();

  if (error) {
    if (isSchemaCompatibilityError(error)) {
      return inferLegacySessionState(sessionId, history);
    }
    throw new Error(`SESSION_STATE_READ_FAILED: ${error.message}`);
  }

  if (!data) return inferLegacySessionState(sessionId, history);
  const stored = data as StoredSessionState;
  return {
    sessionId: stored.session_id,
    state: stored.state,
    mode: stored.mode,
    currentTopic: stored.current_topic ?? '',
    quizQuestion: stored.quiz_question,
    quizAttempt: stored.quiz_attempt,
    flowVersion: stored.flow_version,
    revision: stored.revision,
  };
}

export async function persistSessionState(client: SupabaseClient, state: SessionState): Promise<void> {
  const { error } = await client.from('chat_session_state').upsert(
    {
      session_id: state.sessionId,
      state: state.state,
      mode: state.mode,
      current_topic: state.currentTopic,
      quiz_question: state.quizQuestion,
      quiz_attempt: state.quizAttempt,
      flow_version: state.flowVersion,
      revision: state.revision,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'session_id' },
  );
  if (error) throw new Error(`SESSION_STATE_WRITE_FAILED: ${error.message}`);
}

export async function findCompletedTurn(
  client: SupabaseClient,
  sessionId: string,
  requestId: string,
): Promise<{ content: string; metadata: Partial<TurnMetadata> } | null> {
  const { data, error } = await client
    .from('chat_messages')
    .select('content, metadata')
    .eq('session_id', sessionId)
    .eq('request_id', requestId)
    .eq('role', 'assistant')
    .maybeSingle();

  if (error) {
    if (isSchemaCompatibilityError(error)) return null;
    throw new Error(`TURN_LOOKUP_FAILED: ${error.message}`);
  }
  if (!data) return null;
  return {
    content: String(data.content),
    metadata: (data.metadata ?? {}) as Partial<TurnMetadata>,
  };
}

export async function saveTurn(
  client: SupabaseClient,
  params: {
    sessionId: string;
    requestId: string;
    userMessage: string;
    assistantMessage: string;
    state: SessionState;
    metadata: TurnMetadata;
  },
): Promise<void> {
  try {
    await persistSessionState(client, params.state);
  } catch (error) {
    if (!isSchemaCompatibilityError(error as DatabaseErrorLike)) throw error;
  }

  const { error } = await client.from('chat_messages').upsert(
    [
      {
        session_id: params.sessionId,
        request_id: params.requestId,
        role: 'user',
        content: params.userMessage,
        metadata: { request_id: params.requestId },
      },
      {
        session_id: params.sessionId,
        request_id: params.requestId,
        role: 'assistant',
        content: params.assistantMessage,
        metadata: params.metadata,
      },
    ],
    { onConflict: 'session_id,request_id,role', ignoreDuplicates: true },
  );

  if (!error) return;
  if (!isSchemaCompatibilityError(error)) {
    throw new Error(`TURN_WRITE_FAILED: ${error.message}`);
  }

  // Compatibilidade temporária enquanto a migração 004 ainda não foi aplicada.
  // Depois da migração, o caminho acima fornece estado persistente e idempotência.
  const { error: legacyError } = await client.from('chat_messages').insert([
    { session_id: params.sessionId, role: 'user', content: params.userMessage },
    { session_id: params.sessionId, role: 'assistant', content: params.assistantMessage },
  ]);

  if (legacyError) throw new Error(`TURN_WRITE_FAILED: ${legacyError.message}`);
}
