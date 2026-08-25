"""
db/supabase_client.py — Inicialização e acesso ao cliente Supabase.

Utiliza o padrão Singleton via `lru_cache` para garantir que apenas
uma instância do cliente seja criada durante o ciclo de vida da aplicação.
"""

from functools import lru_cache
from supabase import create_client, Client
from config import get_settings
import structlog

logger = structlog.get_logger(__name__)


@lru_cache(maxsize=1)
def get_supabase_client() -> Client:
    """
    Retorna o cliente Supabase inicializado (Singleton).

    O decorator `lru_cache` garante que `create_client` seja chamado
    apenas uma vez, evitando conexões redundantes.

    Returns:
        Client: Instância autenticada do cliente Supabase.

    Raises:
        ValueError: Se as variáveis SUPABASE_URL ou SUPABASE_KEY
                    não estiverem configuradas no ambiente.
    """
    settings = get_settings()

    if not settings.supabase_url or not settings.supabase_key:
        raise ValueError(
            "Variáveis de ambiente SUPABASE_URL e SUPABASE_KEY são obrigatórias."
        )

    logger.info(
        "supabase_client_initialized",
        url=settings.supabase_url,
        env=settings.app_env,
    )

    return create_client(settings.supabase_url, settings.supabase_key)


async def check_supabase_connection() -> bool:
    """
    Verifica se a conexão com o Supabase está ativa.
    Usado no health check do FastAPI.

    Returns:
        bool: True se a conexão estiver OK, False caso contrário.
    """
    try:
        client = get_supabase_client()
        settings = get_settings()
        # Faz uma query simples de verificação
        client.table(settings.rag_table_name).select("id").limit(1).execute()
        return True
    except Exception as exc:
        logger.error("supabase_connection_failed", error=str(exc))
        return False
