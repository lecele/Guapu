-- Repara lotes legados gerenciados pelo Drive que foram indexados antes da
-- introdução de rag_status. Esses chunks são conteúdo publicado: possuem
-- drive_file_id, mas não carregam o campo explícito "active".
--
-- Não reprocessa PDFs, não altera embeddings, conteúdo ou metadados em massa.
-- Chunks staging e registros sem identidade do Drive continuam fora da
-- recuperação; a compatibilidade legada fica na função predicada abaixo.
BEGIN;

-- O predicado canônico mantém compatibilidade com os chunks legados mesmo se
-- uma instalação tiver mantido uma versão antiga de match_documents*. Somente
-- documentos rastreáveis pelo Drive podem assumir active por ausência de campo.
CREATE OR REPLACE FUNCTION public.rag_document_is_active(document_metadata JSONB)
RETURNS BOOLEAN
LANGUAGE SQL IMMUTABLE PARALLEL SAFE
SET search_path = public
AS $$
    SELECT COALESCE(
        document_metadata->>'rag_status',
        CASE
            WHEN document_metadata ? 'drive_file_id'
             AND NULLIF(document_metadata->>'drive_file_id', '') IS NOT NULL
            THEN 'active'
            ELSE 'quarantined'
        END
    ) = 'active';
$$;

-- Recria o caminho global usado como fallback de recuperação por fonte.
CREATE OR REPLACE FUNCTION public.match_documents(
    query_embedding VECTOR(768),
    match_threshold FLOAT DEFAULT 0.75,
    match_count INTEGER DEFAULT 5
)
RETURNS TABLE (id UUID, content TEXT, source TEXT, metadata JSONB, similarity FLOAT)
LANGUAGE SQL STABLE
SET search_path = public
AS $$
    SELECT d.id, d.content, d.source, d.metadata,
           1 - (d.embedding <=> query_embedding) AS similarity
    FROM public.documents AS d
    WHERE public.rag_document_is_active(d.metadata)
      AND 1 - (d.embedding <=> query_embedding) >= match_threshold
    ORDER BY d.embedding <=> query_embedding
    LIMIT match_count;
$$;

-- Recria o caminho administrativo com fonte exata. Ele consulta chunks active
-- e chunks legados gerenciados sem rag_status, mas nunca staging/quarantined.
CREATE OR REPLACE FUNCTION public.match_documents_filtered(
    query_embedding VECTOR(768),
    match_threshold FLOAT DEFAULT 0.25,
    match_count INTEGER DEFAULT 5,
    source_pattern TEXT DEFAULT NULL
)
RETURNS TABLE (id UUID, content TEXT, source TEXT, metadata JSONB, similarity FLOAT)
LANGUAGE SQL STABLE
SET search_path = public
AS $$
    SELECT d.id, d.content, d.source, d.metadata,
           1 - (d.embedding <=> query_embedding) AS similarity
    FROM public.documents AS d
    WHERE public.rag_document_is_active(d.metadata)
      AND (source_pattern IS NULL OR lower(d.source) = lower(source_pattern))
      AND 1 - (d.embedding <=> query_embedding) >= match_threshold
    ORDER BY d.embedding <=> query_embedding
    LIMIT match_count;
$$;

COMMIT;
