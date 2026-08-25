'use client';

// components/sidebar/Logo.tsx — Branding da "Agents na Saúde"

import { Activity } from 'lucide-react';
import { motion } from 'framer-motion';

export function Logo() {
  return (
    <motion.div
      className="flex items-center gap-3.5"
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
    >
      {/* Símbolo tecnológico oficial com glow azul celeste */}
      <div className="relative h-11 w-11 flex-shrink-0">
        <div className="absolute inset-0 rounded-full bg-sky-500/20 blur-md scale-110" />
        <svg width="100%" height="100%" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="relative z-10 drop-shadow-[0_0_8px_rgba(14,165,233,0.6)]">
          <path d="M38 10H62V38H90V62H62V90H38V62H10V38H38V10Z" stroke="#0ea5e9" strokeWidth="4.5" strokeLinejoin="round" className="animate-pulse"></path>
          <path d="M50 18V33" stroke="#0ea5e9" strokeWidth="2.5" strokeLinecap="round" opacity="0.8"></path>
          <path d="M50 62V82" stroke="#0ea5e9" strokeWidth="2.5" strokeLinecap="round" opacity="0.8"></path>
          <path d="M18 50H31" stroke="#0ea5e9" strokeWidth="2.5" strokeLinecap="round" opacity="0.8"></path>
          <path d="M69 50H82" stroke="#0ea5e9" strokeWidth="2.5" strokeLinecap="round" opacity="0.8"></path>
          <g className="animate-pulse">
            <rect x="39" y="42" width="22" height="16" stroke="#0ea5e9" strokeWidth="2" rx="4" fill="none"></rect>
            <line x1="45" y1="47" x2="45" y2="52" stroke="#0ea5e9" strokeWidth="2.5" strokeLinecap="round"></line>
            <line x1="55" y1="47" x2="55" y2="52" stroke="#0ea5e9" strokeWidth="2.5" strokeLinecap="round"></line>
            <line x1="35" y1="50" x2="39" y2="50" stroke="#0ea5e9" strokeWidth="2.5" strokeLinecap="round"></line>
            <line x1="61" y1="50" x2="65" y2="50" stroke="#0ea5e9" strokeWidth="2.5" strokeLinecap="round"></line>
            <path d="M46 42V37H52" stroke="#0ea5e9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"></path>
          </g>
        </svg>
      </div>

      {/* Texto do logo */}
      <div className="flex flex-col">
        <span className="text-[17px] font-black leading-tight tracking-tight text-white font-display">
          Agentes na Saúde
        </span>
        <span className="text-[10px] font-bold leading-tight tracking-[0.12em] uppercase mt-0.5" style={{
          background: 'linear-gradient(90deg, #0ea5e9, #38bdf8, #ffffff, #0ea5e9)',
          backgroundSize: '250% 100%',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}>
          Tutor de Enfermagem
        </span>
      </div>
    </motion.div>
  );
}
