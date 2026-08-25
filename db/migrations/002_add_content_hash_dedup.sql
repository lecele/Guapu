-- ==============================================================================
-- migrations/002_add_content_hash_dedup.sql
-- Adiciona índice UNIQUE em content_hash para suporte à deduplicação
-- idempotente durante o pipeline de ingestion.
--
-- Execute APÓS o script 001_setup_pgvector.sql.
-- ==============================================================================

-- 1. Adiciona a coluna content_hash (se não existir)
ALTER TABLE documents
    ADD COLUMN IF NOT EXISTS content_hash TEXT;

-- 2. Cria índice UNIQUE para deduplicação
--    O upsert com ON CONFLICT usa este índice.
CREATE UNIQUE INDEX IF NOT EXISTS documents_content_hash_unique_idx
    ON documents (content_hash)
    WHERE content_hash IS NOT NULL;

-- 3. Atualiza registros existentes sem hash (retroativo)
UPDATE documents
SET content_hash = encode(sha256(content::bytea), 'hex')
WHERE content_hash IS NULL;
