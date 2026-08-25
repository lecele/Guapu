'use client';

// components/chat/TypingIndicator.tsx — Indicador de digitação, azul

import { motion } from 'framer-motion';

export function TypingIndicator() {
  return (
    <motion.div
      className="flex items-end gap-3"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      transition={{ duration: 0.25 }}
    >
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        <div className="absolute inset-0 rounded-full bg-[#1573C2]/20 blur-md scale-125 animate-pulse" />
        <div className="relative flex h-9 w-9 items-center justify-center rounded-full border border-[#1573C2]/35 bg-white dark:bg-[#05111f] shadow-sm">
          <span className="material-symbols-outlined text-[18px] text-[#1573C2] dark:text-blue-400">
            medical_services
          </span>
        </div>
      </div>

      {/* Bubble com três pontinhos */}
      <div className="rounded-2xl rounded-bl-none border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0d1e35] px-5 py-4 shadow-sm">
        <div className="flex items-center gap-1.5 h-4">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="block h-2 w-2 rounded-full bg-[#1573C2]/60 dark:bg-blue-400/60"
              animate={{ y: [0, -5, 0] }}
              transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}
