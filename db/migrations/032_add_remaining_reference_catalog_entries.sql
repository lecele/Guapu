-- Completa o catálogo das obras ativas que não estavam no primeiro lote.
-- Os dados abaixo foram conferidos nos cabeçalhos dos próprios documentos.
BEGIN;

INSERT INTO public.rag_document_catalog (
    drive_file_id, reference_title, reference_author, reference_year,
    reference_publisher, verification_status, verified_from, notes
)
VALUES
(
    '1QIm6St6nnOIf7JXFwoXCy6-InqKhF2WI',
    'Incision care and dressing selection in surgical incision wounds: findings from an international meeting of surgeons from Northern Europe',
    'Rhidian Morgan-Jones (chair) et al.', '2022', 'Wounds International',
    'verified', 'documentos, p. 1-2',
    'Título, presidente e ano conferidos no cabeçalho e no relatório do consenso.'
),
(
    '1gu0sH0qoUa1kVbqtv0-Zz33OC4vvSEYD',
    'Surgical wound dehiscence: improving prevention and outcomes',
    'World Union of Wound Healing Societies', '2018', 'Wounds International',
    'verified', 'documentos, p. 1',
    'Título, entidade responsável e ano conferidos no cabeçalho do consenso.'
)
ON CONFLICT (drive_file_id) DO UPDATE SET
    reference_title = EXCLUDED.reference_title,
    reference_author = EXCLUDED.reference_author,
    reference_year = EXCLUDED.reference_year,
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
        'reference_publisher', c.reference_publisher,
        'reference_source', 'catalog',
        'reference_verified', (c.verification_status = 'verified'),
        'reference_key', c.drive_file_id
    )
)
FROM public.rag_document_catalog AS c
WHERE d.metadata->>'drive_file_id' = c.drive_file_id
  AND c.drive_file_id IN (
      '1QIm6St6nnOIf7JXFwoXCy6-InqKhF2WI',
      '1gu0sH0qoUa1kVbqtv0-Zz33OC4vvSEYD'
  )
  AND c.verification_status = 'verified';

COMMIT;
