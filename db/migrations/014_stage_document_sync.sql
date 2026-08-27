-- Impede que uma indexação parcial seja usada pelo RAG.
-- Chunks novos entram como "staging" e só ficam pesquisáveis quando todo o
-- arquivo termina. A ativação e a remoção dos chunks obsoletos são atômicas.

CREATE OR REPLACE FUNCTION finalize_drive_document_sync(
    p_drive_file_id TEXT,
    p_current_ids UUID[]
)
RETURNS TABLE (activated_count INTEGER, removed_count INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_activated INTEGER := 0;
    v_removed INTEGER := 0;
BEGIN
    UPDATE documents
       SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{rag_status}', '"active"'::jsonb, true)
     WHERE metadata->>'drive_file_id' = p_drive_file_id
       AND id = ANY(p_current_ids);
    GET DIAGNOSTICS v_activated = ROW_COUNT;

    DELETE FROM documents
     WHERE metadata->>'drive_file_id' = p_drive_file_id
       AND NOT (id = ANY(p_current_ids));
    GET DIAGNOSTICS v_removed = ROW_COUNT;

    RETURN QUERY SELECT v_activated, v_removed;
END;
$$;

REVOKE ALL ON FUNCTION finalize_drive_document_sync(TEXT, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION finalize_drive_document_sync(TEXT, UUID[]) TO service_role;

CREATE OR REPLACE FUNCTION match_documents(
    query_embedding  VECTOR(768),
    match_threshold  FLOAT   DEFAULT 0.75,
    match_count      INTEGER DEFAULT 5
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
    WHERE COALESCE(d.metadata->>'rag_status', 'active') = 'active'
      AND 1 - (d.embedding <=> query_embedding) >= match_threshold
    ORDER BY d.embedding <=> query_embedding
    LIMIT match_count;
$$;

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
    WITH filtered_documents AS MATERIALIZED (
        SELECT d.id, d.content, d.source, d.metadata, d.embedding
        FROM documents d
        WHERE COALESCE(d.metadata->>'rag_status', 'active') = 'active'
          AND (source_pattern IS NULL OR d.source ILIKE source_pattern)
    )
    SELECT
        d.id,
        d.content,
        d.source,
        d.metadata,
        1 - (d.embedding <=> query_embedding) AS similarity
    FROM filtered_documents d
    WHERE 1 - (d.embedding <=> query_embedding) >= match_threshold
    ORDER BY d.embedding <=> query_embedding
    LIMIT match_count;
$$;
