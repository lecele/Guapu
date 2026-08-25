'use client';

// hooks/useChat.ts — Toda a lógica de estado do chat em um hook reutilizável

import { useState, useCallback, useEffect, useRef } from 'react';
import { Message, ChatSession } from '@/types/chat';
import { sendChatMessage, checkHealth } from '@/lib/api';

function generateSessionId(): string {
  // Usa crypto.randomUUID se disponível (navegadores modernos)
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback compatível
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isBackendOnline, setIsBackendOnline] = useState<boolean | null>(null);
  const [session, setSession] = useState<ChatSession>(() => ({
    id: generateSessionId(),
    messageCount: 0,
    startedAt: new Date(),
  }));

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll automático para a última mensagem
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    if (isLoading) {
      scrollToBottom();
    }
  }, [isLoading, scrollToBottom]);

  // Verifica saúde do backend na montagem
  useEffect(() => {
    checkHealth().then(setIsBackendOnline);
  }, []);

  /**
   * Envia uma nova mensagem do estudante para o tutor de IA.
   */
  const sendMessage = useCallback(
    async (content: string) => {
      const trimmed = content.trim();
      if (!trimmed || isLoading) return;

      // Adiciona mensagem do usuário imediatamente (UX responsiva)
      const userMessage: Message = {
        id: generateSessionId(),
        role: 'user',
        content: trimmed,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);
      setError(null);

      try {
        const response = await sendChatMessage(session.id, trimmed);

        const aiMessage: Message = {
          id: generateSessionId(),
          role: 'assistant',
          content: response.answer,
          sources_found: response.sources_found,
          has_context: response.has_context,
          processing_time_ms: response.processing_time_ms,
          timestamp: new Date(),
        };

        setMessages((prev) => [...prev, aiMessage]);
        setSession((prev) => ({
          ...prev,
          messageCount: response.chat_history_length,
        }));

        setIsBackendOnline(true);
      } catch (err) {
        const errorMsg =
          err instanceof Error
            ? err.message
            : 'Erro desconhecido ao conectar com o servidor.';

        setError(errorMsg);
        setIsBackendOnline(false);

        // Remove a mensagem do usuário em caso de erro de rede
        setMessages((prev) => prev.filter((m) => m.id !== userMessage.id));
      } finally {
        setIsLoading(false);
      }
    },
    [session.id, isLoading]
  );

  /**
   * Inicia uma nova sessão de chat.
   */
  const startNewSession = useCallback(() => {
    setMessages([]);
    setError(null);
    setSession({
      id: generateSessionId(),
      messageCount: 0,
      startedAt: new Date(),
    });
  }, []);

  /**
   * Limpa o erro atual.
   */
  const clearError = useCallback(() => setError(null), []);

  return {
    messages,
    isLoading,
    error,
    session,
    isBackendOnline,
    messagesEndRef,
    sendMessage,
    startNewSession,
    clearError,
  };
}
