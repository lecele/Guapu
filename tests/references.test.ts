import test from 'node:test';
import assert from 'node:assert/strict';

import { finalizeReferences } from '../lib/chat/references.ts';

test('substitui referências geradas pelo modelo por dados presentes no trecho RAG', () => {
  const answer = finalizeReferences(
    'Explicação breve.\n\nReferências: fonte inventada • Referência: outra fonte\n\nDeseja aprofundar este tema?',
    [
      { source: 'aula__cuidados_pos_operatorios_v1.pdf', content: 'Silva (2022). Cuidados perioperatórios em cirurgia geral. Capítulo 4, p. 45-52.', metadata: { drive_file_id: 'drive-aula', page_number: 1, chunk_index: 0 } },
      { source: 'aula__cuidados_pos_operatorios_v1.pdf', content: 'Silva (2022). Cuidados perioperatórios em cirurgia geral. Capítulo 4, p. 45-52.' },
      { source: 'plano_de_ensino.docx', content: 'Plano de ensino sem metadados bibliográficos no trecho recuperado.' },
    ],
    'resumo',
  );

  assert.match(answer, /- Silva \(2022\) Cuidados perioperatórios em cirurgia geral\. p\. 45-52\. \[Fonte: aula__cuidados_pos_operatorios_v1\.pdf; p\. 1; trecho 1\]/);
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

test('prioriza a referência extraída do próprio documento e nunca o nome do arquivo', () => {
  const answer = finalizeReferences(
    'Explicação baseada no contexto.\n\nReferências: referência inventada.',
    [{
      source: 'biblioteca__nome-interno-que-nao-pode-ser-exibido.pdf',
      content: 'Trecho clínico recuperado.',
      metadata: {
        drive_file_id: 'drive-morton',
        reference_author: 'Morton, P.',
        reference_year: '2011',
        reference_title: 'Cuidados Críticos de Enfermagem',
        reference_section: 'Cap. 8',
        page_number: 8,
        chunk_index: 2,
      },
    }],
    'livre',
  );

  assert.match(answer, /- Morton, P\. \(2011\) Cuidados Críticos de Enfermagem \(Cap\. 8\)\. \[Fonte: biblioteca__nome-interno-que-nao-pode-ser-exibido\.pdf; p\. 8; trecho 3; Cap\. 8\]/);
  assert.doesNotMatch(answer, /referência inventada/i);
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

test('omite a seção quando só existe o nome técnico do arquivo', () => {
  const answer = finalizeReferences(
    'Resposta baseada nos materiais disponíveis.',
    [{ source: 'plano__ensino__2026.pdf', content: 'Trecho administrativo sem título bibliográfico ou autoria.' }],
    'info',
  );

  assert.equal(answer, 'Resposta baseada nos materiais disponíveis.');
  assert.doesNotMatch(answer, /plano ensino|Referências|Informação não disponível/i);
});

test('não exibe referências quando a resposta é uma recusa ou fallback', () => {
  const answer = finalizeReferences(
    'Não posso responder a essa solicitação porque está fora do escopo da disciplina.\n\n**Referências:**\n- trecho irrelevante',
    [{ source: 'livro.pdf', content: 'Trecho sem relação com a pergunta.', metadata: { drive_file_id: 'drive-1', page_number: 10 } }],
    'info',
  );

  assert.doesNotMatch(answer, /Referências|trecho irrelevante|livro\.pdf/i);
});

test('não exibe referências quando a resposta informa que o dado não está detalhado', () => {
  const answer = finalizeReferences(
    'A fórmula matemática completa não está detalhada nos documentos recuperados. Consulte o plano de ensino completo.',
    [{ source: 'plano.pdf', content: 'PROFESSOR HORÁRIO LOCAL', metadata: { drive_file_id: 'drive-1', page_number: 1 } }],
    'info',
  );

  assert.doesNotMatch(answer, /Referências|PROFESSOR|plano\.pdf/i);
});

test('em informações, mantém apenas referência com relação textual à resposta', () => {
  const answer = finalizeReferences(
    'A fórmula da média final não está detalhada no material recuperado. Consulte o plano de ensino completo.',
    [
      { source: 'plano.pdf', content: 'O cuidado de enfermagem ao adulto e idoso nas intercorrências cirúrgicas.' },
      { source: 'plano.pdf', content: 'Fórmula da média final: média ponderada das avaliações.', metadata: { reference_title: 'Plano de ensino INT 5224' } },
    ],
    'info',
  );

  assert.doesNotMatch(answer, /Referências|intercorrências cirúrgicas|plano\.pdf/i);
});

test('ignora fragmentos de frases como se fossem referências', () => {
  const answer = finalizeReferences(
    'Resposta clínica baseada nos trechos recuperados.',
    [{ source: 'artigo.pdf', content: 'domicílio, conforme as orientações de enfermagem. O cuidado deve ser contínuo. Após a alta, a equipe acompanha o paciente.' }],
    'livre',
  );

  assert.doesNotMatch(answer, /Referências|domicílio|Após a alta|artigo\.pdf/i);
});

test('ignora cabeçalho OCR de referências como se fosse capítulo', () => {
  const answer = finalizeReferences(
    'Resposta clínica baseada nos trechos recuperados.',
    [{ source: 'artigo.pdf', content: 'Capítulo 5 — 10 91 Referências 5. Texto do conteúdo.' }],
    'livre',
  );

  assert.doesNotMatch(answer, /Referências|10 91|artigo\.pdf/i);
});

test('remove referências do modelo e não adiciona novas quando a exibição está desativada', () => {
  const answer = finalizeReferences(
    'Resposta segura.\n\nReferências:\n- fragmento inválido',
    [{ source: 'plano.pdf', content: 'Trecho do documento.' }],
    'info',
    false,
  );

  assert.equal(answer, 'Resposta segura.');
  assert.doesNotMatch(answer, /Referências|fragmento inválido/);
});

test('remove marcadores numéricos herdados dos documentos', () => {
  const answer = finalizeReferences(
    'As normas da ABNT [2] incluem etapas específicas [3, 4, 5].',
    [{ source: 'aula.pdf', content: 'Capítulo 2 — Produção acadêmica.' }],
    'livre',
  );
  assert.doesNotMatch(answer, /\[\s*\d/);
  assert.match(answer, /normas da ABNT incluem etapas específicas/);
});
