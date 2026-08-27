-- Índices direcionados ao conjunto pesquisável. Evitam que documentos em
-- quarentena/staging consumam o orçamento de tempo das consultas do aluno.

CREATE INDEX IF NOT EXISTS idx_documents_active_source_lower
    ON documents (lower(source) text_pattern_ops)
    WHERE rag_document_is_active(metadata);

CREATE INDEX IF NOT EXISTS idx_documents_active_content_fts_simple
    ON documents
    USING GIN (to_tsvector('simple', COALESCE(content, '')))
    WHERE rag_document_is_active(metadata);

CREATE INDEX IF NOT EXISTS documents_active_embedding_hnsw_idx
    ON documents
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64)
    WHERE rag_document_is_active(metadata);

CREATE OR REPLACE FUNCTION match_documents_filtered(
    query_embedding  VECTOR(768),
    match_threshold  FLOAT   DEFAULT 0.25,
    match_count      INTEGER DEFAULT 5,
    source_pattern   TEXT    DEFAULT NULL
)
RETURNS TABLE (id UUID, content TEXT, source TEXT, metadata JSONB, similarity FLOAT)
LANGUAGE SQL STABLE
SET search_path = public
AS $$
    WITH filtered_documents AS MATERIALIZED (
        SELECT d.id, d.content, d.source, d.metadata, d.embedding
        FROM documents d
        WHERE rag_document_is_active(d.metadata)
          AND (source_pattern IS NULL OR lower(d.source) LIKE lower(source_pattern))
    )
    SELECT d.id, d.content, d.source, d.metadata,
           1 - (d.embedding <=> query_embedding) AS similarity
    FROM filtered_documents d
    WHERE 1 - (d.embedding <=> query_embedding) >= match_threshold
    ORDER BY d.embedding <=> query_embedding
    LIMIT match_count;
$$;
