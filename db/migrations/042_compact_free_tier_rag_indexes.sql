-- Reduz o armazenamento do RAG para o limite do plano gratuito.
--
-- O índice textual global é substituído por GiST parcial, cuja assinatura é
-- muito menor que a GIN. O HNSW de vetores float32 é substituído por IVFFlat
-- halfvec:
-- ele reduz o armazenamento sem a perda de recall observada na quantização
-- binária. A ordenação final continua usando o vetor float32 original.

SET maintenance_work_mem = '64MB';

DROP INDEX IF EXISTS public.idx_documents_content_fts_simple;
DROP INDEX IF EXISTS public.idx_documents_active_content_fts_simple;
DROP INDEX IF EXISTS public.idx_documents_active_content_fts_simple_gist;
DROP INDEX IF EXISTS public.documents_active_embedding_hnsw_idx;
DROP INDEX IF EXISTS public.documents_active_embedding_binary_hnsw_idx;
DROP INDEX IF EXISTS public.documents_active_embedding_half_hnsw_idx;
DROP INDEX IF EXISTS public.documents_active_embedding_half_ivfflat_idx;

CREATE INDEX IF NOT EXISTS idx_documents_active_content_fts_simple_gist
    ON public.documents
    USING GIST (to_tsvector('simple', COALESCE(content, '')))
    WHERE public.rag_document_is_active(metadata);

CREATE INDEX IF NOT EXISTS documents_active_embedding_half_ivfflat_idx
    ON public.documents
    USING ivfflat (
        (embedding::halfvec(768)) halfvec_cosine_ops
    )
    WITH (lists = 256)
    WHERE public.rag_document_is_active(metadata);

CREATE OR REPLACE FUNCTION public.match_documents(
    query_embedding VECTOR(768),
    match_threshold FLOAT DEFAULT 0.75,
    match_count INTEGER DEFAULT 5
)
RETURNS TABLE (id UUID, content TEXT, source TEXT, metadata JSONB, similarity FLOAT)
LANGUAGE SQL STABLE
SET search_path = public
SET ivfflat.probes = 128
AS $$
    WITH half_candidates AS MATERIALIZED (
        SELECT d.id, d.content, d.source, d.metadata, d.embedding
        FROM public.documents AS d
        WHERE public.rag_document_is_active(d.metadata)
        ORDER BY
            d.embedding::halfvec(768)
            <=>
            query_embedding::halfvec(768)
        LIMIT GREATEST(match_count * 40, 200)
    ),
    reranked AS (
        SELECT c.id, c.content, c.source, c.metadata,
               1 - (c.embedding <=> query_embedding) AS similarity
        FROM half_candidates AS c
    )
    SELECT r.id, r.content, r.source, r.metadata, r.similarity
    FROM reranked AS r
    WHERE r.similarity >= match_threshold
    ORDER BY r.similarity DESC
    LIMIT match_count;
$$;

