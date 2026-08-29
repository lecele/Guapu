import test from 'node:test';
import assert from 'node:assert/strict';

import {
  finalizeReferences,
  isLikelyInfoInsufficient,
  sanitizeStudentFacingText,
} from '../lib/chat/references.ts';
import { DOCUMENT_REFERENCE_CATALOG, enrichDocumentReferenceMetadata } from '../lib/chat/document-catalog.ts';

test('substitui referências geradas pelo modelo por dados presentes no trecho RAG', () => {
  const answer = finalizeReferences(
    'Explicação breve.\n\nReferências: fonte inventada • Referência: outra fonte\n\nDeseja aprofundar este tema?',
    [
      { source: 'aula__cuidados_pos_operatorios_v1.pdf', content: 'Silva (2022). Cuidados perioperatórios em cirurgia geral. Capítulo 4, p. 45-52.', metadata: { drive_file_id: 'drive-aula', page_number: 1, chunk_index: 0 } },
      { source: 'aula__cuidados_pos_operatorios_v1.pdf', content: 'Silva (2022). Cuidados perioperatórios em cirurgia geral. Capítulo 4, p. 45-52.' },
      { source: 'plano_de_ensino.docx', content: 'Plano de ensino sem metadados bibliográficos no trecho recuperado.' },
    ],
    'resumo',
    true,
    'cuidados perioperatórios',
  );

  assert.match(answer, /- Silva \(2022\) Cuidados perioperatórios em cirurgia geral\. p\. 45-52\./);
  assert.equal((answer.match(/Silva \(2022\)/g) ?? []).length, 1);
  assert.doesNotMatch(answer, /\[Fonte:|\.pdf|trecho 1/i);
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
    true,
    'cuidados de enfermagem no pós-operatório imediato',
  );

  assert.match(answer, /- Cuidados de Enfermagem no Pós-Operatório Imediato \(Cap\. 6\)\./);
  assert.doesNotMatch(answer, /arquivo-que-nao-deve-aparecer/i);
});

