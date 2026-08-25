-- Auditoria somente-leitura do schema de produção.
-- Execute no SQL Editor do Supabase e anexe o resultado ao baseline da Fase 0.
-- Este arquivo não cria, altera ou remove dados.

-- 1. Colunas e tipos das tabelas usadas pelo chat.
SELECT
  table_name,
  column_name,
  data_type,
  udt_name,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('chat_sessions', 'chat_messages', 'documents', 'feedback_ratings')
ORDER BY table_name, ordinal_position;

-- 2. Chaves primárias, estrangeiras e checks.
SELECT
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type,
  kcu.column_name,
  ccu.table_name AS referenced_table,
  ccu.column_name AS referenced_column
FROM information_schema.table_constraints AS tc
LEFT JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
LEFT JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.table_schema = 'public'
  AND tc.table_name IN ('chat_sessions', 'chat_messages', 'documents', 'feedback_ratings')
ORDER BY tc.table_name, tc.constraint_type, tc.constraint_name;

-- 3. Situação da persistência de mensagens e metadados.
SELECT
  COUNT(*) AS total_messages,
  COUNT(DISTINCT session_id) AS total_sessions_in_messages,
  COUNT(*) FILTER (WHERE role = 'assistant') AS assistant_messages,
  COUNT(*) FILTER (WHERE role = 'assistant' AND metadata <> '{}'::jsonb) AS assistant_messages_with_metadata,
  MIN(created_at) AS first_message_at,
  MAX(created_at) AS last_message_at
FROM public.chat_messages;

-- 4. Sessões presentes em mensagens sem registro correspondente em chat_sessions.
-- Se a consulta retornar linhas, a rota atual e a migração não estão alinhadas.
SELECT
  m.session_id,
  COUNT(*) AS message_count,
  MIN(m.created_at) AS first_message_at,
  MAX(m.created_at) AS last_message_at
FROM public.chat_messages AS m
LEFT JOIN public.chat_sessions AS s ON s.id::text = m.session_id::text
WHERE s.id IS NULL
GROUP BY m.session_id
ORDER BY last_message_at DESC
LIMIT 50;

-- 5. Tipos e origem dos chunks atualmente indexados.
SELECT
  COUNT(*) AS total_chunks,
  COUNT(DISTINCT source) AS total_sources,
  COUNT(*) FILTER (WHERE metadata ? 'drive_file_id') AS chunks_with_drive_file_id,
  COUNT(DISTINCT metadata ->> 'drive_file_id') AS distinct_drive_file_ids,
  COUNT(*) FILTER (WHERE metadata ? 'content_hash') AS chunks_with_content_hash
FROM public.documents;

