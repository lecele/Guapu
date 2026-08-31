-- Propagação controlada da obra Cardiologia Prática Clínica.
-- Obra confirmada no PDF original; 767 chunks.
-- Atualiza apenas metadata, em blocos de 100; não toca content/embedding/índices.
-- Executar no SQL Editor do Supabase com backup/política operacional vigente.

BEGIN;
SET LOCAL statement_timeout = '120s';
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.rag_document_catalog
  DISABLE TRIGGER sync_catalog_reference_metadata_to_chunks;

INSERT INTO public.rag_document_catalog (
  drive_file_id, reference_title, reference_author, reference_year,
  reference_edition, reference_publisher, verification_status,
  verified_from, notes
)
VALUES (
  '1uLOguHlm-IuiJ7nqv-j7m1u7bKPTm3cx',
  'Cardiologia prática clínica',
  'Gláucia Maria Moraes de Oliveira; Olga Ferreira de Souza; Fernando Eugênio dos Santos Cruz Filho; Evandro Tinoco Mesquita; Cesar Gerson Pereira Subieta (eds.)',
  '2012', '1. ed.',
  'SOCERJ — Sociedade de Cardiologia do Estado do Rio de Janeiro',
  'verified', 'original_drive_pdf',
  'Confirmado na capa, ficha interna, ISBN e copyright do PDF original do Drive; propagação SQL em lotes de 100.'
)
ON CONFLICT (drive_file_id) DO UPDATE SET
  reference_title = EXCLUDED.reference_title,
  reference_author = EXCLUDED.reference_author,
  reference_year = EXCLUDED.reference_year,
  reference_edition = EXCLUDED.reference_edition,
  reference_publisher = EXCLUDED.reference_publisher,
  verification_status = 'verified',
  verified_from = EXCLUDED.verified_from,
  notes = EXCLUDED.notes,
  updated_at = now();

DO $$
DECLARE
  changed integer;
BEGIN
  LOOP
    WITH batch AS (
      SELECT id
      FROM public.documents
      WHERE metadata->>'drive_file_id' = '1uLOguHlm-IuiJ7nqv-j7m1u7bKPTm3cx'
        AND metadata->>'reference_key' IS DISTINCT FROM '1uLOguHlm-IuiJ7nqv-j7m1u7bKPTm3cx'
      ORDER BY id
      LIMIT 100
    )
    UPDATE public.documents AS d
    SET metadata = (COALESCE(d.metadata, '{}'::jsonb) - ARRAY[
      'reference_title', 'reference_author', 'reference_year',
      'reference_edition', 'reference_publisher', 'reference_source',
      'reference_verified', 'reference_key'
    ]) || jsonb_strip_nulls(jsonb_build_object(
      'reference_title', 'Cardiologia prática clínica',
      'reference_author', 'Gláucia Maria Moraes de Oliveira; Olga Ferreira de Souza; Fernando Eugênio dos Santos Cruz Filho; Evandro Tinoco Mesquita; Cesar Gerson Pereira Subieta (eds.)',
      'reference_year', '2012',
      'reference_edition', '1. ed.',
      'reference_publisher', 'SOCERJ — Sociedade de Cardiologia do Estado do Rio de Janeiro',
      'reference_source', 'catalog',
      'reference_verified', true,
      'reference_key', '1uLOguHlm-IuiJ7nqv-j7m1u7bKPTm3cx'
    ))
    FROM batch
    WHERE d.id = batch.id;
    GET DIAGNOSTICS changed = ROW_COUNT;
    EXIT WHEN changed = 0;
  END LOOP;
END $$;

ALTER TABLE public.rag_document_catalog
  ENABLE TRIGGER sync_catalog_reference_metadata_to_chunks;

COMMIT;

-- Aceite: esperado 767 no catálogo e 767 chunks propagados.
SELECT count(*) AS catalog_verified
FROM public.rag_document_catalog
WHERE drive_file_id = '1uLOguHlm-IuiJ7nqv-j7m1u7bKPTm3cx'
  AND verification_status = 'verified';

SELECT count(*) AS propagated_chunks
FROM public.documents
WHERE metadata->>'drive_file_id' = '1uLOguHlm-IuiJ7nqv-j7m1u7bKPTm3cx'
  AND metadata->>'reference_key' = '1uLOguHlm-IuiJ7nqv-j7m1u7bKPTm3cx'
  AND metadata->>'reference_source' = 'catalog'
  AND (metadata->>'reference_verified')::boolean IS TRUE;
