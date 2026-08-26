import test from 'node:test';
import assert from 'node:assert/strict';

import { buildModePrompt } from '../lib/chat/prompts/modes.ts';

test('quiz prompt mantém o tema como escopo imutável', () => {
  const prompt = buildModePrompt({
    mode: 'simulado_tema',
    question: 'quiz sobre fios de sutura',
    topic: 'fios de sutura',
    quizQuestion: 1,
  });

  assert.match(prompt, /tema imutável deste quiz é "fios de sutura"/i);
  assert.match(prompt, /Ignore temas de quizzes anteriores/i);
});

test('prompt administrativo impede reconstrução de fórmula incompleta', () => {
  const prompt = buildModePrompt({
    mode: 'info',
    question: 'Qual é a fórmula da média final?',
    topic: 'Qual é a fórmula da média final?',
    quizQuestion: 0,
  });

  assert.match(prompt, /confira a soma aritmética/i);
  assert.match(prompt, /tabela recuperada estiver truncada, incompleta ou inconsistente/i);
  assert.match(prompt, /não reconstrua a fórmula/i);
});
