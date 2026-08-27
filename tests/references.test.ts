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
  assert.doesNotMatch(answer, /- Informação não disponível no artigo/);
  assert.doesNotMatch(answer, /aula cuidados pos operatorios|plano de ensino\.docx/i);
  assert.doesNotMatch(answer, /fonte inventada/);
  assert.match(answer, /Deseja aprofundar este tema\?/);
});

test('não adiciona referências durante o quiz', () => {
  const answer = finalizeReferences('**Questão 1:**\n\n**A)** Uma', [{ source: 'aula.pdf' }], 'simulado_tema');
  assert.doesNotMatch(answer, /Referências/);
});

test('usa título de capítulo do conteúdo antes do fallback', () => {
  const answer = finalizeReferences(
    'Resumo do conteúdo.',
    [{ source: 'arquivo-que-nao-deve-aparecer.pdf', content: 'Capítulo 6 — Cuidados de Enfermagem no Pós-Operatório Imediato. A vigilância deve ser contínua.' }],
    'resumo',
  );

  assert.match(answer, /- Cuidados de Enfermagem no Pós-Operatório Imediato \(Cap\. 6\)\./);
  assert.doesNotMatch(answer, /arquivo-que-nao-deve-aparecer/i);
});

test('reconhece título quando autores estão na linha seguinte do trecho', () => {
  const answer = finalizeReferences(
    'Resumo.',
    [{ source: 'nao-usar.pdf', content: 'Intervenções fundamentais em cirurgia: diérese, hemostasia e síntese\nMedeiros AC, Dantas-Filho AM\nTexto do artigo.' }],
    'resumo',
  );
  assert.match(answer, /- Intervenções fundamentais em cirurgia: diérese, hemostasia e síntese\./);
});

test('não mistura fallback com uma referência identificada', () => {
  const answer = finalizeReferences(
    'Resumo.',
    [
      { source: 'um.pdf', content: 'Intervenções fundamentais em cirurgia\nMedeiros AC, Dantas-Filho AM' },
      { source: 'dois.pdf', content: 'Trecho sem pista bibliográfica.' },
    ],
    'resumo',
  );
  assert.match(answer, /Intervenções fundamentais em cirurgia/);
  assert.doesNotMatch(answer, /Informação não disponível no artigo/);
});
