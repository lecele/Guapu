// lib/api.ts — Cliente HTTP para o backend do Tutor com Auto-Retry Resiliente

import { ChatRequest, ChatResponse, type ChatActionMode } from '@/types/chat';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '/api';

function generateRequestId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

/**
 * Envia uma mensagem para o tutor de IA com re-tentativa automática (auto-retry)
 * em caso de oscilações temporárias de rede ou timeouts (504/503/502).
 */
export async function sendChatMessage(
  session_id: string,
  message: string,
  activeMode?: ChatActionMode,
  maxRetries: number = 2
): Promise<ChatResponse> {
  // O mesmo request_id é reutilizado em todas as tentativas para impedir
  // mensagens/respostas duplicadas quando a rede oscila.
  const payload: ChatRequest = {
    session_id,
    request_id: generateRequestId(),
    message,
    ...(activeMode ? { active_mode: activeMode } : {}),
  };

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        // Se for erro temporário de timeout (504) ou sobrecarga (503/502), tenta novamente
        if ([504, 503, 502].includes(response.status) && attempt < maxRetries) {
          console.warn(`[sendChatMessage] Tentativa ${attempt} falhou com status ${response.status}. Aguardando re-tentativa transparente...`);
          await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
          continue;
        }

        const errorText = await response.text().catch(() => response.statusText);
        if (response.status === 504) {
          throw new Error('Tempo limite excedido na resposta do servidor. Por favor, reenvie sua solicitação.');
        }
        throw new Error(`Erro na API (${response.status}): ${errorText}`);
      }

      const data: ChatResponse = await response.json();
      return data;
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        console.warn(`[sendChatMessage] Erro na tentativa ${attempt}: ${lastError.message}. Tentando novamente...`);
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
    }
  }

  throw lastError || new Error('Não foi possível conectar ao assistente. Por favor, tente novamente.');
}

/**
 * Verifica se o backend está online.
 */
export async function checkHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
