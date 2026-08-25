"""
db/__init__.py — Exportações públicas do módulo de banco de dados.
"""

from .supabase_client import get_supabase_client, check_supabase_connection
from .memory import (
    init_checkpointer,
    close_checkpointer,
    get_checkpointer,
    save_turn_to_audit,
    get_session_history,
)

__all__ = [
    "get_supabase_client",
    "check_supabase_connection",
    "init_checkpointer",
    "close_checkpointer",
    "get_checkpointer",
    "save_turn_to_audit",
    "get_session_history",
]