test('prioriza a referência extraída do próprio documento e nunca o nome do arquivo', () => {
  const answer = finalizeReferences(
    'Explicação baseada no contexto.\n\nReferências: referência inventada.',
    [{
      source: 'biblioteca__nome-interno-que-nao-pode-ser-exibido.pdf',
      content: 'Morton, P. (2011). Cuidados Críticos de Enfermagem. Cap. 8. Trecho clínico recuperado.',
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
    true,
    'Cuidados Críticos de Enfermagem',
  );

  assert.match(answer, /- Morton, P\. \(2011\) Cuidados Críticos de Enfermagem \(Cap\. 8\)\./);
  assert.doesNotMatch(answer, /biblioteca__nome-interno|\.pdf|\[Fonte:/i);
  assert.doesNotMatch(answer, /referência inventada/i);
});

test('usa catálogo bibliográfico verificado quando o chunk clínico não contém a capa', () => {
  const answer = finalizeReferences(
    'O controle de infecção no perioperatório exige técnica asséptica e vigilância contínua.',
    [{
      source: 'origem-tecnica-interna.pdf',
      content: 'A vigilância do sítio cirúrgico deve ser contínua e baseada em sinais clínicos.',
      metadata: {
        drive_file_id: 'drive-sobecc',
        reference_key: 'drive-sobecc',
        reference_source: 'catalog',
        reference_verified: true,
        reference_title: 'Práticas Recomendadas SOBECC',
        reference_year: '2013',
        reference_edition: '6ª ed.',
        page_number: 35,
      },
    }],
    'livre',
    true,
    'controle de infecção no perioperatório',
  );

  assert.match(answer, /- \(2013\)\. Práticas Recomendadas SOBECC\. 6ª ed\. p\. 35\./);
  assert.doesNotMatch(answer, /Informação não disponível no artigo|origem-tecnica|\.pdf/i);
});

test('resolve a identidade por drive_file_id para todos os documentos ativos catalogados', () => {
  const ids = [
    '19X545ckd-ZnfYbo73Tz2glTklUiDA9qd',
    '1IEpBXcCPCvgrivRH57lEmK_0i_7Jr-Tf',
    '1eEE2VGeeqeY0G4xCeqAAmdituf7WsjVv',
    '1hPPWPIJJ6zc-C0Tnihf6fpVwlE13HaoL',
    '1YUfjf2WG5FonQaOImCsAY6aHSuyK7XNL',
    '1rsAmg3UK8m_2fP4STqoiB_Zhyktnlw-W',
  ];

  for (const drive_file_id of ids) {
    const metadata = enrichDocumentReferenceMetadata({ drive_file_id });
    assert.equal(metadata.reference_verified, true);
    assert.equal(metadata.reference_key, drive_file_id);
    assert.equal(metadata.reference_source, 'catalog');
    assert.ok(typeof metadata.reference_title === 'string' && metadata.reference_title.length > 5);
  }
  assert.equal(Object.keys(DOCUMENT_REFERENCE_CATALOG).length, 6);
});

test('deduplica páginas do mesmo documento catalogado', () => {
  const answer = finalizeReferences(
    'O cuidado perioperatório inclui prevenção de infecções e monitoramento.',
    [
      {
        source: 'tecnico.pdf',
        content: 'Prevenção de infecções no cuidado perioperatório.',
        metadata: {
          drive_file_id: 'drive-brunner', reference_key: 'drive-brunner',
          reference_source: 'catalog', reference_verified: true,
          reference_title: 'Brunner & Suddarth: Tratado de enfermagem médico-cirúrgica',
          reference_author: 'Lillian Sholtis Brunner; Doris Smith Suddarth',
          reference_year: '2014', reference_edition: '12ª ed.', page_number: 750,
        },
      },
      {
        source: 'tecnico.pdf',
        content: 'A técnica asséptica reduz o risco de complicações.',
        metadata: {
          drive_file_id: 'drive-brunner', reference_key: 'drive-brunner',
          reference_source: 'catalog', reference_verified: true,
          reference_title: 'Brunner & Suddarth: Tratado de enfermagem médico-cirúrgica',
          reference_author: 'Lillian Sholtis Brunner; Doris Smith Suddarth',
          reference_year: '2014', reference_edition: '12ª ed.', page_number: 751,
        },
      },
    ],
    'livre',
    true,
    'cuidados perioperatórios e prevenção de infecções',
  );

  assert.equal((answer.match(/^- /gm) ?? []).length, 1);
  assert.match(answer, /Doris Smith Suddarth \(2014\)\. Brunner & Suddarth/);
  assert.match(answer, /p\. 750\./);
  assert.doesNotMatch(answer, /p\. 751\./);
});

test('não transforma células repetidas de uma tabela em título de referência', () => {
  const answer = finalizeReferences(
    'A limpeza e o enxágue dependem da classificação do produto e da qualidade da água.',
    [{
      source: 'biblioteca__praticas_recomendadas__livro__sobecc__2013__v6',
      content: `Quadro 1. Qualidade da água indicada para as etapas da limpeza.
Crítico
Pré-limpeza
Limpeza
Enxágue
Semicrítico
Pré-limpeza
Limpeza
Enxágue
Enxágue Enxágue Enxágue
Não crítico
Limpeza`,
      metadata: { drive_file_id: '1YUfjf2WG5FonQaOImCsAY6aHSuyK7XNL', page_number: 35, chunk_index: 116 },
    }],
    'livre',
    true,
    'cuidado pré-operatório',
  );

  assert.doesNotMatch(answer, /Enxágue Enxágue Enxágue/i);
  assert.match(answer, /\*\*Referências:\*\*/i);
  assert.match(answer, /- Informação não disponível no artigo, consultar o Plano de Ensino ou docentes\./i);
  assert.doesNotMatch(answer, /biblioteca__praticas|\.pdf|\[Fonte:/i);
});

test('mantém um cabeçalho real do trecho sem expor a origem técnica', () => {
  const answer = finalizeReferences(
    'O cuidado pré-operatório organiza a avaliação e o preparo do paciente.',
    [{
      source: 'biblioteca__tratado_enfermagem_medico_cirurgico__livro__brunner_suddarth__2011__v2.pdf',
      content: 'Quadro 18.1 — Exemplos de Atividades de Enfermagem nas Fases de Cuidado Perioperatório\nFase Pré-operatória\nExames Pré-admissionais.',
      metadata: { drive_file_id: '1rsAmg3UK8m_2fP4STqoiB_Zhyktnlw-W', page_number: 750, chunk_index: 3003 },
    }],
    'livre',
    true,
    'cuidados pré-operatórios',
  );

  assert.match(answer, /- Fase Pré-operatória\./);
  assert.doesNotMatch(answer, /brunner|\.pdf|\[Fonte:|trecho 3004/i);
});

test('reprodução real de pré-operatório não publica prosa, lista truncada ou tabela como referência', () => {
  const answer = finalizeReferences(
    'O cuidado pré-operatório organiza a avaliação, o preparo e a continuidade do cuidado.',
    [
      {
        source: 'biblioteca__tratado_enfermagem_medico_cirurgico__livro__brunner_suddarth__2011__v2.pdf',
        content: 'Quadro 18.1 — Exemplos de Atividades de Enfermagem nas Fases de Cuidado\nPerioperatório\nFase Pré-operatória\nExames Pré-admissionais (EPA)\n1. Iniciar a primeira fase da avaliação pré-operatória.',
        metadata: { drive_file_id: 'brunner', page_number: 750, chunk_index: 3003 },
      },
      {
        source: 'biblioteca__tratado_enfermagem_medico_cirurgico__livro__brunner_suddarth__2011__v2.pdf',
        content: 'Com as internações hospitalares mais curtas e o uso aumentado de serviços ambulatoriais, mais\ncuidados de enfermagem são prestados em casa e no ambiente comunitário.',
        metadata: { drive_file_id: 'brunner', page_number: 75, chunk_index: 158 },
      },
      {
        source: 'biblioteca__tratado_enfermagem_medico_cirurgico__livro__brunner_suddarth__2011__v2.pdf',
        content: '(Connor, 2007–2008). Os recursos estão disponíveis para desenvolver parcerias de hospitais-cuidados de hospice.\nCuidados Paliativos nas Instituições de\nCuidados Prolongados\nA quantidade total de residentes alojados em clínicas de repouso diminuiu.',
        metadata: { drive_file_id: 'brunner', page_number: 712, chunk_index: 2831 },
      },
      {
        source: 'biblioteca__praticas_recomendadas__livro__sobecc__2013__v6',
        content: 'Quadro 1. Qualidade da água indicada para as etapas da limpeza.\nCrítico\nPré-limpeza\nLimpeza\nEnxágue\nSemicrítico\nPré-limpeza\nLimpeza\nEnxágue\nEnxágue Enxágue Enxágue\nNão crítico\nLimpeza',
        metadata: { drive_file_id: 'sobecc', page_number: 35, chunk_index: 116 },
      },
      {
        source: 'administrativo__plano_ensino_INT55224__plano__ufsc__2026_2.pdf',
        content: 'Discussão e raciocínio clínico nas atividades da prática quanto aos: Cuidados de Enfermagem ao paciente em Cirurgias Entero-Gástricas;\nCuidados de Enfermagem ao paciente em Cirurgias Vasculares; Cuidados de Enfermagem ao paciente\nem Cirurgias Urológicas.',
        metadata: { drive_file_id: 'plano', page_number: 3, chunk_index: 9 },
      },
    ],
    'livre',
  );

  assert.match(answer, /- Fase Pré-operatória\./);
  assert.doesNotMatch(answer, /- Cuidados Paliativos nas Instituições de Cuidados Prolongados\./);
  assert.equal((answer.match(/^-/gm) ?? []).length, 1);
  assert.doesNotMatch(answer, /Com as internações|Cirurgias Vasculares|Enxágue(?:\s+Enxágue){2,}/i);
  assert.doesNotMatch(answer, /\.pdf|\.docx|\[Fonte:|trecho \d+/i);
});

test('reconhece título quando autores estão na linha seguinte do trecho', () => {
  const answer = finalizeReferences(
    'Resumo.',
    [{ source: 'nao-usar.pdf', content: 'Intervenções fundamentais em cirurgia: diérese, hemostasia e síntese\nMedeiros AC, Dantas-Filho AM\nTexto do artigo.' }],
    'resumo',
    true,
    'intervenções fundamentais em cirurgia',
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
    true,
    'intervenções fundamentais em cirurgia',
  );
  assert.match(answer, /Intervenções fundamentais em cirurgia/);
  assert.doesNotMatch(answer, /Informação não disponível no artigo/);
});

test('mantém a seção ausente em Informações quando só existe o nome técnico do arquivo', () => {
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

  assert.match(answer, /\*\*Referências:\*\*/i);
  assert.match(answer, /- Informação não disponível no artigo, consultar o Plano de Ensino ou docentes\./i);
  assert.doesNotMatch(answer, /domicílio|Após a alta|artigo\.pdf/i);
});

test('usa fallback exato quando o material foi usado, mas não traz identificador bibliográfico', () => {
  const answer = finalizeReferences(
    'A resposta foi construída a partir do conteúdo recuperado sobre o procedimento.',
    [{ source: 'manual-interno.pdf', content: 'O procedimento deve ser realizado conforme a rotina descrita no material.' }],
    'livre',
  );

  assert.match(answer, /\*\*Referências:\*\*\n- Informação não disponível no artigo, consultar o Plano de Ensino ou docentes\./i);
  assert.doesNotMatch(answer, /manual-interno\.pdf/i);
});

test('ignora cabeçalho OCR de referências como se fosse capítulo', () => {
  const answer = finalizeReferences(
    'Resposta clínica baseada nos trechos recuperados.',
    [{ source: 'artigo.pdf', content: 'Capítulo 5 — 10 91 Referências 5. Texto do conteúdo.' }],
    'livre',
  );

  assert.match(answer, /\*\*Referências:\*\*\n- Informação não disponível no artigo, consultar o Plano de Ensino ou docentes\./i);
  assert.doesNotMatch(answer, /10 91|artigo\.pdf/i);
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

test('remove jargão interno antes de exibir a resposta ao estudante', () => {
  const answer = sanitizeStudentFacingText(
    'Os materiais RAG e o contexto recuperado não trouxeram dados suficientes. Veja os chunks consultados.',
  );

  assert.doesNotMatch(answer, /RAG|contexto recuperado|chunks?/i);
  assert.match(answer, /materiais da disciplina/);
});

test('reconhece informação administrativa sem confirmação no plano', () => {
  assert.equal(
    isLikelyInfoInsufficient(
      'quais são as aulas no dia 16/09?',
      'Não constam atividades acadêmicas programadas para essa data. Consulte o plano de ensino no Moodle.',
    ),
    true,
  );
  assert.equal(
    isLikelyInfoInsufficient(
      'quais são os cuidados pré-operatórios?',
      'Não há necessidade de repetir a avaliação quando o paciente está estável.',
    ),
    false,
  );
  assert.equal(
    isLikelyInfoInsufficient(
      'quais são as aulas no dia 16/09?',
      'Não há registro de atividades agendadas para o dia 16/09. Consulte o plano de ensino no Moodle.',
    ),
    true,
  );
});
