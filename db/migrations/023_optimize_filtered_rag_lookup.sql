-- O plano de ensino é consultado por uma fonte exata. A CTE materializada
-- anterior forçava a leitura de todos os chunks antes de ordenar por vetor.
-- A igualdade case-insensitive permite usar o índice parcial de fonte ativa.

CREATE OR REPLACE FUNCTION public.match_documents_filtered(
    query_embedding  VECTOR(768),
    match_threshold  FLOAT   DEFAULT 0.25,
    match_count      INTEGER DEFAULT 5,
    source_pattern   TEXT    DEFAULT NULL
)
RETURNS TABLE (id UUID, content TEXT, source TEXT, metadata JSONB, similarity FLOAT)
LANGUAGE SQL STABLE
SET search_path = public
AS $$
    SELECT d.id, d.content, d.source, d.metadata,
           1 - (d.embedding <=> query_embedding) AS similarity
    FROM public.documents d
    WHERE public.rag_document_is_active(d.metadata)
      AND (source_pattern IS NULL OR lower(d.source) = lower(source_pattern))
      AND 1 - (d.embedding <=> query_embedding) >= match_threshold
    ORDER BY d.embedding <=> query_embedding
    LIMIT match_count;
$$;
