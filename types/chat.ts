// types/chat.ts — Contratos TypeScript para o sistema de chat

export interface Message {
  id: string;
  /** Identificador persistente do turno no backend (somente respostas). */
  request_id?: string;
  role: 'user' | 'assistant';
  content: string;
  /** Número de chunks relevantes usados na resposta (apenas role='assistant') */
  sources_found?: number;
  /** True = resposta baseada em documentos; false = fallback */
  has_context?: boolean;
  /** Tempo de processamento em ms */
  processing_time_ms?: number;
  /** Categoria estruturada decidida pelo backend para controles de interface. */
  response_kind?: 'navigation' | 'summary' | 'quiz_question' | 'quiz_feedback' | 'info' | 'free' | 'fallback';
  timestamp: Date;
}

export interface ChatRequest {
  session_id: string;
  request_id: string;
  message: string;
}

export interface ChatResponse {
  answer: string;
  session_id: string;
  request_id: string;
  sources_found: number;
  has_context: boolean;
  chat_history_length: number;
  processing_time_ms: number;
  response_kind: NonNullable<Message['response_kind']>;
}

export interface ChatSession {
  id: string;
  messageCount: number;
  startedAt: Date;
}
