import type { SupabaseClient } from '@supabase/supabase-js';

import {
  createDefaultSessionState,
  type ChatFlowState,
  type ChatMode,
  type SessionState,
} from './session-flow';

export interface ChatHistoryItem {
  role: 'user' | 'assistant';
  content: string;
}

export interface TurnMetadata {
  request_id: string;
  flow_version: string;
  mode: ChatMode;
  state_before: ChatFlowState;
  state_after: ChatFlowState;
  current_topic: string;
  has_context: boolean;
  sources_found: number;
  retrieval: Array<{
    document_id: string;
    source: string;
    rank: number;
    similarity: number;
  }>;
  latency_ms: {
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

function lastTopicFromHistory(history: ChatHistoryItem[]): string {
  const ignored = /^(menu|voltar|in[ií]cio|resumo|simulado|quiz|informa[cç][oõ]es|encerrar|aprofundar|oi|ol[aá])$/i;
  for (const message of [...history].reverse()) {
    if (message.role === 'user' && !ignored.test(message.content.trim())) return message.content.trim();
  }
  return '';
}

export function inferLegacySessionState(sessionId: string, history: ChatHistoryItem[]): SessionState {
  const fallback = createDefaultSessionState(sessionId);
  const lastAssistant = [...history].reverse().find((message) => message.role === 'assistant')?.content ?? '';
  const currentTopic = lastTopicFromHistory(history);

  if (/qual tema[\s\S]*(resumo|estudar)|qual tema da disciplina/i.test(lastAssistant)) {
    return { ...fallback, state: 'RESUMO_AGUARDANDO_TEMA', mode: 'resumo' };
  }
  if (/qual tema[\s\S]*(quiz|simulado)|farei tr[eê]s perguntas/i.test(lastAssistant)) {
    return { ...fallback, state: 'QUIZ_AGUARDANDO_TEMA', mode: 'quiz' };
  }
  if (/resposta est[aá] incorreta[\s\S]{0,80}tente novamente/i.test(lastAssistant)) {
    const question = Number(lastAssistant.match(/quest[aã]o\s*([123])/i)?.[1] ?? 1);
    return {
      ...fallback,
      state: 'QUIZ_SEGUNDA_TENTATIVA',
      mode: 'quiz',
      currentTopic,
      quizQuestion: question,
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
    .limit(12);

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
    if (error.code === 'PGRST205' || /chat_session_state/i.test(error.message)) {
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
    if (error.code === '42703' || /request_id|metadata/i.test(error.message)) return null;
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
  await persistSessionState(client, params.state);

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

  if (error) throw new Error(`TURN_WRITE_FAILED: ${error.message}`);
}

