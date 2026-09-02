import test from 'node:test';
import assert from 'node:assert/strict';

import { isOutOfDisciplineScope, resolveOutOfScopeTopic, OUT_OF_SCOPE_RESPONSE } from '../lib/chat/scope.ts';

// ── Redireciona: temas legítimos de enfermagem fora da ementa ───────────────

test('pediatria fica fora do escopo (caso real observado em 02/09/2026)', () => {
  assert.equal(
    resolveOutOfScopeTopic('Quais são os cuidados de enfermagem em pediatria no pós-operatório de criança?', 'livre'),
    'pediatria',
  );
});

test('reconhece as demais formas de pediatria e neonatologia', () => {
  for (const pergunta of [
    'cuidados com recém-nascido na sala de parto',
    'enfermagem neonatal em UTI',
    'como avaliar a dor no lactente',
    'cuidados de enfermagem com bebês',
    'resumo sobre puericultura',
  ]) {
    assert.ok(isOutOfDisciplineScope(pergunta, 'livre'), `deveria redirecionar: ${pergunta}`);
  }
});

test('reconhece obstetrícia e atenção primária', () => {
  assert.equal(resolveOutOfScopeTopic('cuidados de enfermagem à gestante no pré-natal', 'resumo'), 'obstetricia');
  assert.equal(resolveOutOfScopeTopic('assistência de enfermagem no puerpério', 'livre'), 'obstetricia');
  assert.equal(resolveOutOfScopeTopic('o papel do enfermeiro na atenção primária à saúde', 'livre'), 'atencao primaria');
});

// ── NÃO redireciona: falso positivo é pior que deixar passar ────────────────

test('temas centrais da disciplina nunca são redirecionados', () => {
  for (const pergunta of [
    'Resumo sobre infecção de sítio cirúrgico',
    'quais são os cuidados de enfermagem no pós-operatório imediato',
    'como funciona a classificação das cirurgias por potencial de contaminação',
    'cuidados com estomias intestinais',
    'o que é hemostasia',
    'quais os tempos cirúrgicos',
    'segurança do paciente e cirurgia segura',
    'avaliação nutricional no perioperatório',
    'quais são os critérios de avaliação da disciplina',
  ]) {
    assert.equal(isOutOfDisciplineScope(pergunta, 'livre'), false, `não deveria redirecionar: ${pergunta}`);
  }
});

test('menção comparativa ao público da disciplina não redireciona', () => {
  assert.equal(
    isOutOfDisciplineScope('como o cuidado pós-operatório no adulto difere do da criança?', 'livre'),
    false,
  );
});

test('saúde mental do paciente cirúrgico continua no escopo', () => {
  assert.equal(
    isOutOfDisciplineScope('como manejar a ansiedade e a saúde mental do paciente no pré-operatório?', 'livre'),
    false,
  );
});

// ── Só se aplica onde há geração de conteúdo educacional ───────────────────

test('não se aplica a comandos de navegação nem a modalidades sem geração', () => {
  assert.equal(isOutOfDisciplineScope('menu', 'livre'), false);
  assert.equal(isOutOfDisciplineScope('voltar', 'livre'), false);
  assert.equal(isOutOfDisciplineScope('pediatria', null), false);
  assert.equal(isOutOfDisciplineScope('cuidados com a criança', 'info'), false);
  assert.equal(isOutOfDisciplineScope('B', 'simulado_respondendo'), false);
});

test('o texto padrão 3.2 é usado literalmente, sem Referências', () => {
  assert.match(OUT_OF_SCOPE_RESPONSE, /^Isso foge ao escopo desta disciplina/);
  assert.doesNotMatch(OUT_OF_SCOPE_RESPONSE, /Refer[êe]ncias/i);
  assert.doesNotMatch(OUT_OF_SCOPE_RESPONSE, /\bRAG\b/);
  assert.doesNotMatch(OUT_OF_SCOPE_RESPONSE, /diretrizes [ée]ticas/i);
});
