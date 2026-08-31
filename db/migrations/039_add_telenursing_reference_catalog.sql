-- Identidade bibliográfica conferida nos chunks iniciais da resolução do
-- Cofen sobre Saúde Digital e Telenfermagem.
BEGIN;

INSERT INTO public.rag_document_catalog (
    drive_file_id, reference_title, reference_author, reference_year,
    reference_edition, reference_publisher, verification_status, verified_from,
    notes
)
VALUES (
    '1JVN_nsRJnsqjoo8DuKWaPVEHZF0QAeyr',
    'Resolução Cofen nº 696/2022: atuação da Enfermagem na Saúde Digital, normatizando a Telenfermagem',
    'Conselho Federal de Enfermagem (Cofen)',
    '2022', NULL, 'Cofen', 'verified', 'documentos, p. 1',
    'Número, título, órgão e data da resolução conferidos no primeiro chunk ativo.'
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
