-- ==============================================================================
-- migrations/003_add_chat_history.sql
-- Tabelas para memória de sessão e audit trail de conversas.
--
-- IMPORTANTE: As tabelas de checkpoint do LangGraph (checkpoints,
-- checkpoint_blobs, checkpoint_writes) são criadas AUTOMATICAMENTE
-- pelo AsyncPostgresSaver.setup() na inicialização da aplicação.
-- Este script cria apenas as tabelas de negócio que NOSSAS consultas usam.
--
-- Execute este script APÓS os scripts 001 e 002.
-- ==============================================================================

-- ==============================================================================
-- 1. Tabela de Sessões de Chat
--    Cada sessão corresponde a uma conversa com um estudante.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS chat_sessions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    metadata    JSONB DEFAULT '{}'::jsonb
    -- Exemplos de metadata: { "student_id": "...", "course": "Enfermagem Clínica" }
);

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_chat_sessions_updated_at
    BEFORE UPDATE ON chat_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


-- ==============================================================================
-- 2. Tabela de Mensagens (Audit Trail Humano-Legível)
--    Separada das tabelas do LangGraph Checkpoint para análise acadêmica.
--    Permite queries SQL diretas sobre o histórico sem desserializar checkpoints.
-- ==============================================================================
CREATE TABLE IF NOT EXISTS chat_messages (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id  UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role        TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content     TEXT NOT NULL,
    metadata    JSONB DEFAULT '{}'::jsonb,
    -- Exemplos de metadata na mensagem do assistant:
    -- { "sources_found": 3, "has_context": true, "processing_time_ms": 1842.3,
    --   "grade_reasoning": [...] }
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para consultas por sessão (ordenadas por tempo)
CREATE INDEX IF NOT EXISTS chat_messages_session_created_idx
    ON chat_messages (session_id, created_at ASC);

-- Índice para análise acadêmica: agrupar por role
CREATE INDEX IF NOT EXISTS chat_messages_role_idx
    ON chat_messages (role, created_at DESC);


-- ==============================================================================
-- 3. View de Conveniência: Última Mensagem por Sessão
--    Útil para dashboards e relatórios acadêmicos.
-- ==============================================================================
CREATE OR REPLACE VIEW v_session_summary AS
SELECT
    s.id                                AS session_id,
    s.created_at                        AS session_started_at,
    s.updated_at                        AS session_last_activity,
    COUNT(m.id)                         AS total_messages,
    COUNT(m.id) FILTER (WHERE m.role = 'user')      AS user_messages,
    COUNT(m.id) FILTER (WHERE m.role = 'assistant') AS ai_messages,
    MAX(m.created_at)                   AS last_message_at,
    s.metadata
FROM chat_sessions s
LEFT JOIN chat_messages m ON m.session_id = s.id
GROUP BY s.id, s.created_at, s.updated_at, s.metadata;


-- ==============================================================================
-- 4. Row Level Security (RLS)
-- ==============================================================================
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Backend (service_role) tem acesso total
CREATE POLICY "service_role_all_sessions"
    ON chat_sessions FOR ALL
    USING (auth.role() = 'service_role');

CREATE POLICY "service_role_all_messages"
    ON chat_messages FOR ALL
    USING (auth.role() = 'service_role');
