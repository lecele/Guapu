export const FLOW_VERSION = 'v1';

export type ChatMode = 'livre' | 'resumo' | 'quiz' | 'info';

export type ChatFlowState =
  | 'MENU_PRINCIPAL'
  | 'LIVRE'
  | 'RESUMO_AGUARDANDO_TEMA'
  | 'RESUMO_CONCLUIDO'
  | 'QUIZ_AGUARDANDO_TEMA'
  | 'QUIZ_EM_ANDAMENTO'
  | 'QUIZ_SEGUNDA_TENTATIVA'
  | 'QUIZ_CONCLUIDO'
  | 'INFORMACOES_AGUARDANDO_PERGUNTA'
  | 'ENCERRADA';

export type FlowIntent =
  | 'greeting'
  | 'menu_return'
  | 'farewell'
  | 'menu_resumo'
  | 'menu_quiz'
  | 'menu_info'
  | 'aprofundar'
  | 'outro_tema'
  | 'reformular_conciso'
  | 'content';

export type GenerationMode =
  | 'simulado_tema'
  | 'simulado_respondendo'
  | 'simulado_segunda_tentativa'
  | 'resumo_aprofundar'
  | 'resumo_reformular'
  | 'resumo'
  | 'info'
  | 'livre';

export type FastResponseKey =
  | 'greeting'
  | 'menu'
  | 'farewell'
  | 'resumo_menu'
  | 'quiz_menu'
  | 'info_menu';

export interface SessionState {
  sessionId: string;
  state: ChatFlowState;
  mode: ChatMode;
  currentTopic: string;
  quizQuestion: number;
  quizAttempt: number;
  flowVersion: string;
  revision: number;
}

export interface FlowDecision {
  intent: FlowIntent;
  kind: 'fast' | 'generate';
  fastResponse?: FastResponseKey;
  generationMode?: GenerationMode;
  topic: string;
  stateBefore: SessionState;
  stateAfter: SessionState;
  quizQuestion: number;
  quizAttempt: number;
}

export function createDefaultSessionState(sessionId: string): SessionState {
  return {
    sessionId,
    state: 'MENU_PRINCIPAL',
    mode: 'livre',
    currentTopic: '',
    quizQuestion: 0,
    quizAttempt: 0,
    flowVersion: FLOW_VERSION,
    revision: 0,
  };
}

