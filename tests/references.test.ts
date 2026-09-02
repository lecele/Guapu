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

  assert.match(answer, /- Práticas Recomendadas SOBECC\. \(2013\)\. 6ª ed\. p\. 35\./);
  assert.doesNotMatch(answer, /Informação não disponível no artigo|origem-tecnica|\.pdf/i);
});

test('resolve a identidade por drive_file_id para todos os documentos ativos catalogados', () => {
  const ids = Object.keys(DOCUMENT_REFERENCE_CATALOG);

  for (const drive_file_id of ids) {
    const metadata = enrichDocumentReferenceMetadata({ drive_file_id });
    assert.equal(metadata.reference_verified, true);
    assert.equal(metadata.reference_key, drive_file_id);
    assert.equal(metadata.reference_source, 'catalog');
    assert.ok(typeof metadata.reference_title === 'string' && metadata.reference_title.length > 5);
  }
  assert.equal(Object.keys(DOCUMENT_REFERENCE_CATALOG).length, 119);
});

test('mantém os quatro materiais internos como identidades parciais comprovadas', () => {
  const partialIds = [
    '1uC-_-TFRVx4pPW90wwfm0nS8CzkzdcMY',
    '1a0YMt3q7p70f5iFaX_qQJ1RHouEvalYA',
    '1_VSuj-wh7VOliXi2M_7idLkb1jEAk5Yn',
    '1Tm4GYvbkUYo315CYRF4ssgWIoAdjIC-H',
  ];
  for (const drive_file_id of partialIds) {
    const metadata = enrichDocumentReferenceMetadata({ drive_file_id });
    assert.equal(metadata.reference_confidence, 'partial');
    assert.equal(metadata.reference_verified, true);
    assert.equal(metadata.reference_key, drive_file_id);
  }
});

test('publica fontes verificadas da pergunta de segurança cirúrgica', () => {
  const answer = finalizeReferences(
    'A pausa de cirurgia segura confirma a identidade, o procedimento, o sítio e os pontos críticos antes da incisão.',
    [
      {
        source: 'seguranca_cirurgica__protocolo_cirurgia_segura__protocolo__ministerio_saude_anvisa_fiocruz__2013__v1',
        content: 'MINISTERIO DA SAUDE. PROTOCOLO PARA CIRURGIA SEGURA. Ministério da Saúde/Anvisa/Fiocruz. 09/07/2013.',
        similarity: 0.82,
        metadata: enrichDocumentReferenceMetadata({ drive_file_id: '1JQkYmjfUSx_Nhhh-z2PxKs_RG5s_8p2z', page_number: 6 }),
      },
      {
        source: 'seguranca_cirurgica__cirurgia_segura__manual__oms__2009__v2',
        content: 'World Health Organization. CIRURGIAS SEGURAS SALVAM VIDAS. MANUAL. 2009.',
        similarity: 0.81,
        metadata: enrichDocumentReferenceMetadata({ drive_file_id: '1AgmiMWrMdEsKTJuyY89oN3ldd6w__Pbg', page_number: 197 }),
      },
      {
        source: 'seguranca_cirurgica__praticas_prevencao_retencao_nao_intencional_objetos_apos_cirurgia__nota_tecnica__anvisa__2017__v1',
        content: 'NOTA TÉCNICA GVIMS/GGTES No 04/2017. Práticas seguras para prevenção de retenção não intencional de objetos após realização de procedimento cirúrgico em serviços de saúde. ANVISA. 2017.',
        similarity: 0.80,
        metadata: enrichDocumentReferenceMetadata({ drive_file_id: '1Zr2cWKl5SsHDYTNdiRLLHNFLI0JM2O7v', page_number: 11 }),
      },
    ],
    'livre',
  );
  assert.match(answer, /\*\*Referências\*\*/i);
  assert.doesNotMatch(answer, /\*\*Referências:\*\*/i);
  assert.match(answer, /Protocolo para Cirurgia Segura/);
  assert.match(answer, /Cirurgias Seguras Salvam Vidas/);
  assert.match(answer, /Nota Técnica GVIMS\/GGTES/);
  assert.doesNotMatch(answer, /Informação não disponível no artigo/);
});

