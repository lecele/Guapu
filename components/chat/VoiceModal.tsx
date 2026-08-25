'use client';

// components/chat/VoiceModal.tsx — Modal de gravação com preview de transcrição

import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface VoiceModalProps {
  isListening: boolean;
  interimText: string;
  onStop: () => void;
}

export function VoiceModal({ isListening, interimText, onStop }: VoiceModalProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isListening) onStop();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isListening, onStop]);

  return (
    <AnimatePresence>
      {isListening && (
        <motion.div
          key="voice-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={onStop}
        >
          <motion.div
            key="voice-card"
            initial={{ scale: 0.85, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.85, opacity: 0, y: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            className="
              relative flex flex-col items-center gap-5
              bg-white dark:bg-[#06101e]
              rounded-[2rem] px-8 py-9
              shadow-[0_30px_60px_rgba(0,0,0,0.4)]
              border border-blue-200/40 dark:border-blue-500/20
              w-[320px] max-w-[90vw]
            "
            onClick={(e) => e.stopPropagation()}
          >
            {/* Título */}
            <p className="text-[#1573C2] dark:text-blue-300 font-bold text-xs uppercase tracking-widest">
              🎤 Ouvindo você...
            </p>

            {/* Ondas concêntricas */}
            <div className="relative flex items-center justify-center w-28 h-28">
              <motion.span
                className="absolute rounded-full bg-[#1573C2]/10"
                animate={{ scale: [1, 1.8, 1], opacity: [0.5, 0, 0.5] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                style={{ width: 112, height: 112 }}
              />
              <motion.span
                className="absolute rounded-full bg-[#1573C2]/18"
                animate={{ scale: [1, 1.5, 1], opacity: [0.6, 0, 0.6] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut', delay: 0.35 }}
                style={{ width: 82, height: 82 }}
              />
              <motion.span
                className="absolute rounded-full bg-[#1573C2]/28"
                animate={{ scale: [1, 1.28, 1], opacity: [0.7, 0.1, 0.7] }}
                transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut', delay: 0.7 }}
                style={{ width: 58, height: 58 }}
              />
              {/* Botão central */}
              <motion.div
                className="relative z-10 w-14 h-14 rounded-full bg-[#1573C2] flex items-center justify-center shadow-lg shadow-blue-500/30"
                animate={{ scale: [1, 1.07, 1] }}
                transition={{ duration: 0.8, repeat: Infinity, ease: 'easeInOut' }}
              >
                <span className="material-symbols-outlined text-white text-[28px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                  mic
                </span>
              </motion.div>
            </div>

            {/* Transcrição em tempo real */}
            <div className="min-h-[36px] w-full flex items-center justify-center px-2">
              {interimText ? (
                <motion.p
                  key={interimText}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-slate-600 dark:text-slate-300 text-sm text-center leading-snug italic"
                >
                  "{interimText}"
                </motion.p>
              ) : (
                <p className="text-slate-400 dark:text-slate-500 text-xs text-center">
                  Fale sua pergunta em português...
                </p>
              )}
            </div>

            {/* Botão Parar */}
            <button
              onClick={onStop}
              className="
                flex items-center gap-2
                bg-red-500 hover:bg-red-600
                text-white font-bold text-sm
                px-7 py-3 rounded-full
                shadow-md transition-all active:scale-95 cursor-pointer
              "
            >
              <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                stop_circle
              </span>
              Parar Gravação
            </button>

            <p className="text-slate-400 dark:text-slate-600 text-[10px] text-center">
              Toque fora ou pressione Esc para cancelar
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