export function normalizeInput(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function detectFlowIntent(text: string): FlowIntent {
  const norm = normalizeInput(text);
  if (!norm) return 'greeting';

  if (
    /^(menu|voltar|inicio|home|opcoes|opcao|voltar pro comeco|quero o menu|menu principal|voltar ao menu|quero voltar ao menu|voltar para o menu|ir para o menu|retornar ao menu|quero voltar)$/.test(norm) ||
    (norm.length < 30 && /\bvoltar\b/.test(norm) && /\bmenu\b/.test(norm))
  ) return 'menu_return';

  if (/^(1|opcao 1|resumo de conteudo|1 resumo de conteudo|resumo)$/.test(norm)) return 'menu_resumo';
  if (/^(2|opcao 2|quiz da disciplina|quiz|simulado de prova|simulado|2 quiz da disciplina|2 simulado de prova)$/.test(norm)) return 'menu_quiz';
  if (/^(3|opcao 3|informacoes da disciplina|informacao da disciplina|3 informacoes da disciplina|informacoes|informacao)$/.test(norm)) return 'menu_info';
  if (/^(4|opcao 4|encerrar sessao|encerrar|sair|tchau|bye|adeus|finalizar)$/.test(norm)) return 'farewell';
  if (/^(aprofundar|aprofundar este tema|aprofundar mais|aprofundar o tema)$/.test(norm)) return 'aprofundar';
  if (/^(escolher outro tema|outro tema|mudar tema|trocar tema)$/.test(norm)) return 'outro_tema';
  if (/^(seja mais concis[oa]|mais concis[oa]|resuma mais|resuma isso|simplifique|explique de outra forma|resposta mais curta|mais curto|mais curta)$/.test(norm)) return 'reformular_conciso';

  const words = norm.split(/\s+/).filter(Boolean);
  if (
    words.length <= 3 &&
    words.some((word) => ['oi', 'ola', 'opa', 'bom', 'boa', 'hello', 'hi', 'salve', 'comecar', 'tutor', 'bot'].includes(word))
  ) return 'greeting';

  return 'content';
}

function nextState(state: SessionState, patch: Partial<SessionState>): SessionState {
  return {
    ...state,
    ...patch,
    flowVersion: FLOW_VERSION,
    revision: state.revision + 1,
  };
}

function extractInlineRequest(message: string): { mode: ChatMode; topic: string } | null {
  const norm = normalizeInput(message);
  const patterns: Array<{ mode: ChatMode; pattern: RegExp; original: RegExp }> = [
    {
      mode: 'quiz',
      pattern: /^(?:quero\s+(?:um\s+)?|queria\s+(?:um\s+)?)?(?:fazer\s+)?(?:simulado(?: de prova)?|quiz(?: da disciplina)?|opcao 2|2)\s*(?:sobre|de|da|do|com|-|:)?\s*(.+)$/i,
      original: /^(?:quero\s+(?:um\s+)?|queria\s+(?:um\s+)?)?(?:fazer\s+)?(?:simulado(?: de prova)?|quiz(?: da disciplina)?|op[cç][aã]o 2|2)\s*(?:sobre|de|da|do|com|-|:)?\s*/i,
    },
    {
      mode: 'resumo',
      pattern: /^(?:quero\s+(?:um\s+)?|queria\s+(?:um\s+)?)?(?:fazer\s+)?(?:resumo(?: de conteudo)?|opcao 1|1)\s*(?:sobre|de|da|do|com|-|:)?\s*(.+)$/i,
      original: /^(?:quero\s+(?:um\s+)?|queria\s+(?:um\s+)?)?(?:fazer\s+)?(?:resumo(?: de conte[uú]do)?|op[cç][aã]o 1|1)\s*(?:sobre|de|da|do|com|-|:)?\s*/i,
    },
    {
      mode: 'info',
      pattern: /^(?:quero\s+(?:saber\s+)?|queria\s+(?:saber\s+)?)?(?:informacoes|informacao|opcao 3|3)\s*(?:sobre|de|da|do|com|-|:)?\s*(.+)$/i,
      original: /^(?:quero\s+(?:saber\s+)?|queria\s+(?:saber\s+)?)?(?:informa[cç][oõ]es|informa[cç][aã]o|op[cç][aã]o 3|3)\s*(?:sobre|de|da|do|com|-|:)?\s*/i,
    },
  ];

  for (const candidate of patterns) {
    const match = norm.match(candidate.pattern);
    if (!match?.[1]?.trim()) continue;
    const topic = message.replace(candidate.original, '').trim();
    if (topic) return { mode: candidate.mode, topic };
  }
  return null;
}

export function resolveTurn(state: SessionState, message: string): FlowDecision {
  const intent = detectFlowIntent(message);
  const base = { intent, stateBefore: state, quizQuestion: state.quizQuestion, quizAttempt: state.quizAttempt };

  if (intent === 'greeting' || intent === 'menu_return') {
    return {
      ...base,
      kind: 'fast',
      fastResponse: intent === 'greeting' ? 'greeting' : 'menu',
      topic: '',
      stateAfter: nextState(state, { state: 'MENU_PRINCIPAL', mode: 'livre', currentTopic: '', quizQuestion: 0, quizAttempt: 0 }),
    };
  }

  if (intent === 'farewell') {
    return {
      ...base,
      kind: 'fast',
      fastResponse: 'farewell',
      topic: state.currentTopic,
      stateAfter: nextState(state, { state: 'ENCERRADA', mode: 'livre', quizQuestion: 0, quizAttempt: 0 }),
    };
  }

  if (intent === 'menu_resumo') {
    return {
      ...base,
      kind: 'fast',
      fastResponse: 'resumo_menu',
      topic: '',
      stateAfter: nextState(state, { state: 'RESUMO_AGUARDANDO_TEMA', mode: 'resumo', currentTopic: '', quizQuestion: 0, quizAttempt: 0 }),
    };
  }

  if (intent === 'menu_quiz') {
    return {
      ...base,
      kind: 'fast',
      fastResponse: 'quiz_menu',
      topic: '',
      stateAfter: nextState(state, { state: 'QUIZ_AGUARDANDO_TEMA', mode: 'quiz', currentTopic: '', quizQuestion: 0, quizAttempt: 0 }),
    };
  }

  if (intent === 'menu_info') {
    return {
      ...base,
      kind: 'fast',
      fastResponse: 'info_menu',
      topic: '',
      stateAfter: nextState(state, { state: 'INFORMACOES_AGUARDANDO_PERGUNTA', mode: 'info', currentTopic: '', quizQuestion: 0, quizAttempt: 0 }),
    };
  }

  if (intent === 'outro_tema') {
    const mode = state.mode === 'quiz' ? 'quiz' : state.mode === 'info' ? 'info' : 'resumo';
    const targetState: ChatFlowState = mode === 'quiz'
      ? 'QUIZ_AGUARDANDO_TEMA'
      : mode === 'info'
        ? 'INFORMACOES_AGUARDANDO_PERGUNTA'
        : 'RESUMO_AGUARDANDO_TEMA';
    const fastResponse: FastResponseKey = mode === 'quiz' ? 'quiz_menu' : mode === 'info' ? 'info_menu' : 'resumo_menu';
    return {
      ...base,
      kind: 'fast',
      fastResponse,
      topic: '',
      stateAfter: nextState(state, { state: targetState, mode, currentTopic: '', quizQuestion: 0, quizAttempt: 0 }),
    };
  }

  const inline = extractInlineRequest(message);
  if (inline?.mode === 'resumo') {
    return {
      ...base,
      kind: 'generate',
      generationMode: 'resumo',
      topic: inline.topic,
      stateAfter: nextState(state, { state: 'RESUMO_CONCLUIDO', mode: 'resumo', currentTopic: inline.topic, quizQuestion: 0, quizAttempt: 0 }),
    };
  }
  if (inline?.mode === 'quiz') {
    return {
      ...base,
      kind: 'generate',
      generationMode: 'simulado_tema',
      topic: inline.topic,
      quizQuestion: 1,
      quizAttempt: 1,
      stateAfter: nextState(state, { state: 'QUIZ_EM_ANDAMENTO', mode: 'quiz', currentTopic: inline.topic, quizQuestion: 1, quizAttempt: 1 }),
    };
  }
  if (inline?.mode === 'info') {
    return {
      ...base,
      kind: 'generate',
      generationMode: 'info',
      topic: inline.topic,
      stateAfter: nextState(state, { state: 'INFORMACOES_AGUARDANDO_PERGUNTA', mode: 'info', currentTopic: inline.topic, quizQuestion: 0, quizAttempt: 0 }),
    };
  }

  if (intent === 'aprofundar') {
    if (state.state === 'RESUMO_CONCLUIDO' && state.currentTopic) {
      return {
        ...base,
        kind: 'generate',
        generationMode: 'resumo_aprofundar',
        topic: state.currentTopic,
        stateAfter: nextState(state, { state: 'RESUMO_CONCLUIDO', mode: 'resumo' }),
      };
    }
    return {
      ...base,
      kind: 'fast',
      fastResponse: 'resumo_menu',
      topic: '',
      stateAfter: nextState(state, { state: 'RESUMO_AGUARDANDO_TEMA', mode: 'resumo', currentTopic: '', quizQuestion: 0, quizAttempt: 0 }),
    };
  }

  if (intent === 'reformular_conciso' && state.state === 'RESUMO_CONCLUIDO' && state.currentTopic) {
    return {
      ...base,
      kind: 'generate',
      generationMode: 'resumo_reformular',
      topic: state.currentTopic,
      stateAfter: nextState(state, { state: 'RESUMO_CONCLUIDO', mode: 'resumo' }),
    };
  }

  if (state.state === 'RESUMO_AGUARDANDO_TEMA') {
    return {
      ...base,
      kind: 'generate',
      generationMode: 'resumo',
      topic: message.trim(),
      stateAfter: nextState(state, { state: 'RESUMO_CONCLUIDO', mode: 'resumo', currentTopic: message.trim() }),
    };
  }

  if (state.state === 'QUIZ_AGUARDANDO_TEMA') {
    return {
      ...base,
      kind: 'generate',
      generationMode: 'simulado_tema',
      topic: message.trim(),
      quizQuestion: 1,
      quizAttempt: 1,
      stateAfter: nextState(state, { state: 'QUIZ_EM_ANDAMENTO', mode: 'quiz', currentTopic: message.trim(), quizQuestion: 1, quizAttempt: 1 }),
    };
  }

  if (state.state === 'QUIZ_EM_ANDAMENTO' || state.state === 'QUIZ_SEGUNDA_TENTATIVA') {
    const secondAttempt = state.state === 'QUIZ_SEGUNDA_TENTATIVA' || state.quizAttempt === 2;
    return {
      ...base,
      kind: 'generate',
      generationMode: secondAttempt ? 'simulado_segunda_tentativa' : 'simulado_respondendo',
      topic: state.currentTopic,
      quizQuestion: Math.max(1, state.quizQuestion),
      quizAttempt: secondAttempt ? 2 : 1,
      stateAfter: state,
    };
  }

  if (state.state === 'INFORMACOES_AGUARDANDO_PERGUNTA') {
    return {
      ...base,
      kind: 'generate',
      generationMode: 'info',
      topic: message.trim(),
      stateAfter: nextState(state, { state: 'INFORMACOES_AGUARDANDO_PERGUNTA', mode: 'info', currentTopic: message.trim() }),
    };
  }

  return {
    ...base,
    kind: 'generate',
    generationMode: 'livre',
    topic: state.currentTopic,
    stateAfter: nextState(state, { state: 'LIVRE', mode: 'livre' }),
  };
}

export function finalizeGeneratedTurn(decision: FlowDecision, assistantText: string): SessionState {
  if (decision.generationMode !== 'simulado_respondendo' && decision.generationMode !== 'simulado_segunda_tentativa') {
    return decision.stateAfter;
  }

  const currentQuestion = Math.max(1, decision.quizQuestion);
  const requestsRetry = /resposta est[aá] incorreta[\s\S]{0,80}tente novamente/i.test(assistantText);

  if (decision.generationMode === 'simulado_respondendo' && requestsRetry) {
    return nextState(decision.stateBefore, {
      state: 'QUIZ_SEGUNDA_TENTATIVA',
      mode: 'quiz',
      quizQuestion: currentQuestion,
      quizAttempt: 2,
    });
  }

  if (currentQuestion >= 3) {
    return nextState(decision.stateBefore, {
      state: 'QUIZ_CONCLUIDO',
      mode: 'quiz',
      quizQuestion: 3,
      quizAttempt: decision.quizAttempt,
    });
  }

  return nextState(decision.stateBefore, {
    state: 'QUIZ_EM_ANDAMENTO',
    mode: 'quiz',
    quizQuestion: currentQuestion + 1,
    quizAttempt: 1,
  });
}

