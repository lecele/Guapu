import test from 'node:test';
import assert from 'node:assert/strict';

import { finalizeReferences } from '../lib/chat/references.ts';

test('substitui referências geradas pelo modelo por dados presentes no trecho RAG', () => {
  const answer = finalizeReferences(
    'Explicação breve.\n\nReferências: fonte inventada • Referência: outra fonte\n\nDeseja aprofundar este tema?',
    [
      { source: 'aula__cuidados_pos_operatorios_v1.pdf', content: 'Silva (2022). Cuidados perioperatórios em cirurgia geral. Capítulo 4, p. 45-52.' },
      { source: 'aula__cuidados_pos_operatorios_v1.pdf', content: 'Silva (2022). Cuidados perioperatórios em cirurgia geral. Capítulo 4, p. 45-52.' },
      { source: 'plano_de_ensino.docx', content: 'Plano de ensino sem metadados bibliográficos no trecho recuperado.' },
    ],
    'resumo',
  );

  assert.match(answer, /- Silva \(2022\) Cuidados perioperatórios em cirurgia geral\. p\. 45-52\./);
  assert.match(answer, /- Informação não disponível no artigo/);
  assert.doesNotMatch(answer, /aula cuidados pos operatorios|plano de ensino\.docx/i);
  assert.doesNotMatch(answer, /fonte inventada/);
  assert.match(answer, /Deseja aprofundar este tema\?/);
});

test('não adiciona referências durante o quiz', () => {
  const answer = finalizeReferences('**Questão 1:**\n\n**A)** Uma', [{ source: 'aula.pdf' }], 'simulado_tema');
  assert.doesNotMatch(answer, /Referências/);
});