test('não promove quadro OCR ou índice remissivo a referência', () => {
  const answer = finalizeReferences(
    'O checklist de cirurgia segura confirma o paciente, o procedimento e o sítio antes da incisão.',
    [
      {
        source: 'seguranca_cirurgica__cirurgia_segura__manual__oms__2009__v2',
        content: 'World Health Organization. CIRURGIAS SEGURAS SALVAM VIDAS. MANUAL. 2009.',
        similarity: 0.81,
        metadata: enrichDocumentReferenceMetadata({ drive_file_id: '1AgmiMWrMdEsKTJuyY89oN3ldd6w__Pbg', page_number: 197 }),
      },
      {
        source: 'ferida__cuidados_pessoa_com_ferida__protocolo__prefeitura_de_florianopolis__2019__v1.pdf',
        content: 'Classificação Tipo de cirurgia Descrição\nCirurgia Porte I Duração de até 2 horas.\nCirurgia Porte II Duração de 2 a 4 horas',
        similarity: 1.9,
        metadata: { drive_file_id: '15c3UdgWIO_hpDM5qFP0cuoBCxVpwSH4E', page_number: 95 },
      },
      {
        source: 'biblioteca__praticas_recomendadas__livro__sobecc__2013__v6',
        content: 'Cirurgia segura 185\nCirurgias bariátricas 282\nCirurgias contaminadas 160\nCirurgias limpas 160',
        similarity: 1.5,
        metadata: enrichDocumentReferenceMetadata({ drive_file_id: '1YUfjf2WG5FonQaOImCsAY6aHSuyK7XNL', page_number: 378 }),
      },
    ],
    'livre',
  );
  assert.match(answer, /Cirurgias Seguras Salvam Vidas/);
  assert.doesNotMatch(answer, /Duração do Ato|Práticas Recomendadas SOBECC/);
});

test('prioriza a fonte de estoma e não cita livro lexicalmente parecido', () => {
  const answer = finalizeReferences(
    'A pele ao redor do estoma deve ser higienizada e protegida contra vazamentos.',
    [
      {
        source: 'estoma__cuidados_pessoa_estomizada__livro__secretaria_de_saude_minas_gerais__2015__v1.pdf',
        content: 'A pessoa estomizada deve proteger a pele ao redor do estoma e observar sinais de complicação.',
        similarity: 2.2,
        metadata: enrichDocumentReferenceMetadata({ drive_file_id: '1wfGN61loXz7AcLSqxsqWZ1S639SBcymR', page_number: 45 }),
      },
      {
        source: 'biblioteca__tratado_enfermagem_medico_cirurgico__livro__brunner_suddarth__2011__v2.pdf',
        content: 'Cuidados gerais de enfermagem no pós-operatório.',
        similarity: 1.6,
        metadata: enrichDocumentReferenceMetadata({ drive_file_id: '1rsAmg3UK8m_2fP4STqoiB_Zhyktnlw-W', page_number: 75 }),
      },
    ],
    'livre',
  );
  assert.match(answer, /Linha de Cuidados da Pessoa Estomizada/);
  assert.doesNotMatch(answer, /Brunner|Informação não disponível/);
});