CREATE OR REPLACE FUNCTION public.match_documents_hybrid(
    query_embedding VECTOR(768),
    query_text TEXT,
    match_threshold FLOAT DEFAULT 0.35,
    match_count INTEGER DEFAULT 5
)
RETURNS TABLE (
    id UUID,
    content TEXT,
    source TEXT,
    metadata JSONB,
    similarity FLOAT
)
LANGUAGE SQL STABLE
SET search_path = public
SET ivfflat.probes = 128
AS $$
    WITH significant_terms AS (
        SELECT DISTINCT token
        FROM regexp_split_to_table(
            lower(COALESCE(query_text, '')),
            '[^[:alnum:]]+'
        ) AS token
        WHERE length(token) >= 3
          AND token <> ALL (ARRAY[
              'que','qual','quais','como','com','para','por','dos','das','uma','uns','nas','nos',
              'este','esta','esse','essa','isso','sobre','material','disciplina','significa'
          ])
        LIMIT 16
    ),
    half_candidates AS MATERIALIZED (
        SELECT d.id, d.content, d.source, d.metadata, d.embedding
        FROM public.documents AS d
        WHERE public.rag_document_is_active(d.metadata)
        ORDER BY
            d.embedding::halfvec(768)
            <=>
            query_embedding::halfvec(768)
        LIMIT GREATEST(match_count * 40, 200)
    ),
    semantic_candidates AS MATERIALIZED (
        SELECT c.id, c.content, c.source, c.metadata,
               1 - (c.embedding <=> query_embedding) AS vector_score,
               0.0::FLOAT AS lexical_score
        FROM half_candidates AS c
        WHERE 1 - (c.embedding <=> query_embedding) >= match_threshold
        ORDER BY c.embedding <=> query_embedding
        LIMIT GREATEST(match_count * 4, 20)
    ),
    lexical_candidates AS MATERIALIZED (
        SELECT candidates.id, candidates.content, candidates.source, candidates.metadata,
               0.0::FLOAT AS vector_score,
               (
                   0.50
                   + sum(candidates.term_score)
                   + max(candidates.exact_phrase_bonus)
               )::FLOAT AS lexical_score
        FROM (
            SELECT d.id, d.content, d.source, d.metadata,
                   ts_rank_cd(
                       to_tsvector('simple', COALESCE(d.content, '')),
                       plainto_tsquery('simple', terms.token)
                   )::FLOAT AS term_score,
                   CASE
                       WHEN position(
                           lower(COALESCE(d.content, ''))
                           in lower(COALESCE(query_text, ''))
                       ) > 0 THEN 5.0::FLOAT
                       ELSE 0.0::FLOAT
                   END AS exact_phrase_bonus
            FROM significant_terms AS terms
            CROSS JOIN LATERAL (
                SELECT d.id, d.content, d.source, d.metadata
                FROM public.documents AS d
                WHERE public.rag_document_is_active(d.metadata)
                  AND to_tsvector('simple', COALESCE(d.content, ''))
                      @@ plainto_tsquery('simple', terms.token)
                ORDER BY ts_rank_cd(
                    to_tsvector('simple', COALESCE(d.content, '')),
                    plainto_tsquery('simple', terms.token)
                ) DESC
                LIMIT GREATEST(match_count, 2)
            ) AS d
        ) AS candidates
        GROUP BY candidates.id, candidates.content, candidates.source, candidates.metadata
    ),
    catalog_candidates AS MATERIALIZED (
        SELECT d.id, d.content, d.source, d.metadata,
               0.0::FLOAT AS vector_score,
               4.0::FLOAT AS lexical_score
        FROM significant_terms AS terms
        CROSS JOIN LATERAL (
            SELECT d.id, d.content, d.source, d.metadata
            FROM public.documents AS d
            WHERE public.rag_document_is_active(d.metadata)
              AND d.metadata->>'reference_verified' = 'true'
              AND position(terms.token in lower(COALESCE(d.metadata->>'reference_title', ''))) > 0
            LIMIT GREATEST(match_count * 2, 10)
        ) AS d
    ),
    combined AS (
        SELECT id, content, source, metadata,
               max(vector_score) AS vector_score,
               max(lexical_score) AS lexical_score
        FROM (
            SELECT * FROM semantic_candidates
            UNION ALL
            SELECT * FROM lexical_candidates
            UNION ALL
            SELECT * FROM catalog_candidates
        ) AS candidates
        GROUP BY id, content, source, metadata
    )
    SELECT c.id, c.content, c.source, c.metadata,
           (c.vector_score + c.lexical_score)::FLOAT AS similarity
    FROM combined AS c
    ORDER BY similarity DESC
    LIMIT match_count;
$$;

REVOKE ALL ON FUNCTION public.match_documents(VECTOR, FLOAT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_documents(VECTOR, FLOAT, INTEGER) TO service_role;

REVOKE ALL ON FUNCTION public.match_documents_hybrid(VECTOR, TEXT, FLOAT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_documents_hybrid(VECTOR, TEXT, FLOAT, INTEGER) TO service_role;
