-- ==============================================================================
-- migrations/001_setup_pgvector.sql
-- Configuração inicial do pgvector e criação da tabela de documentos.
--
-- Execute este script no SQL Editor do Supabase antes de iniciar a aplicação.
-- ==============================================================================

-- 1. Habilita a extensão pgvector (necessário apenas uma vez por projeto)
CREATE EXTENSION IF NOT EXISTS vector;

-- ==============================================================================
-- 2. Tabela principal de chunks de documentos
-- ==============================================================================
CREATE TABLE IF NOT EXISTS documents (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content     TEXT NOT NULL,                  -- Texto do chunk
    embedding   VECTOR(768) NOT NULL,           -- Embedding 768-dim (text-embedding-004)
    source      TEXT,                           -- Nome/URL do arquivo de origem
    metadata    JSONB DEFAULT '{}'::jsonb,      -- Metadados flexíveis (página, seção, etc.)
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- 3. Índice HNSW para busca vetorial rápida (cosine similarity)
--    HNSW é o recomendado para produção com pgvector >= 0.5.0
-- ==============================================================================
CREATE INDEX IF NOT EXISTS documents_embedding_hnsw_idx
    ON documents
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- ==============================================================================
-- 4. Função RPC: match_documents
--    Chamada via client.rpc("match_documents", {...}) no Python.
--    Executa busca vetorial por similaridade de cosseno.
-- ==============================================================================
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
AS $$
    SELECT
        d.id,
        d.content,
        d.source,
        d.metadata,
        1 - (d.embedding <=> query_embedding) AS similarity
    FROM documents d
    WHERE 1 - (d.embedding <=> query_embedding) >= match_threshold
    ORDER BY d.embedding <=> query_embedding  -- ASC = mais similar primeiro
    LIMIT match_count;
$$;

-- ==============================================================================
-- 5. Row Level Security (RLS) — Segurança recomendada para produção
-- ==============================================================================
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Política: Serviço backend pode ler e inserir (usando service_role key)
CREATE POLICY "service_role_all"
    ON documents
    FOR ALL
    USING (auth.role() = 'service_role');

-- Política: Anon pode apenas ler (para uso com anon key em dev)
CREATE POLICY "anon_read"
    ON documents
    FOR SELECT
    USING (auth.role() = 'anon');
