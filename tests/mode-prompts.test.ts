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
