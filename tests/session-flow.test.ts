import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDefaultSessionState,
  finalizeGeneratedTurn,
  resolveTurn,
  type SessionState,
} from '../lib/chat/session-flow.ts';

function state(patch: Partial<SessionState>): SessionState {
  return { ...createDefaultSessionState('session-test'), ...patch };
}

test('selecionar resumo solicita o tema', () => {
  const decision = resolveTurn(createDefaultSessionState('s1'), 'Resumo de Conteúdo');
  assert.equal(decision.kind, 'fast');
  assert.equal(decision.stateAfter.state, 'RESUMO_AGUARDANDO_TEMA');
});

test('resumo com tema inline não pergunta o tema novamente', () => {
  const decision = resolveTurn(createDefaultSessionState('s1'), 'Resumo sobre hemostasia');
  assert.equal(decision.generationMode, 'resumo');
  assert.equal(decision.topic, 'hemostasia');
  assert.equal(decision.stateAfter.state, 'RESUMO_CONCLUIDO');
});

test('tema informado depois do menu inicia resumo', () => {
  const decision = resolveTurn(state({ state: 'RESUMO_AGUARDANDO_TEMA', mode: 'resumo' }), 'Infecção de sítio cirúrgico');
  assert.equal(decision.generationMode, 'resumo');
  assert.equal(decision.stateAfter.currentTopic, 'Infecção de sítio cirúrgico');
});

test('aprofundar só aprofunda quando existe resumo ativo', () => {
  const valid = resolveTurn(state({ state: 'RESUMO_CONCLUIDO', mode: 'resumo', currentTopic: 'hemostasia' }), 'Aprofundar');
  assert.equal(valid.generationMode, 'resumo_aprofundar');
  assert.equal(valid.topic, 'hemostasia');

  const invalid = resolveTurn(createDefaultSessionState('s1'), 'Aprofundar');
  assert.equal(invalid.kind, 'fast');
  assert.equal(invalid.stateAfter.state, 'RESUMO_AGUARDANDO_TEMA');
});

test('pedido de concisão não vira aprofundamento', () => {
  const decision = resolveTurn(state({ state: 'RESUMO_CONCLUIDO', mode: 'resumo', currentTopic: 'hemostasia' }), 'Seja mais conciso');
  assert.equal(decision.generationMode, 'resumo_reformular');
  assert.notEqual(decision.generationMode, 'resumo_aprofundar');
  assert.equal(decision.stateAfter.state, 'RESUMO_CONCLUIDO');
});

test('escolher outro tema limpa o tema atual', () => {
  const decision = resolveTurn(state({ state: 'RESUMO_CONCLUIDO', mode: 'resumo', currentTopic: 'hemostasia' }), 'Escolher outro tema');
  assert.equal(decision.stateAfter.state, 'RESUMO_AGUARDANDO_TEMA');
  assert.equal(decision.stateAfter.currentTopic, '');
});

test('quiz com tema inline começa na questão 1', () => {
  const decision = resolveTurn(createDefaultSessionState('s1'), 'Quiz sobre feridas');
  assert.equal(decision.generationMode, 'simulado_tema');
  assert.equal(decision.stateAfter.state, 'QUIZ_EM_ANDAMENTO');
  assert.equal(decision.stateAfter.quizQuestion, 1);
  assert.equal(decision.stateAfter.currentTopic, 'feridas');
});

test('resposta incorreta no quiz mantém a questão e abre segunda tentativa', () => {
  const before = state({ state: 'QUIZ_EM_ANDAMENTO', mode: 'quiz', currentTopic: 'feridas', quizQuestion: 1, quizAttempt: 1 });
  const decision = resolveTurn(before, 'B');
  const after = finalizeGeneratedTurn(decision, 'Sua resposta está incorreta. Tente novamente! Qual das alternativas você escolheria agora?');
  assert.equal(after.state, 'QUIZ_SEGUNDA_TENTATIVA');
  assert.equal(after.quizQuestion, 1);
  assert.equal(after.quizAttempt, 2);
});

test('entrada inválida no quiz não é contabilizada como tentativa', () => {
  const before = state({ state: 'QUIZ_EM_ANDAMENTO', mode: 'quiz', currentTopic: 'feridas', quizQuestion: 1, quizAttempt: 1 });
  const decision = resolveTurn(before, 'não sei');
  assert.equal(decision.kind, 'fast');
  assert.equal(decision.fastResponse, 'quiz_invalid');
  assert.equal(decision.stateAfter, before);
});

test('resposta correta avança para a próxima questão', () => {
  const before = state({ state: 'QUIZ_EM_ANDAMENTO', mode: 'quiz', currentTopic: 'feridas', quizQuestion: 1, quizAttempt: 1 });
  const decision = resolveTurn(before, 'A');
  const after = finalizeGeneratedTurn(decision, 'Correto!\n\n**Questão 2:** ...');
  assert.equal(after.state, 'QUIZ_EM_ANDAMENTO');
  assert.equal(after.quizQuestion, 2);
  assert.equal(after.quizAttempt, 1);
});

test('quiz não avança semanticamente sem a próxima questão visível', () => {
  const before = state({ state: 'QUIZ_SEGUNDA_TENTATIVA', mode: 'quiz', currentTopic: 'feridas', quizQuestion: 1, quizAttempt: 2 });
  const decision = resolveTurn(before, 'A');
  const after = finalizeGeneratedTurn(decision, 'A alternativa correta é a C.');
  assert.equal(after.state, 'QUIZ_EM_ANDAMENTO');
  assert.equal(after.quizQuestion, 2);
});

test('terceira questão conclui o quiz', () => {
  const before = state({ state: 'QUIZ_EM_ANDAMENTO', mode: 'quiz', currentTopic: 'feridas', quizQuestion: 3, quizAttempt: 1 });
  const decision = resolveTurn(before, 'A');
  const after = finalizeGeneratedTurn(decision, 'Correto! Deseja continuar o quiz?');
  assert.equal(after.state, 'QUIZ_CONCLUIDO');
  assert.equal(after.quizQuestion, 3);
});

test('informações com pergunta inline não solicita outra pergunta', () => {
  const decision = resolveTurn(createDefaultSessionState('s1'), 'Informações sobre critérios de avaliação');
  assert.equal(decision.generationMode, 'info');
  assert.equal(decision.topic, 'critérios de avaliação');
  assert.equal(decision.stateAfter.mode, 'info');
});

test('voltar ao menu limpa modalidade, tema e quiz', () => {
  const decision = resolveTurn(
    state({ state: 'QUIZ_EM_ANDAMENTO', mode: 'quiz', currentTopic: 'feridas', quizQuestion: 2, quizAttempt: 1 }),
    'Voltar ao menu principal',
  );
  assert.equal(decision.stateAfter.state, 'MENU_PRINCIPAL');
  assert.equal(decision.stateAfter.mode, 'livre');
  assert.equal(decision.stateAfter.currentTopic, '');
  assert.equal(decision.stateAfter.quizQuestion, 0);
});
