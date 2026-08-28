-- Versão determinística do conjunto de documentos que pode ser consultado.
-- A versão muda quando um arquivo ativo é adicionado, alterado ou removido.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_rag_corpus_version()
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT md5(
        COALESCE(
            string_agg(
                concat_ws(
                    '|',
                    drive_file_id,
                    name,
                    drive_path,
                    mime_type,
                    modified_time::TEXT,
                    COALESCE(md5_checksum, ''),
                    chunks_count::TEXT
                ),
                E'\n' ORDER BY drive_file_id
            ),
            'empty-corpus'
        )
    )
    FROM public.drive_sync_manifest
    WHERE status = 'active';
$$;

REVOKE ALL ON FUNCTION public.get_rag_corpus_version() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_rag_corpus_version() TO service_role;

COMMIT;
