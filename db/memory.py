"""
db/memory.py — Gerenciamento de Memória Persistente com LangGraph + Supabase.

Este módulo é responsável por duas camadas de memória:

CAMADA 1 — LangGraph Checkpoint (AsyncPostgresSaver):
  - Persiste o ESTADO COMPLETO do grafo (documents, generation, messages, etc.)
    após cada nó de forma automática.
  - Usa as tabelas: checkpoints, checkpoint_blobs, checkpoint_writes
    (criadas automaticamente por checkpointer.setup()).
  - Identificado por thread_id = session_id da conversa.
  - Permite que o LangGraph retome o estado de onde parou em cada invocação.

CAMADA 2 — Audit Trail (chat_messages):
  - Tabela humano-legível para análise acadêmica e rastreabilidade.
  - Criada pela migration 003_add_chat_history.sql.
  - Permite queries SQL diretas sem desserializar o estado do checkpoint.

Fluxo de uso:
  1. Na inicialização da app: await init_checkpointer()
  2. Na construção do grafo: build_crag_graph(checkpointer=get_checkpointer())
  3. Por invocação: await save_turn_to_audit(session_id, user_msg, ai_msg, metadata)
  4. No shutdown da app: await close_checkpointer()
"""

from __future__ import annotations

import uuid
from typing import Optional

import psycopg
import structlog
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from langgraph.checkpoint.memory import MemorySaver

from config import get_settings
from db.supabase_client import get_supabase_client

logger = structlog.get_logger(__name__)

# ==============================================================================
# Singletons de estado da aplicação
# ==============================================================================

_checkpointer: AsyncPostgresSaver | MemorySaver | None = None
_pg_connection: psycopg.AsyncConnection | None = None


# ==============================================================================
# CAMADA 1 — LangGraph Checkpoint (PostgreSQL via Supabase)
# ==============================================================================

async def init_checkpointer() -> AsyncPostgresSaver | MemorySaver:
    """
    Inicializa o checkpointer persistente do LangGraph.

    Estratégia:
      - Se SUPABASE_DB_URL estiver configurado: usa AsyncPostgresSaver (Supabase).
      - Caso contrário: usa MemorySaver em memória (apenas para desenvolvimento local).

    O AsyncPostgresSaver cria suas próprias tabelas no banco via setup():
      - checkpoints
      - checkpoint_blobs
      - checkpoint_writes

    A string de conexão SUPABASE_DB_URL deve ter o formato:
      postgresql://postgres:<password>@<host>:5432/postgres

    Returns:
        Checkpointer configurado e pronto para uso.
    """
    global _checkpointer, _pg_connection

    settings = get_settings()

    if not settings.supabase_db_url:
        logger.warning(
            "checkpointer_fallback_memory",
            reason="SUPABASE_DB_URL não configurado",
            impact="Memória de sessão NÃO será persistida entre reinicializações do servidor",
        )
        _checkpointer = MemorySaver()
        return _checkpointer

    try:
        logger.info("checkpointer_postgres_init", db_url_prefix=settings.supabase_db_url[:40])

        _pg_connection = await psycopg.AsyncConnection.connect(
            settings.supabase_db_url,
            autocommit=True,    # Obrigatório para o AsyncPostgresSaver funcionar corretamente
            prepare_threshold=0,  # Evita erros com pgBouncer (Supabase usa connection pooler)
            connect_timeout=3,    # Evita travar a subida do servidor caso o banco esteja indisponível
        )

        _checkpointer = AsyncPostgresSaver(_pg_connection)

        # Cria as tabelas do LangGraph checkpoint (idempotente — seguro re-executar)
        await _checkpointer.setup()

        logger.info("checkpointer_postgres_ready")

    except Exception as exc:
        logger.error(
            "checkpointer_postgres_error",
            error=str(exc),
            fallback="MemorySaver (desenvolvimento)",
        )
        # Fallback gracioso para não bloquear a subida do servidor em dev
        _checkpointer = MemorySaver()
        logger.warning("checkpointer_using_memory_fallback")

    return _checkpointer


async def close_checkpointer() -> None:
    """Fecha a conexão PostgreSQL do checkpointer no shutdown da aplicação."""
    global _pg_connection

    if _pg_connection and not _pg_connection.closed:
        await _pg_connection.close()
        logger.info("checkpointer_connection_closed")


