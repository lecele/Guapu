-- Identidade bibliográfica conferida nos chunks iniciais da Linha de Cuidados
-- da Pessoa Estomizada (título e ano visíveis no material; órgão conforme a
-- publicação institucional do documento).
BEGIN;

INSERT INTO public.rag_document_catalog (
    drive_file_id, reference_title, reference_author, reference_year,
    reference_edition, reference_publisher, verification_status, verified_from,
    notes
)
VALUES (
    '1wfGN61loXz7AcLSqxsqWZ1S639SBcymR',
    'Linha de Cuidados da Pessoa Estomizada',
    NULL,
    '2015', NULL, 'Secretaria de Estado de Saúde de Minas Gerais', 'verified', 'documentos, p. 1-2',
    'Título e ano conferidos nos chunks ativos iniciais; publicação institucional identificada no material.'
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
