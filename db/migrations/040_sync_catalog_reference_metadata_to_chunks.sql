-- Mantém os metadados bibliográficos dos chunks alinhados ao catálogo
-- verificado. A identidade continua sendo o drive_file_id: nomes de arquivo
-- jamais são promovidos a referência exibível.
--
-- A migração é idempotente: pode ser reaplicada sem duplicar metadados e sem
-- tocar no conteúdo, embeddings ou status de sincronização dos chunks.
BEGIN;

CREATE OR REPLACE FUNCTION public.sync_catalog_reference_metadata_to_chunks()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    catalog_keys CONSTANT TEXT[] := ARRAY[
        'reference_title',
        'reference_author',
        'reference_year',
        'reference_edition',
        'reference_publisher',
        'reference_source',
        'reference_verified',
        'reference_key'
    ];
    verified_metadata JSONB;
BEGIN
    IF NEW.verification_status = 'verified' THEN
        verified_metadata := jsonb_strip_nulls(
            jsonb_build_object(
                'reference_title', NEW.reference_title,
                'reference_author', NEW.reference_author,
                'reference_year', NEW.reference_year,
                'reference_edition', NEW.reference_edition,
                'reference_publisher', NEW.reference_publisher,
                'reference_source', 'catalog',
                'reference_verified', true,
                'reference_key', NEW.drive_file_id
            )
        );

        -- Remove somente os campos que pertencem ao catálogo e preserva
        -- página, chunk, status RAG e quaisquer pistas extraídas do conteúdo.
        UPDATE public.documents AS d
        SET metadata = (COALESCE(d.metadata, '{}'::jsonb) - catalog_keys) || verified_metadata
        WHERE d.metadata->>'drive_file_id' = NEW.drive_file_id;
    ELSE
        -- Caso uma obra deixe de ser verificada, retira apenas a identidade
        -- catalogada previamente para que ela não seja citada como confirmada.
        UPDATE public.documents AS d
        SET metadata = COALESCE(d.metadata, '{}'::jsonb) - catalog_keys
        WHERE d.metadata->>'drive_file_id' = NEW.drive_file_id
          AND d.metadata->>'reference_source' = 'catalog'
          AND d.metadata->>'reference_key' = NEW.drive_file_id;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_catalog_reference_metadata_to_chunks
    ON public.rag_document_catalog;

CREATE TRIGGER sync_catalog_reference_metadata_to_chunks
AFTER INSERT OR UPDATE ON public.rag_document_catalog
FOR EACH ROW
EXECUTE FUNCTION public.sync_catalog_reference_metadata_to_chunks();

-- Backfill das obras já catalogadas antes da criação do trigger. O CTE calcula
-- o JSON final uma vez e evita escrita quando o chunk já possui o mesmo valor.
WITH verified_catalog AS (
    SELECT
        c.drive_file_id,
        jsonb_strip_nulls(
            jsonb_build_object(
                'reference_title', c.reference_title,
                'reference_author', c.reference_author,
                'reference_year', c.reference_year,
                'reference_edition', c.reference_edition,
                'reference_publisher', c.reference_publisher,
                'reference_source', 'catalog',
                'reference_verified', true,
                'reference_key', c.drive_file_id
            )
        ) AS verified_metadata
    FROM public.rag_document_catalog AS c
    WHERE c.verification_status = 'verified'
), pending_updates AS (
    SELECT
        d.id,
        (COALESCE(d.metadata, '{}'::jsonb) - ARRAY[
            'reference_title',
            'reference_author',
            'reference_year',
            'reference_edition',
            'reference_publisher',
            'reference_source',
            'reference_verified',
            'reference_key'
        ]) || c.verified_metadata AS metadata
    FROM public.documents AS d
    INNER JOIN verified_catalog AS c
        ON d.metadata->>'drive_file_id' = c.drive_file_id
)
UPDATE public.documents AS d
SET metadata = pending_updates.metadata
FROM pending_updates
WHERE d.id = pending_updates.id
  AND d.metadata IS DISTINCT FROM pending_updates.metadata;

COMMIT;
