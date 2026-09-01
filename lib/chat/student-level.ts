import type { ChatHistoryItem } from './session-store.ts';

export type StudentLevel = 'iniciante' | 'intermediário' | 'avançado';

const beginnerSignals = [
  /o que e|o que é|defina|explique de forma simples|em palavras simples|nao entendo|não entendo|primeiro contato/i,
];
const advancedSignals = [
  /compare|contraste|criticamente|implicac(?:ao|ões)|evid[eê]ncia|limita[cç][oõ]es|nuances?|diferencie|justifique|relacione/i,
];
const technicalTerms = /assepsia|antissepsia|perioperat[oó]rio|hemostasia|s[íi]tio cir[uú]rgico|farmacocin[eé]tica|fisiopatologia|srbpa|srpa|estoma|sutura|desbridamento|antibioticoprofilaxia/gi;

export function inferStudentLevel(history: ChatHistoryItem[]): StudentLevel {
  let score = 0;
  for (const message of history) {
    if (message.role !== 'user') continue;
    const text = message.content.trim();
    if (!text || /^(menu|voltar|in[ií]cio|resumo|quiz|simulado|informa[cç][oõ]es|encerrar|aprofundar|seja mais concis[oa]|mais concis[oa]|responda novamente de forma concis[oa])$/i.test(text)) continue;
    if (beginnerSignals.some((signal) => signal.test(text))) score -= 2;
    if (advancedSignals.some((signal) => signal.test(text))) score += 2;
    const terms = text.match(technicalTerms)?.length ?? 0;
    if (terms >= 3) score += 1;
    if (text.length >= 180 && /[,:;]|\bporque\b|\bcomo\b/i.test(text)) score += 1;
  }
  if (score <= -2) return 'iniciante';
  if (score >= 2) return 'avançado';
  return 'intermediário';
}