test('usa o catálogo do plano vigente e a página da tabela administrativa', () => {
  const answer = finalizeReferences(
    'Conforme o Plano de Ensino 2026-2, a carga horária total é de 216 horas.',
    [{
      source: 'administrativo__plano_ensino_INT55224__plano__ufsc__2026_2.pdf',
      content: 'PLANO DE ENSINO 2026-2. CARGA HORÁRIA: 126 hs teórica; 90 hs teórico-prática; total 216 hs.',
      metadata: {
        drive_file_id: '1if-C_IzjQFeg3nPTTcXNWJKT8YooUHIR',
        page_number: 1,
        reference_title: 'Plano de Ensino 2026-2 — INT 5224: O cuidado no processo de viver humano II — a condição cirúrgica',
        reference_year: '2026-2',
        reference_publisher: 'Universidade Federal de Santa Catarina (UFSC)',
        reference_source: 'catalog',
        reference_verified: true,
        reference_key: '1if-C_IzjQFeg3nPTTcXNWJKT8YooUHIR',
      },
    }],
    'info',
    true,
    'Qual é a carga horária e o período do plano de ensino vigente da INT 5224?',
  );

  assert.match(answer, /Plano de Ensino 2026-2/);
  assert.match(answer, /p\. 1\./);
  assert.doesNotMatch(answer, /Brunner|Suddarth|Informação não disponível|\.pdf|\[Fonte:/i);
});

test('não repete o ano quando ele já faz parte do título catalogado', () => {
  const output = finalizeReferences(
    'A disciplina possui carga horária e período definidos no plano vigente.',
    [{
      source: 'plano.pdf',
      content: 'Carga horária total: 216 horas. Semestre 2026-2.',
      metadata: {
        drive_file_id: 'plan-current',
        reference_source: 'catalog',
        reference_verified: true,
        reference_title: 'Plano de Ensino 2026-2 — INT 5224: O cuidado no processo de viver humano II',
        reference_year: '2026-2',
        reference_publisher: 'Universidade Federal de Santa Catarina (UFSC)',
        page_number: 1,
      },
    }],
    'livre',
    true,
    'carga horária e período do plano vigente',
  );

  assert.match(output, /Plano de Ensino 2026-2 — INT 5224/);
  assert.doesNotMatch(output, /\(2026-2\)\. Plano de Ensino 2026-2/);
  assert.match(output, /Universidade Federal de Santa Catarina \(UFSC\)\. p\. 1\./);
});

test('não começa a referência pela data quando não há autor catalogado', () => {
  const output = finalizeReferences(
    'A prevenção de infecções exige cuidados nas fases perioperatórias.',
    [{
      source: 'artigo.pdf',
      content: 'A prevenção de infecções exige cuidados nas fases perioperatórias.',
      metadata: {
        drive_file_id: 'article-without-author',
        reference_source: 'catalog',
        reference_verified: true,
        reference_title: 'O papel do enfermeiro na prevenção de infecção no sítio cirúrgico',
        reference_year: '2020',
        reference_publisher: 'Brazilian Journal of Health Review, 3(6), 16969-16977',
        page_number: 2,
      },
    }],
    'livre',
  );
  assert.match(output, /- O papel do enfermeiro na prevenção de infecção no sítio cirúrgico\. \(2020\)\. Brazilian Journal/);
  assert.doesNotMatch(output, /- \(2020\)\./);
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

test('não cita catálogo de livro quando a recuperação mistura um plano administrativo', () => {
  const answer = finalizeReferences(
    'A carga horária total do plano vigente é de 216 horas no semestre 2026-2.',
    [
      {
        source: 'biblioteca__tratado_enfermagem_medico_cirurgico__livro__brunner_suddarth__2011__v2.pdf',
        content: 'Cuidados gerais de enfermagem e avaliação clínica.',
        metadata: {
          drive_file_id: 'drive-brunner',
          reference_key: 'drive-brunner',
          reference_source: 'catalog',
          reference_verified: true,
          reference_title: 'Brunner & Suddarth: Tratado de enfermagem médico-cirúrgica',
          reference_year: '2014',
          page_number: 136,
        },
      },
      {
        source: 'administrativo__plano_ensino_INT55224__plano__ufsc__2026_2.pdf',
        content: 'Carga horária total de 216 horas. Plano de ensino 2026-2.',
        metadata: { drive_file_id: 'drive-plano', page_number: 1 },
      },
    ],
    'livre',
    true,
    'carga horária e período do plano de ensino vigente da INT 5224',
  );

  assert.doesNotMatch(answer, /Brunner|Suddarth|p\. 136/i);
  assert.doesNotMatch(answer, /biblioteca__tratado|\.pdf|\[Fonte:/i);
});

test('usa catálogo verificado nos documentos clínicos mais relevantes da recuperação', () => {
  const answer = finalizeReferences(
    'No pós-operatório imediato, a equipe deve monitorar sinais vitais, respiração e o local cirúrgico.',
    [
      {
        source: 'aula-interna.pdf',
        content: 'Monitorar sinais vitais, respiração e local cirúrgico.',
        similarity: 0.82,
        metadata: {
          drive_file_id: 'drive-poi',
          reference_key: 'drive-poi',
          reference_source: 'catalog',
          reference_verified: true,
          reference_title: 'Cuidado de enfermagem ao paciente cirúrgico no período pós-operatório',
          page_number: 1,
        },
      },
      {
        source: 'livro-não-relacionado.pdf',
        content: 'Trecho catalogado, mas abaixo do limiar de relevância.',
        similarity: 0.71,
        metadata: {
          drive_file_id: 'drive-outro',
          reference_key: 'drive-outro',
          reference_source: 'catalog',
          reference_verified: true,
          reference_title: 'Livro não relacionado',
          page_number: 10,
        },
      },
    ],
    'livre',
    true,
    'cuidados de enfermagem no pós-operatório imediato',
  );

  assert.match(answer, /Cuidado de enfermagem ao paciente cirúrgico no período pós-operatório/);
  assert.doesNotMatch(answer, /Livro não relacionado|Informação não disponível|\.pdf/i);
});

test('preserva a referência do documento explicitamente solicitado quando a busca traz ruído', () => {
  const answer = finalizeReferences(
    'As etapas de limpeza e enxágue devem seguir a sequência técnica indicada no documento.',
    [
      {
        source: 'biblioteca__praticas_recomendadas__livro__sobecc__2013__v6',
        content: 'Limpeza e enxágue de produtos para saúde.',
        similarity: 0.76,
        metadata: {
          drive_file_id: 'drive-sobecc',
          reference_key: 'drive-sobecc',
          reference_source: 'catalog',
          reference_verified: true,
          reference_title: 'Práticas Recomendadas SOBECC',
          reference_year: '2013',
          reference_edition: '6ª ed.',
          page_number: 122,
        },
      },
      {
        source: 'infeccao_sitio_cirurgico__rdc_15',
        content: 'Desinfecção e processamento de produtos para saúde.',
        similarity: 0.79,
        metadata: {
          drive_file_id: 'drive-ruido',
          reference_key: 'drive-ruido',
          reference_source: 'catalog',
          reference_verified: true,
          reference_title: 'RDC 15 — Boas práticas',
          page_number: 4,
        },
      },
    ],
    'livre',
    true,
    'etapas de limpeza e enxágue\n__SOURCE_SCOPE__biblioteca__praticas_recomendadas__livro__sobecc__2013__v6__',
  );

  assert.match(answer, /- Práticas Recomendadas SOBECC\. \(2013\)\. 6ª ed\. p\. 122\./);
  assert.doesNotMatch(answer, /RDC 15|Informação não disponível/);
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
  assert.match(answer, /\*\*Referências\*\*/i);
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

  assert.match(answer, /\*\*Referências\*\*/i);
  assert.match(answer, /- Informação não disponível no artigo, consultar o Plano de Ensino ou docentes\./i);
  assert.doesNotMatch(answer, /domicílio|Após a alta|artigo\.pdf/i);
});

test('usa fallback exato quando o material foi usado, mas não traz identificador bibliográfico', () => {
  const answer = finalizeReferences(
    'A resposta foi construída a partir do conteúdo recuperado sobre o procedimento.',
    [{ source: 'manual-interno.pdf', content: 'O procedimento deve ser realizado conforme a rotina descrita no material.' }],
    'livre',
  );

  assert.match(answer, /\*\*Referências\*\*\n- Informação não disponível no artigo, consultar o Plano de Ensino ou docentes\./i);
  assert.doesNotMatch(answer, /manual-interno\.pdf/i);
});

test('ignora cabeçalho OCR de referências como se fosse capítulo', () => {
  const answer = finalizeReferences(
    'Resposta clínica baseada nos trechos recuperados.',
    [{ source: 'artigo.pdf', content: 'Capítulo 5 — 10 91 Referências 5. Texto do conteúdo.' }],
    'livre',
  );

  assert.match(answer, /\*\*Referências\*\*\n- Informação não disponível no artigo, consultar o Plano de Ensino ou docentes\./i);
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

test('remove marcadores numéricos compostos com subseção e página', () => {
  const answer = finalizeReferences(
    'A pausa cirúrgica revisa os pontos críticos [3, 6.2.3; 3, 6.2.4] e a segurança anestésica [4, p. 196].',
    [],
    'livre',
    false,
  );
  assert.doesNotMatch(answer, /\[\s*\d+[\d\s.,;:pa-z]*\]/i);
  assert.match(answer, /A pausa cirúrgica revisa os pontos críticos\s+e a segurança anestésica\s+\./);
});

test('remove jargão interno antes de exibir a resposta ao estudante', () => {
  const answer = sanitizeStudentFacingText(
    'Os materiais RAG e o contexto recuperado não trouxeram dados suficientes. Veja os chunks consultados.',
  );

  assert.doesNotMatch(answer, /RAG|contexto recuperado|chunks?/i);
  assert.match(answer, /materiais da disciplina/);
});

test('remove marcadores numerados de materiais consultados', () => {
  const answer = sanitizeStudentFacingText('Conduta baseada nos materiais consultados 1 e (fontes consultadas 2).');
  assert.equal(answer, 'Conduta baseada nos materiais consultados 1 e.');
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

// ── Regressões corrigidas em 02/09/2026 (pacote de prompts v1.5.0) ──────────

const catalogMetadata = (id: string, title: string, author?: string, year?: string, page?: number) => ({
  drive_file_id: id,
  reference_key: id,
  reference_source: 'catalog',
  reference_verified: true,
  reference_title: title,
  ...(author ? { reference_author: author } : {}),
  ...(year ? { reference_year: year } : {}),
  ...(page ? { page_number: page } : {}),
});

test('D2 — mensagem "fora do escopo da disciplina" (3.2) nunca leva Referências', () => {
  const answer = finalizeReferences(
    'Isso foge ao escopo desta disciplina (O cuidado no processo de viver humano II - a condição cirúrgica), que trata do cuidado de enfermagem ao adulto e ao idoso no período perioperatório. Deseja voltar ao menu principal ou perguntar algo dentro desses temas?',
    [{
      source: 'pediatria.pdf',
      content: 'Cuidados de enfermagem em pediatria no pós-operatório de criança submetida a anestesia geral.',
      similarity: 0.7,
      metadata: catalogMetadata('drive-ped', 'Enfermagem pediátrica perioperatória', 'Autor P', '2020'),
    }],
    'livre',
    true,
    'cuidados de enfermagem em pediatria',
  );

  assert.doesNotMatch(answer, /Referências/i);
  assert.doesNotMatch(answer, /Informação não disponível no artigo/);
  assert.match(answer, /foge ao escopo desta disciplina/);
});

test('D2 — "não consta do Plano de Ensino" também suprime a seção', () => {
  const answer = finalizeReferences(
    'Esse tema não consta do Plano de Ensino desta disciplina. Deseja voltar ao menu principal?',
    [{ source: 'a.pdf', content: 'Trecho qualquer sobre cuidados.', metadata: catalogMetadata('drive-x', 'Obra qualquer') }],
    'resumo',
  );
  assert.doesNotMatch(answer, /Referências/i);
});

test('D3 — prosa iniciada por "Referências" não trunca a resposta', () => {
  const answer = finalizeReferences(
    'O plano de ensino define os critérios de avaliação.\nReferências bibliográficas básicas da disciplina estão listadas no Moodle e devem ser consultadas.\n\nO estudante deve verificar o cronograma antes da prova.',
    [{ source: 'plano.pdf', content: 'Trecho administrativo.' }],
    'info',
    true,
    'critérios de avaliação',
  );

  assert.match(answer, /Referências bibliográficas básicas da disciplina estão listadas no Moodle/);
  assert.match(answer, /O estudante deve verificar o cronograma antes da prova\./);
});

test('D3 — cabeçalho real continua sendo removido', () => {
  const answer = finalizeReferences(
    'Resposta.\n\n**Referências**\n- fonte inventada pelo modelo',
    [{ source: 'a.pdf', content: 'Trecho sem identificação.' }],
    'info',
  );
  assert.doesNotMatch(answer, /fonte inventada/);
});

test('D1 — obra recuperada por aproximação não entra na lista', () => {
  const answer = finalizeReferences(
    'A antissepsia da pele do sítio cirúrgico com clorexidina alcoólica reduz a carga microbiana antes da incisão. Essa medida integra o pacote de prevenção de infecção.',
    [
      {
        source: 's1',
        content: 'A antissepsia da pele reduz a carga microbiana antes da incisão cirúrgica no centro cirúrgico.',
        similarity: 0.8,
        metadata: catalogMetadata('d1', 'Prevenção de infecção de sítio cirúrgico', 'Silva J', '2020'),
      },
      {
        source: 's2',
        content: 'A teleconsulta de enfermagem no pós-operatório permite acompanhamento remoto do paciente cirúrgico.',
        similarity: 0.42,
        metadata: catalogMetadata('d2', 'Teleconsulta de enfermagem ao paciente submetido a cirurgia geral', 'Jacome L', '2022'),
      },
      {
        source: 's3',
        content: 'O dicionário apresenta termos médicos utilizados na prática de enfermagem hospitalar.',
        similarity: 0.4,
        metadata: catalogMetadata('d3', 'Dicionário de termos médicos e de enfermagem', 'Guimarães D', '2002'),
      },
    ],
    'resumo',
    true,
    'antissepsia da pele antes da cirurgia',
  );

  assert.match(answer, /Prevenção de infecção de sítio cirúrgico/);
  assert.doesNotMatch(answer, /Teleconsulta|Dicionário de termos/);
  assert.equal((answer.match(/^- /gm) ?? []).length, 1);
});

test('D1 — a seção nunca passa de três referências', () => {
  const content = 'A checagem da lista de verificação de segurança cirúrgica confirma identidade e sítio antes da incisão.';
  const docs = ['a', 'b', 'c', 'd', 'e'].map((id, index) => ({
    source: `s-${id}`,
    content,
    similarity: 0.9 - index * 0.01,
    metadata: catalogMetadata(`drive-${id}`, `Obra verificada ${id.toUpperCase()}`, 'Autor', '2020'),
  }));
  const answer = finalizeReferences(content, docs, 'resumo', true, 'lista de verificação de segurança cirúrgica');
  assert.equal((answer.match(/^- /gm) ?? []).length, 3);
});

test('D4 — a seção fica antes da pergunta de encerramento', () => {
  const answer = finalizeReferences(
    'Infecção de sítio cirúrgico é uma complicação pós-operatória relevante.\n\nDeseja aprofundar este tema, escolher outro tema, voltar ao menu principal ou encerrar a sessão?',
    [{
      source: 's1',
      content: 'A prevenção de infecção de sítio cirúrgico depende de antissepsia e profilaxia antibiótica.',
      similarity: 0.8,
      metadata: catalogMetadata('drive-isc', 'Prevenção de infecção de sítio cirúrgico', 'Silva J', '2020', 12),
    }],
    'resumo',
    true,
    'infecção de sítio cirúrgico',
  );

  const referencesAt = answer.indexOf('**Referências**');
  const closingAt = answer.indexOf('Deseja aprofundar');
  assert.ok(referencesAt > 0 && closingAt > referencesAt, `ordem incorreta:\n${answer}`);
});

test('D4 — o fallback da camada 3 também precede o encerramento', () => {
  const answer = finalizeReferences(
    'A resposta foi construída a partir do conteúdo consultado.\n\nDeseja aprofundar este tema, escolher outro tema, voltar ao menu principal ou encerrar a sessão?',
    [{ source: 'manual.pdf', content: 'O procedimento deve seguir a rotina descrita no material.' }],
    'resumo',
  );
  const referencesAt = answer.indexOf('**Referências**');
  const closingAt = answer.indexOf('Deseja aprofundar');
  assert.ok(referencesAt > 0 && closingAt > referencesAt, `ordem incorreta:\n${answer}`);
});

test('D5 — valores numéricos entre colchetes não são apagados', () => {
  const answer = finalizeReferences(
    'A escala de dor varia de [0] a [10]. O jejum pré-operatório recomendado é de [8] horas.',
    [],
    'livre',
    false,
  );
  assert.match(answer, /de \[0\] a \[10\]/);
  assert.match(answer, /de \[8\] horas/);
});

test('D5 — marcadores de citação herdados continuam sendo removidos', () => {
  const answer = finalizeReferences(
    'As normas da ABNT [2] incluem etapas específicas [3, 4, 5] e o "Mapa mental" [3].',
    [],
    'livre',
    false,
  );
  assert.doesNotMatch(answer, /\[\s*\d/);
  assert.match(answer, /normas da ABNT incluem etapas específicas/);
});

test('escopo explícito de fonte tolera diferença de maiúsculas', () => {
  const answer = finalizeReferences(
    'As etapas de limpeza e enxágue seguem a sequência técnica indicada.',
    [{
      source: 'Biblioteca__Praticas_Recomendadas__Livro__SOBECC__2013__v6',
      content: 'Limpeza e enxágue de produtos para saúde.',
      similarity: 0.76,
      metadata: catalogMetadata('drive-sobecc', 'Práticas Recomendadas SOBECC', undefined, '2013', 122),
    }],
    'livre',
    true,
    'etapas de limpeza e enxágue\n__SOURCE_SCOPE__biblioteca__praticas_recomendadas__livro__sobecc__2013__v6__',
  );
  assert.match(answer, /Práticas Recomendadas SOBECC/);
});

test('ABNT — a citação curada é usada literalmente, sem remontagem', () => {
  const answer = finalizeReferences(
    'A enfermagem perioperatória acompanha o paciente durante a anestesia e monitora sinais vitais e nível de consciência.',
    [{
      source: 'anestesia.pdf',
      similarity: 0.9,
      content: 'A enfermagem perioperatória acompanha o paciente durante a anestesia, monitorando sinais vitais e nível de consciência.',
      metadata: {
        ...catalogMetadata('drive-abnt', 'O papel da enfermagem perioperatória na anestesia', 'Souza AB', '2021', 4),
        reference_abnt: 'SOUZA, A. B. et al. O papel da enfermagem perioperatória na anestesia. Revista da Escola de Enfermagem da USP, São Paulo, v. 56, e20210465, 2022.',
      },
    }],
    'resumo',
    true,
    'papel da enfermagem perioperatória na anestesia',
  );

  assert.match(answer, /- SOUZA, A\. B\. et al\. O papel da enfermagem perioperatória na anestesia\. Revista da Escola de Enfermagem da USP, São Paulo, v\. 56, e20210465, 2022\. p\. 4\./);
  // A remontagem antiga (Autor (Ano). Título.) não pode reaparecer junto.
  assert.doesNotMatch(answer, /Souza AB \(2021\)/);
});

test('ABNT — o catálogo aplica a citação mesmo em chunk legado já verificado', () => {
  const enriched = enrichDocumentReferenceMetadata({
    drive_file_id: '1if-C_IzjQFeg3nPTTcXNWJKT8YooUHIR',
    reference_source: 'catalog',
    reference_verified: true,
    reference_title: 'Título antigo gravado no chunk',
    page_number: 1,
  });
  const catalogEntry = DOCUMENT_REFERENCE_CATALOG['1if-C_IzjQFeg3nPTTcXNWJKT8YooUHIR'];
  // Enquanto a planilha não for importada não há citação ABNT no bootstrap; o
  // contrato verificado aqui é que, havendo uma, ela vence o metadado legado.
  if (catalogEntry?.reference_abnt) {
    assert.equal(enriched.reference_abnt, catalogEntry.reference_abnt);
  } else {
    assert.equal(enriched.reference_title, 'Título antigo gravado no chunk');
  }
});
