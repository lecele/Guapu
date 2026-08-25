'use client';

import { motion } from 'framer-motion';
import { GuapuMark } from '@/components/icons/GuapuMark';

export function TypingIndicator() {
  return (
    <motion.div
      className="guapu-typing-row"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      aria-label="Guapu está preparando a resposta"
      role="status"
    >
      <GuapuMark size={28} />
      <div className="guapu-typing-bubble">
        {[0, 1, 2].map((index) => (
          <motion.span
            key={index}
            animate={{ y: [0, -4, 0] }}
            transition={{
              duration: 0.7,
              repeat: Infinity,
              delay: index * 0.14,
              ease: 'easeInOut',
            }}
          />
        ))}
      </div>
    </motion.div>
  );
}
