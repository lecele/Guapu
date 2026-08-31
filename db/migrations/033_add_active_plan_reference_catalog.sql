-- Identidade bibliográfica verificável do plano de ensino vigente.
-- O drive_file_id foi conferido no chunk da p. 1 do arquivo ativo.
BEGIN;

INSERT INTO public.rag_document_catalog (
    drive_file_id, reference_title, reference_author, reference_year,
    reference_edition, reference_publisher, verification_status, verified_from,
    notes
)
VALUES (
    '1if-C_IzjQFeg3nPTTcXNWJKT8YooUHIR',
    'Plano de Ensino 2026-2 — INT 5224: O cuidado no processo de viver humano II — a condição cirúrgica',
    NULL,
    '2026-2',
    NULL,
    'Universidade Federal de Santa Catarina (UFSC)',
    'verified',
    'documentos, p. 1',
    'Título, código da disciplina, semestre e tabela de carga horária conferidos no chunk ativo da primeira página.'
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

UPDATE public.documents AS d
SET metadata = COALESCE(d.metadata, '{}'::jsonb) || jsonb_strip_nulls(
    jsonb_build_object(
        'reference_title', c.reference_title,
        'reference_author', c.reference_author,
        'reference_year', c.reference_year,
        'reference_edition', c.reference_edition,
        'reference_publisher', c.reference_publisher,
        'reference_source', 'catalog',
        'reference_verified', (c.verification_status = 'verified'),
        'reference_key', c.drive_file_id
    )
)
FROM public.rag_document_catalog AS c
WHERE d.metadata->>'drive_file_id' = c.drive_file_id
  AND c.drive_file_id = '1if-C_IzjQFeg3nPTTcXNWJKT8YooUHIR'
  AND c.verification_status = 'verified';

COMMIT;