def get_checkpointer() -> AsyncPostgresSaver | MemorySaver:
    """
    Retorna o checkpointer inicializado.

    Raises:
        RuntimeError: Se init_checkpointer() não foi chamado ainda.
    """
    if _checkpointer is None:
        raise RuntimeError(
            "Checkpointer não inicializado. "
            "Chame await init_checkpointer() no lifespan da aplicação."
        )
    return _checkpointer


# ==============================================================================
# CAMADA 2 — Audit Trail (chat_messages / chat_sessions)
# ==============================================================================

def _normalize_session_id(session_id: str) -> str:
    """
    Garante que o session_id seja um UUID válido.
    Se não for, converte deterministicamente para UUID v5 baseado em DNS.
    """
    try:
        uuid.UUID(session_id)
        return session_id
    except ValueError:
        # Gera um UUID determinístico e estável baseado no nome da sessão
        return str(uuid.uuid5(uuid.NAMESPACE_DNS, session_id))


async def ensure_session_exists(session_id: str) -> None:
    """
    Garante que a sessão exista na tabela chat_sessions.
    Cria silenciosamente se não existir (upsert).

    Args:
        session_id: ID da sessão (usado como thread_id no LangGraph).
    """
    normalized_id = _normalize_session_id(session_id)
    client = get_supabase_client()
    try:
        client.table("chat_sessions").upsert(
            {"id": normalized_id, "session_id": session_id},
            on_conflict="id",
            ignore_duplicates=True,
        ).execute()
    except Exception as exc:
        # Não bloquear o fluxo por falha no audit trail
        logger.error("audit_ensure_session_error", session_id=session_id, normalized_id=normalized_id, error=str(exc))


async def save_turn_to_audit(
    session_id: str,
    user_message: str,
    ai_response: str,
    ai_metadata: Optional[dict] = None,
) -> None:
    """
    Salva um turno completo (pergunta + resposta) na tabela de audit trail.

    Chamado no endpoint /chat após a resposta do LangGraph.
    Não bloqueia o fluxo em caso de erro.

    Args:
        session_id:   ID da sessão (thread_id do LangGraph).
        user_message: Mensagem enviada pelo estudante.
        ai_response:  Resposta gerada pelo tutor de IA.
        ai_metadata:  Metadados da resposta (sources_found, has_context, etc.).
    """
    normalized_id = _normalize_session_id(session_id)
    client = get_supabase_client()

    try:
        # Garante que a sessão existe
        await ensure_session_exists(session_id)

        # Insere mensagem do usuário e resposta da IA em uma operação.
        # A coluna session_id em chat_messages referencia a coluna session_id (texto original) em chat_sessions.
        # Mapeia as roles 'user'/'assistant' para 'human'/'ai' exigidas pela constraint.
        records = [
            {
                "session_id": session_id,
                "role": "human",
                "content": user_message,
                "metadata": {},
            },
            {
                "session_id": session_id,
                "role": "ai",
                "content": ai_response,
                "metadata": ai_metadata or {},
            },
        ]

        client.table("chat_messages").insert(records).execute()

        logger.debug(
            "audit_turn_saved",
            session_id=session_id,
            normalized_id=normalized_id,
            user_len=len(user_message),
            ai_len=len(ai_response),
        )

    except Exception as exc:
        # Falha no audit trail NÃO deve quebrar a experiência do estudante
        logger.error(
            "audit_save_turn_error",
            session_id=session_id,
            normalized_id=normalized_id,
            error=str(exc),
        )


async def get_session_history(session_id: str, limit: int = 50) -> list[dict]:
    """
    Retorna o histórico de mensagens de uma sessão (da tabela de audit).

    Args:
        session_id: ID da sessão.
        limit:      Máximo de mensagens a retornar.

    Returns:
        Lista de dicts: [{ role, content, created_at, metadata }]
    """
    normalized_id = _normalize_session_id(session_id)
    client = get_supabase_client()
    try:
        result = (
            client.table("chat_messages")
            .select("role, content, created_at, metadata")
            .eq("session_id", session_id)
            .order("created_at", desc=False)
            .limit(limit)
            .execute()
        )
        return result.data or []
    except Exception as exc:
        logger.error("audit_get_history_error", session_id=session_id, normalized_id=normalized_id, error=str(exc))
        return []
