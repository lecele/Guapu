'use client';

import { useCallback, useRef, useState, type KeyboardEvent } from 'react';
import { Loader2, Send, Trash2 } from 'lucide-react';

interface MessageInputProps {
  onSend: (message: string) => void;
  onNewSession: () => void;
  isLoading: boolean;
  disabled?: boolean;
}

export function MessageInput({
  onSend,
  onNewSession,
  isLoading,
  disabled = false,
}: MessageInputProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const canSend = value.trim().length > 0 && !isLoading && !disabled;

  const resizeTextarea = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  }, []);

  const handleSend = useCallback(() => {
    if (!canSend) return;
    onSend(value.trim());
    setValue('');
    requestAnimationFrame(() => {
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    });
  }, [canSend, onSend, value]);

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  return (
    <form
      className="guapu-inputbar"
      onSubmit={(event) => {
        event.preventDefault();
        handleSend();
      }}
    >
      <textarea
        ref={textareaRef}
        rows={1}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          resizeTextarea();
        }}
        onKeyDown={handleKeyDown}
        placeholder="Pergunte ao Guapu…"
        aria-label="Mensagem para o Guapu"
        autoComplete="off"
      />
      <button
        type="button"
        className="guapu-input-button is-clear"
        onClick={onNewSession}
        disabled={isLoading}
        aria-label="Limpar conversa"
        title="Limpar conversa"
      >
        <Trash2 size={16} strokeWidth={1.8} />
      </button>
      <button
        type="submit"
        className="guapu-input-button is-send"
        disabled={!canSend}
        aria-label="Enviar"
        title="Enviar"
      >
        {isLoading ? (
          <Loader2 size={16} strokeWidth={1.8} className="guapu-spin" />
        ) : (
          <Send size={15} fill="currentColor" strokeWidth={0} />
        )}
      </button>
    </form>
  );
}
