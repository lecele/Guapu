-- Identidade bibliográfica conferida nas páginas iniciais do guia de sutura.
BEGIN;

INSERT INTO public.rag_document_catalog (
    drive_file_id, reference_title, reference_author, reference_year,
    reference_edition, reference_publisher, verification_status, verified_from,
    notes
)
VALUES (
    '1yAYbvBHEf6A_xWlq9f-xjBk4BTgtABnN',
    'Boas Práticas em Sutura Simples: Guia para Enfermeiros',
    'Conselho Regional de Enfermagem de São Paulo (Coren-SP)',
    '2025', NULL, 'Coren-SP', 'verified', 'documentos, p. 1-2',
    'Título, órgão responsável e ano conferidos nos chunks ativos iniciais.'
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
