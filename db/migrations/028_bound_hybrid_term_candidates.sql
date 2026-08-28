-- Evita ordenar todos os documentos que coincidem com uma consulta lexical
-- ampla. Cada termo busca apenas os melhores candidatos pelo índice GIN e o
-- conjunto reduzido é combinado com os candidatos semânticos.

CREATE OR REPLACE FUNCTION public.match_documents_hybrid(
    query_embedding  VECTOR(768),
    query_text       TEXT,
    match_threshold  FLOAT DEFAULT 0.35,
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
    semantic_candidates AS MATERIALIZED (
        SELECT d.id, d.content, d.source, d.metadata,
               1 - (d.embedding <=> query_embedding) AS vector_score,
               0.0::FLOAT AS lexical_score
        FROM public.documents d
        WHERE public.rag_document_is_active(d.metadata)
          AND 1 - (d.embedding <=> query_embedding) >= match_threshold
        ORDER BY d.embedding <=> query_embedding
        LIMIT GREATEST(match_count * 4, 20)
    ),
    lexical_candidates AS MATERIALIZED (
        SELECT candidates.id, candidates.content, candidates.source, candidates.metadata,
               0.0::FLOAT AS vector_score,
               (0.50 + max(candidates.term_score))::FLOAT AS lexical_score
        FROM (
            SELECT d.id, d.content, d.source, d.metadata,
                   ts_rank_cd(
                       to_tsvector('simple', COALESCE(d.content, '')),
                       plainto_tsquery('simple', terms.token)
                   )::FLOAT AS term_score
            FROM significant_terms terms
            CROSS JOIN LATERAL (
                SELECT d.id, d.content, d.source, d.metadata
                FROM public.documents d
                WHERE public.rag_document_is_active(d.metadata)
                  AND to_tsvector('simple', COALESCE(d.content, ''))
                      @@ plainto_tsquery('simple', terms.token)
                ORDER BY ts_rank_cd(
                    to_tsvector('simple', COALESCE(d.content, '')),
                    plainto_tsquery('simple', terms.token)
                ) DESC
                LIMIT GREATEST(match_count, 2)
            ) d
        ) candidates
        GROUP BY candidates.id, candidates.content, candidates.source, candidates.metadata
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
           (c.vector_score + c.lexical_score)::FLOAT AS similarity
    FROM combined c
    ORDER BY similarity DESC
    LIMIT match_count;
$$;

REVOKE ALL ON FUNCTION public.match_documents_hybrid(VECTOR, TEXT, FLOAT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_documents_hybrid(VECTOR, TEXT, FLOAT, INTEGER) TO service_role;
