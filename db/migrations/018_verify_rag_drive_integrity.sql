-- O manifesto só pode considerar um arquivo sincronizado quando há chunks
-- ativos com o mesmo drive_file_id. Esta função é consumida pelo planejador
-- antes de decidir que um arquivo do Drive está inalterado.

CREATE OR REPLACE FUNCTION public.get_rag_drive_file_states()
RETURNS TABLE (
    drive_file_id TEXT,
    active_chunks BIGINT,
    staging_chunks BIGINT
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        metadata->>'drive_file_id' AS drive_file_id,
        COUNT(*) FILTER (
            WHERE COALESCE(metadata->>'rag_status', 'active') = 'active'
        ) AS active_chunks,
        COUNT(*) FILTER (WHERE metadata->>'rag_status' = 'staging') AS staging_chunks
    FROM public.documents
    WHERE NULLIF(metadata->>'drive_file_id', '') IS NOT NULL
    GROUP BY metadata->>'drive_file_id';
$$;

REVOKE ALL ON FUNCTION public.get_rag_drive_file_states() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_rag_drive_file_states() TO service_role;
