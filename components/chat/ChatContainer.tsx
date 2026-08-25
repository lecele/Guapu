'use client';

// components/chat/ChatContainer.tsx — Área de conversação de alto padrão, pixel-perfect e imersiva

import { useRef, RefObject } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { Message } from '@/types/chat';
import { MessageBubble } from './MessageBubble';
import { TypingIndicator } from './TypingIndicator';
import { MessageInput } from './MessageInput';

interface ChatContainerProps {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  onSend: (message: string) => void;
  onNewSession: () => void;
  onClearError: () => void;
  isBackendOnline: boolean | null;
}

export function ChatContainer({
  messages,
  isLoading,
  error,
  messagesEndRef,
  onSend,
  onNewSession,
  onClearError,
  isBackendOnline,
}: ChatContainerProps) {
  const isEmpty = messages.length === 0;

  return (
    <div 
      className="flex flex-1 flex-col tutor-gradient-border m-4 ml-2 h-[calc(100vh-2rem)] rounded-[24px] overflow-hidden shadow-2xl relative z-10"
      style={{ '--tutor-border-bg': '#ffffff' } as React.CSSProperties}
    >
      {/* Top Header (Floating Premium, rounded and using cyan/blue gradient) */}
      <div className="p-4 pb-2">
        <div 
          className="flex items-center justify-between px-6 py-4 rounded-2xl shadow-[0_8px_30px_rgba(14,165,233,0.25)] tutor-gradient-border"
          style={{ '--tutor-border-bg-img': 'linear-gradient(to right, #0ea5e9, #38bdf8, #60a5fa)' } as React.CSSProperties}
        >
          <div className="flex items-center gap-2.5">
            <div className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#02080f] opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#02080f]" />
            </div>
            <span className="text-[13px] font-black tracking-widest text-[#02080f] font-display uppercase">Tutor de Enfermagem</span>
          </div>
        </div>
      </div>

      {/* Área de mensagens */}
      <div className="flex-1 overflow-y-auto px-8 py-8 scroll-smooth">
        <div className="mx-auto max-w-3xl w-full">
          <AnimatePresence mode="wait">
            {isEmpty ? (
              <WelcomeScreen key="welcome" />
            ) : (
              <div key="messages" className="flex flex-col gap-6">
                {messages.map((msg, i) => (
                  <MessageBubble key={msg.id} message={msg} index={i} />
                ))}

                {/* Typing indicator */}
                <AnimatePresence>
                  {isLoading && <TypingIndicator key="typing" />}
                </AnimatePresence>
              </div>
            )}
          </AnimatePresence>

          {/* Âncora para scroll automático */}
          <div ref={messagesEndRef} className="h-4" />
        </div>
      </div>

      {/* Banner de erro */}
      <AnimatePresence>
        {error && (
          <div className="mx-auto max-w-3xl w-full px-8 mb-4">
            <motion.div
              className="flex items-center justify-between gap-3 rounded-xl border border-red-950 bg-red-950/20 px-4 py-3 shadow-lg backdrop-blur-xl"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
            >
              <p className="text-xs font-semibold text-red-400">{error}</p>
              <button
                onClick={onClearError}
                className="text-xs font-bold text-red-400 hover:text-red-300 transition-colors cursor-pointer"
              >
                Fechar
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Input e Rodapé (Alinhamento em max-w-3xl) */}
      <div className="mx-auto w-full max-w-3xl px-8 pb-6">
        <MessageInput
          onSend={onSend}
          onNewSession={onNewSession}
          isLoading={isLoading}
          disabled={isBackendOnline === false}
        />
        
        {/* Aviso clínico sutil no rodapé */}
        <p className="mt-3.5 text-center text-[11px] leading-relaxed text-slate-400 max-w-md mx-auto font-medium">
          As respostas são baseadas exclusivamente nos materiais de estudo carregados.
          Sempre consulte seu professor para validação clínica.
        </p>
      </div>
    </div>
  );
}

// ── Tela de boas-vindas acolhedora (ChatGPT/SaaS Style com tema dark-celeste) ─

function WelcomeScreen() {
  const SUGGESTIONS = [
    'Quais os sinais do choque hipovolêmico?',
    'Como preparar medicamentos endovenosos?',
    'Como realizar avaliação neurológica?',
    'Medidas de prevenção de infecção hospitalar',
  ];

  return (
    <motion.div
      className="flex flex-col items-center justify-center py-20 text-center"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Título grande e acolhedor com a marca e cores oficiais */}
      <h2 className="text-3xl sm:text-4xl font-black text-slate-800 tracking-tight leading-tight font-display">
        Como posso ajudar nos seus <span style={{ color: '#0ea5e9', textShadow: '0 0 20px rgba(14,165,233,0.35)' }}>estudos</span> hoje?
      </h2>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-500 font-medium">
        Olá! Faça perguntas com base nos materiais acadêmicos carregados para receber condutas clínicas de enfermagem referenciadas.
      </p>

      {/* Sugestões: Cards altamente clicáveis em glassmorphism */}
      <div className="mt-10 w-full max-w-xl">
        <div className="grid grid-cols-2 gap-3">
          {SUGGESTIONS.map((suggestion, i) => (
            <motion.button
              key={i}
              className="bg-white border border-sky-200 hover:border-sky-400 hover:shadow-[0_4px_20px_rgba(14,165,233,0.15)] text-slate-600 hover:text-slate-800 rounded-xl px-4 py-3 cursor-pointer transition-all text-xs font-semibold text-left flex items-start gap-2.5 shadow-sm"
              whileHover={{ scale: 1.015 }}
              whileTap={{ scale: 0.985 }}
              onClick={() => {
                const event = new CustomEvent('suggestion-click', {
                  detail: suggestion,
                });
                window.dispatchEvent(event);
              }}
            >
              <Sparkles className="h-4 w-4 text-sky-400 mt-0.5 flex-shrink-0" strokeWidth={2.5} />
              <span className="leading-relaxed">{suggestion}</span>
            </motion.button>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
