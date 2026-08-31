-- Identidade bibliográfica conferida na primeira página do artigo de cirurgia
-- bariátrica, incluindo título, primeiro autor, periódico, volume/número e ano.
BEGIN;

INSERT INTO public.rag_document_catalog (
    drive_file_id, reference_title, reference_author, reference_year,
    reference_edition, reference_publisher, verification_status, verified_from,
    notes
)
VALUES (
    '1dm45OLuwp1TysqvkOfc60v7yAsFthCBX',
    'Atuação do enfermeiro na assistência pré e pós-operatória ao paciente de cirurgia bariátrica: uma revisão integrativa',
    'Nayara Lucia do Nascimento et al.',
    '2025', NULL, 'Revista JRG de Estudos Acadêmicos, 8(18), e181826', 'verified', 'documentos, p. 1',
    'Título, primeiro autor, periódico, volume/número e ano conferidos na primeira página ativa.'
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
