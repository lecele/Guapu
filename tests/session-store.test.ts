import assert from 'node:assert/strict';
import test from 'node:test';

import { inferLegacySessionState, type ChatHistoryItem } from '../lib/chat/session-store.ts';

test('inferência legada preserva o tema ao pedir resposta mais concisa', () => {
  const history: ChatHistoryItem[] = [
    { role: 'user', content: 'Resumo sobre hemostasia' },
    { role: 'assistant', content: 'Resumo... Deseja aprofundar este tema, escolher outro tema, voltar ao menu principal ou encerrar a sessão?' },
    { role: 'user', content: 'Seja mais conciso' },
    { role: 'assistant', content: 'Versão curta... Deseja aprofundar este tema?' },
  ];

  const state = inferLegacySessionState('session-summary', history);
  assert.equal(state.state, 'RESUMO_CONCLUIDO');
  assert.equal(state.currentTopic, 'hemostasia');
});

test('inferência legada mantém tema e número da questão na segunda tentativa', () => {
  const history: ChatHistoryItem[] = [
    { role: 'user', content: 'Quiz sobre feridas' },
    { role: 'assistant', content: '**Questão 1:** Enunciado' },
    { role: 'user', content: 'A' },
    { role: 'assistant', content: 'Correto. **Questão 2:** Novo enunciado' },
    { role: 'user', content: 'B' },
    { role: 'assistant', content: 'Sua resposta está incorreta. Tente novamente! Qual das alternativas você escolheria agora?' },
  ];

  const state = inferLegacySessionState('session-quiz', history);
  assert.equal(state.state, 'QUIZ_SEGUNDA_TENTATIVA');
  assert.equal(state.currentTopic, 'feridas');
  assert.equal(state.quizQuestion, 2);
  assert.equal(state.quizAttempt, 2);
});
