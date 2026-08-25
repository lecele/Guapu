// types/chat.ts — Contratos TypeScript para o sistema de chat

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** Número de chunks relevantes usados na resposta (apenas role='assistant') */
  sources_found?: number;
  /** True = resposta baseada em documentos; false = fallback */
  has_context?: boolean;
  /** Tempo de processamento em ms */
  processing_time_ms?: number;
  timestamp: Date;
}

export interface ChatRequest {
  session_id: string;
  message: string;
}

export interface ChatResponse {
  answer: string;
  session_id: string;
  sources_found: number;
  has_context: boolean;
  chat_history_length: number;
  processing_time_ms: number;
}

export interface ChatSession {
  id: string;
  messageCount: number;
  startedAt: Date;
}
