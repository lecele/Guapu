-- Identidades verificadas para os documentos clínicos usados na pergunta de
-- pós-operatório. Títulos conferidos no primeiro chunk de cada documento.
BEGIN;

INSERT INTO public.rag_document_catalog (
    drive_file_id, reference_title, reference_author, reference_year,
    reference_edition, reference_publisher, verification_status, verified_from,
    notes
)
VALUES
(
    '1GTAHERp-d3jlwo9iPV2fobEiYdm_NmkA',
    'Cuidado de enfermagem ao paciente cirúrgico no período pós-operatório',
    NULL, NULL, NULL, NULL, 'verified', 'documentos, p. 1',
    'Título conferido no primeiro chunk ativo do material didático.'
),
(
    '1Mh_V8u_FP1r92gRcRHiR8P9DHC4rHGQy',
    'Enfermagem em Centro Cirúrgico',
    NULL, NULL, NULL, NULL, 'verified', 'documentos, p. 1',
    'Título conferido na capa do primeiro chunk ativo.'
),
(
    '1Otw5FXgeZJGUbhakBu-M56rpoUVgznpS',
    'Pacientes em pós-operatório imediato: recepção na unidade clínico-cirúrgica',
    NULL, NULL, NULL, NULL, 'verified', 'documentos, p. 1',
    'Título conferido no cabeçalho do artigo no primeiro chunk ativo.'
)
ON CONFLICT (drive_file_id) DO UPDATE SET
    reference_title = EXCLUDED.reference_title,
    reference_author = EXCLUDED.reference_author,
    reference_year = EXCLUDED.reference_year,
    reference_edition = EXCLUDED.reference_edition,
    reference_publisher = EXCLUDED.reference_publisher,
    verification_status = EXCLUDED.verification_status,
    verified_from = EXCLUDED.verified_from,
    notes = EXCLUDED.notes,
    updated_at = now();

COMMIT;
