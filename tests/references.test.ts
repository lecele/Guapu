import test from 'node:test';
import assert from 'node:assert/strict';

import { finalizeReferences } from '../lib/chat/references.ts';

test('substitui referências geradas pelo modelo por fontes do RAG em linhas separadas', () => {
  const answer = finalizeReferences(
    'Explicação breve.\n\nReferências: fonte inventada • Referência: outra fonte\n\nDeseja aprofundar este tema?',
    [{ source: 'aula__cuidados_pos_operatorios_v1.pdf' }, { source: 'aula__cuidados_pos_operatorios_v1.pdf' }, { source: 'plano_de_ensino.docx' }],
    'resumo',
  );

  assert.match(answer, /- Referência: aula cuidados pos operatorios v1/);
  assert.match(answer, /- Referência: plano de ensino/);
  assert.doesNotMatch(answer, /fonte inventada/);
  assert.match(answer, /Deseja aprofundar este tema\?/);
});

test('não adiciona referências durante o quiz', () => {
  const answer = finalizeReferences('**Questão 1:**\n\n**A)** Uma', [{ source: 'aula.pdf' }], 'simulado_tema');
  assert.doesNotMatch(answer, /Referências/);
});
