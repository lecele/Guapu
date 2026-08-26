BEGIN;

CREATE OR REPLACE FUNCTION public.get_rag_document_summary()
RETURNS TABLE(source TEXT, chunk_count BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(NULLIF(source, ''), 'Fonte não identificada') AS source,
    COUNT(*)::BIGINT AS chunk_count
  FROM public.documents
  GROUP BY COALESCE(NULLIF(source, ''), 'Fonte não identificada')
  ORDER BY COUNT(*) DESC;
$$;

REVOKE ALL ON FUNCTION public.get_rag_document_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_rag_document_summary() TO service_role;

COMMIT;
