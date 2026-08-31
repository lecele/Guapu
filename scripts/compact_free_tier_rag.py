"""Executa a manutenção controlada do RAG para o limite gratuito do Supabase."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any

import psycopg
from psycopg.rows import dict_row


ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "db" / "migrations" / "042_compact_free_tier_rag_indexes.sql"
REBUILDABLE_INDEXES = (
    "public.idx_documents_content_fts_simple",
    "public.idx_documents_active_content_fts_simple",
    "public.idx_documents_active_content_fts_simple_gist",
    "public.documents_active_embedding_hnsw_idx",
    "public.documents_active_embedding_binary_hnsw_idx",
    "public.documents_active_embedding_half_hnsw_idx",
    "public.documents_active_embedding_half_ivfflat_idx",
)


def database_url() -> str:
    value = os.getenv("SUPABASE_DB_URL", "").strip()
    if value:
        return value
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
        if line.startswith("SUPABASE_DB_URL="):
            return line.split("=", 1)[1].strip()
    raise SystemExit("SUPABASE_DB_URL não configurada")


def fetch_state(connection: psycopg.Connection[Any]) -> dict[str, Any]:
    with connection.cursor(row_factory=dict_row) as cursor:
        cursor.execute(
            """
            SELECT
                pg_database_size(current_database()) AS database_bytes,
                pg_total_relation_size('public.documents') AS documents_bytes,
                pg_table_size('public.documents') AS documents_table_bytes,
                pg_indexes_size('public.documents') AS documents_index_bytes,
                (SELECT count(*) FROM public.documents) AS document_rows,
                (SELECT count(*) FROM public.documents
                  WHERE public.rag_document_is_active(metadata)) AS active_rows,
                (SELECT count(*) FROM public.documents
                  WHERE NOT (metadata ? 'drive_file_id')) AS legacy_rows,
                (SELECT count(DISTINCT metadata->>'drive_file_id')
                   FROM public.documents
                  WHERE public.rag_document_is_active(metadata)) AS active_drive_ids,
                (SELECT count(*) FROM public.documents
                  WHERE metadata->>'rag_status' = 'staging') AS staging_rows,
                (SELECT count(*) FROM public.drive_sync_jobs
                  WHERE status IN ('queued', 'running', 'failed')) AS unfinished_jobs
            """
        )
        state = dict(cursor.fetchone())
        cursor.execute(
            """
            SELECT indexrelname AS name,
                   pg_relation_size(indexrelid) AS bytes,
                   idx_scan AS scans
            FROM pg_stat_user_indexes
            WHERE schemaname = 'public' AND relname = 'documents'
            ORDER BY pg_relation_size(indexrelid) DESC
            """
        )
        state["indexes"] = [dict(row) for row in cursor.fetchall()]
        return state


def assert_safe_state(state: dict[str, Any]) -> None:
    failures = {
        "legacy_rows": state["legacy_rows"],
        "staging_rows": state["staging_rows"],
        "unfinished_jobs": state["unfinished_jobs"],
        "active_drive_ids": state["active_drive_ids"] if state["active_drive_ids"] != 119 else 0,
    }
    failures = {key: value for key, value in failures.items() if value}
    if failures:
        raise SystemExit(f"Estado inseguro para manutenção: {failures}")


def preflight() -> None:
    with psycopg.connect(database_url(), autocommit=True) as connection:
        print(json.dumps(fetch_state(connection), ensure_ascii=False, default=str))


def drop_rebuildable_indexes() -> None:
    with psycopg.connect(database_url(), autocommit=True) as connection:
        state = fetch_state(connection)
        assert_safe_state(state)
        with connection.cursor() as cursor:
            for index in REBUILDABLE_INDEXES:
                cursor.execute(f"DROP INDEX IF EXISTS {index}")
                print(f"dropped_index={index}")


def vacuum_full() -> None:
    with psycopg.connect(database_url(), autocommit=True) as connection:
        with connection.cursor() as cursor:
            cursor.execute("SET statement_timeout = 0")
            cursor.execute("VACUUM (FULL, ANALYZE) public.documents")
    print("vacuum_full=completed")


def apply_compact_indexes() -> None:
    sql = MIGRATION.read_text(encoding="utf-8")
    with psycopg.connect(database_url(), autocommit=True) as connection:
        with connection.cursor() as cursor:
            cursor.execute("SET statement_timeout = 0")
            cursor.execute("SET maintenance_work_mem = '64MB'")
            cursor.execute(sql)
    print(f"migration_applied={MIGRATION.name}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    actions = parser.add_mutually_exclusive_group(required=True)
    actions.add_argument("--preflight", action="store_true")
    actions.add_argument("--drop-rebuildable-indexes", action="store_true")
    actions.add_argument("--vacuum-full", action="store_true")
    actions.add_argument("--apply-compact-indexes", action="store_true")
    arguments = parser.parse_args()

    if arguments.preflight:
        preflight()
    elif arguments.drop_rebuildable_indexes:
        drop_rebuildable_indexes()
    elif arguments.vacuum_full:
        vacuum_full()
    else:
        apply_compact_indexes()


if __name__ == "__main__":
    main()
