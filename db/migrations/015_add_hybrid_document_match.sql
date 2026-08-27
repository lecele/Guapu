-- Busca híbrida: preserva a similaridade semântica e acrescenta candidatos
-- textuais para nomes, códigos, siglas e termos raros que embeddings podem
-- ignorar. Chunks em staging continuam invisíveis.

CREATE INDEX IF NOT EXISTS idx_documents_content_fts_simple
    ON documents
    USING GIN (to_tsvector('simple', COALESCE(content, '')));

CREATE OR REPLACE FUNCTION match_documents_hybrid(
    query_embedding  VECTOR(768),
    query_text       TEXT,
    match_threshold  FLOAT   DEFAULT 0.35,
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
    WITH significant_terms AS (
        SELECT DISTINCT token
        FROM regexp_split_to_table(lower(COALESCE(query_text, '')), '[^[:alnum:]]+') AS token
        WHERE length(token) >= 3
          AND token <> ALL (ARRAY[
              'que','qual','quais','como','com','para','por','dos','das','uma','uns','nas','nos',
              'este','esta','esse','essa','isso','sobre','material','disciplina','significa'
          ])
        LIMIT 16
    ),
    lexical_query AS (
        SELECT CASE
            WHEN count(*) = 0 THEN NULL::tsquery
            ELSE websearch_to_tsquery('simple', string_agg(token, ' OR ' ORDER BY token))
        END AS value
        FROM significant_terms
    ),
    semantic_candidates AS MATERIALIZED (
        SELECT d.id, d.content, d.source, d.metadata,
               1 - (d.embedding <=> query_embedding) AS vector_score,
               0.0::FLOAT AS lexical_score
        FROM documents d
        WHERE COALESCE(d.metadata->>'rag_status', 'active') = 'active'
          AND 1 - (d.embedding <=> query_embedding) >= match_threshold
        ORDER BY d.embedding <=> query_embedding
        LIMIT GREATEST(match_count * 8, 40)
    ),
    lexical_candidates AS MATERIALIZED (
        SELECT d.id, d.content, d.source, d.metadata,
               1 - (d.embedding <=> query_embedding) AS vector_score,
               ts_rank_cd(to_tsvector('simple', COALESCE(d.content, '')), q.value)::FLOAT AS lexical_score
        FROM documents d
        CROSS JOIN lexical_query q
        WHERE q.value IS NOT NULL
          AND COALESCE(d.metadata->>'rag_status', 'active') = 'active'
          AND to_tsvector('simple', COALESCE(d.content, '')) @@ q.value
        ORDER BY lexical_score DESC, d.embedding <=> query_embedding
        LIMIT GREATEST(match_count * 8, 40)
    ),
    combined AS (
        SELECT id, content, source, metadata,
               max(vector_score) AS vector_score,
               max(lexical_score) AS lexical_score
        FROM (
            SELECT * FROM semantic_candidates
            UNION ALL
            SELECT * FROM lexical_candidates
        ) candidates
        GROUP BY id, content, source, metadata
    )
    SELECT c.id, c.content, c.source, c.metadata,
           (
               c.vector_score
               + CASE WHEN c.lexical_score > 0
                   THEN 0.30 + LEAST(c.lexical_score * 2.0, 0.20)
                   ELSE 0
                 END
           )::FLOAT AS similarity
    FROM combined c
    ORDER BY similarity DESC
    LIMIT match_count;
$$;

REVOKE ALL ON FUNCTION match_documents_hybrid(VECTOR, TEXT, FLOAT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION match_documents_hybrid(VECTOR, TEXT, FLOAT, INTEGER) TO service_role;
