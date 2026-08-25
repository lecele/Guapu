-- =============================================================================
-- 004_add_persistent_chat_state.sql
-- Estado persistente, idempotência e telemetria do chat Next.js.
--
-- Migração aditiva e compatível com session_id legado (TEXT) e UUID.
-- Não altera nem remove mensagens existentes.
-- =============================================================================

BEGIN;

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS request_id UUID;

CREATE INDEX IF NOT EXISTS chat_messages_session_created_idx
  ON public.chat_messages (session_id, created_at ASC);

CREATE UNIQUE INDEX IF NOT EXISTS chat_messages_turn_role_unique_idx
  ON public.chat_messages (session_id, request_id, role)
  WHERE request_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.chat_session_state (
  session_id       TEXT PRIMARY KEY,
  state            TEXT NOT NULL DEFAULT 'MENU_PRINCIPAL',
  mode             TEXT NOT NULL DEFAULT 'livre',
  current_topic    TEXT NOT NULL DEFAULT '',
  quiz_question    SMALLINT NOT NULL DEFAULT 0,
  quiz_attempt     SMALLINT NOT NULL DEFAULT 0,
  flow_version     TEXT NOT NULL DEFAULT 'v1',
  revision         BIGINT NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chat_session_state_quiz_question_check
    CHECK (quiz_question BETWEEN 0 AND 3),
  CONSTRAINT chat_session_state_quiz_attempt_check
    CHECK (quiz_attempt BETWEEN 0 AND 2)
);

CREATE INDEX IF NOT EXISTS chat_session_state_updated_idx
  ON public.chat_session_state (updated_at DESC);

ALTER TABLE public.chat_session_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_chat_session_state"
  ON public.chat_session_state;

CREATE POLICY "service_role_all_chat_session_state"
  ON public.chat_session_state
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMIT;

