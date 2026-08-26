-- Busca vetorial opcionalmente restrita a um grupo de fontes.
-- Usada pelo modo "Informações da Disciplina" para impedir que documentos
-- clínicos concorram com o plano de ensino no ranking.

CREATE OR REPLACE FUNCTION match_documents_filtered(
    query_embedding  VECTOR(768),
    match_threshold  FLOAT   DEFAULT 0.25,
    match_count      INTEGER DEFAULT 5,
    source_pattern   TEXT    DEFAULT NULL
)
RETURNS TABLE (
    id          UUID,
    content     TEXT,
    source      TEXT,
    metadata    JSONB,
    similarity  FLOAT
)
LANGUAGE SQL STABLE
SET search_path = public
AS $$
    SELECT
        d.id,
        d.content,
        d.source,
        d.metadata,
        1 - (d.embedding <=> query_embedding) AS similarity
    FROM documents d
    WHERE 1 - (d.embedding <=> query_embedding) >= match_threshold
      AND (source_pattern IS NULL OR d.source ILIKE source_pattern)
    ORDER BY d.embedding <=> query_embedding
    LIMIT match_count;
$$;

