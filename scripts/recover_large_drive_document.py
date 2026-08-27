"""Recover a completed Drive ingestion without downloading or embedding again.

This is intentionally narrow: it promotes only one already validated Drive file
from staging to active, then repairs its manifest and job state.
"""

from __future__ import annotations

import argparse
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path

import psycopg


FILE_ID = "19X545ckd-ZnfYbo73Tz2glTklUiDA9qd"
EXPECTED_CHUNKS = 18_775
EXPECTED_SOURCE = (
    "biblioteca__cuidados_criticos_enfermagem__livro__"
    "patricia_morton_and_dorrie_fontaine__2011__v9.pdf"
)


def load_env() -> dict[str, str]:
    values: dict[str, str] = {}
    path = Path(".env")
    if not path.exists():
        return values
    for line in path.read_text(encoding="utf-8").splitlines():
        match = re.match(r"^([A-Za-z_][A-Za-z0-9_]*)=(.*)$", line)
        if match:
            values[match.group(1)] = match.group(2).strip().strip('"').strip("'")
    return values


def connection() -> psycopg.Connection:
    env = load_env()
    url = os.environ.get("SUPABASE_DB_URL") or os.environ.get("DATABASE_URL")
    url = url or env.get("SUPABASE_DB_URL") or env.get("DATABASE_URL")
    if not url:
        raise SystemExit("SUPABASE_DB_URL ou DATABASE_URL ausente")
    return psycopg.connect(url)


def count_by_status(cur: psycopg.Cursor, status: str) -> int:
    cur.execute(
        """
        SELECT count(*)
        FROM public.documents
        WHERE metadata->>%s = %s AND metadata->>%s = %s
        """,
        ("drive_file_id", FILE_ID, "rag_status", status),
    )
    return int(cur.fetchone()[0])


def file_total(cur: psycopg.Cursor) -> int:
    cur.execute(
        "SELECT count(*) FROM public.documents WHERE metadata->>%s = %s",
        ("drive_file_id", FILE_ID),
    )
    return int(cur.fetchone()[0])


def source_counts(cur: psycopg.Cursor) -> dict[str, int]:
    cur.execute(
        """
        SELECT COALESCE(source, ''), count(*)
        FROM public.documents
        WHERE metadata->>%s = %s
        GROUP BY source
        ORDER BY source
        """,
        ("drive_file_id", FILE_ID),
    )
    return {str(source): int(count) for source, count in cur.fetchall()}


def print_state(cur: psycopg.Cursor) -> tuple[int, int, int, dict[str, int]]:
    total = file_total(cur)
    staging = count_by_status(cur, "staging")
    active = count_by_status(cur, "active")
    sources = source_counts(cur)
    print(
        json.dumps(
            {
                "file_id": FILE_ID,
                "total": total,
                "staging": staging,
                "active": active,
                "sources": sources,
            },
            ensure_ascii=False,
            sort_keys=True,
        )
    )
    return total, staging, active, sources


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--activate", action="store_true")
    parser.add_argument("--batch-size", type=int, default=50)
    parser.add_argument("--rebuild-indexes", action="store_true")
    args = parser.parse_args()

    with connection() as conn:
        if args.rebuild_indexes:
            conn.autocommit = True
            with conn.cursor() as cur:
                cur.execute("SET statement_timeout = '0'")
                cur.execute(
                    """
                    CREATE INDEX CONCURRENTLY IF NOT EXISTS
                    documents_active_embedding_hnsw_idx
                    ON public.documents USING hnsw (embedding vector_cosine_ops)
                    WITH (m=16, ef_construction=64)
                    WHERE rag_document_is_active(metadata)
                    """
                )
                print("recreated=documents_active_embedding_hnsw_idx")
                cur.execute(
                    """
                    CREATE INDEX CONCURRENTLY IF NOT EXISTS
                    idx_documents_active_content_fts_simple
                    ON public.documents USING gin
                    (to_tsvector('simple', COALESCE(content, '')))
                    WHERE rag_document_is_active(metadata)
                    """
                )
                print("recreated=idx_documents_active_content_fts_simple")
                cur.execute(
                    """
                    CREATE INDEX CONCURRENTLY IF NOT EXISTS
                    idx_documents_active_source_lower
                    ON public.documents (lower(source) text_pattern_ops)
                    WHERE rag_document_is_active(metadata)
                    """
                )
                print("recreated=idx_documents_active_source_lower")
            return

        with conn.cursor() as cur:
            total, staging, active, sources = print_state(cur)
            if not args.activate:
                return
            if total != EXPECTED_CHUNKS or staging + active != EXPECTED_CHUNKS:
                raise SystemExit(
                    "ABORTADO: pré-condições inválidas "
                    f"total={total} staging={staging} active={active}"
                )
            if sources != {EXPECTED_SOURCE: EXPECTED_CHUNKS}:
                raise SystemExit(f"ABORTADO: fontes inesperadas: {sources}")

            if args.batch_size < 1:
                raise SystemExit("ABORTADO: --batch-size deve ser positivo")

            cur.execute("SET statement_timeout = '120s'")
            promoted = 0
            while True:
                cur.execute(
                    """
                    WITH batch AS (
                        SELECT ctid
                        FROM public.documents
                        WHERE metadata->>'drive_file_id' = %s
                          AND metadata->>'rag_status' = 'staging'
                        LIMIT %s
                    )
                    UPDATE public.documents AS d
                    SET metadata = jsonb_set(
                        COALESCE(d.metadata, '{}'::jsonb),
                        '{rag_status}',
                        '"active"'::jsonb,
                        true
                    )
                    FROM batch
                    WHERE d.ctid = batch.ctid
                    """,
                    (FILE_ID, args.batch_size),
                )
                changed = cur.rowcount
                conn.commit()
                if not changed:
                    break
                promoted += changed
                print(f"batch_promoted={changed} total_promoted={promoted}", flush=True)

            total, staging, active, _ = print_state(cur)
            if total != EXPECTED_CHUNKS or staging or active != EXPECTED_CHUNKS:
                raise SystemExit(
                    "ABORTADO: pós-validação inconsistente "
                    f"total={total} staging={staging} active={active}"
                )

            now = datetime.now(timezone.utc)
            cur.execute(
                """
                UPDATE public.drive_sync_manifest
                SET chunks_count=%s, status='active', last_synced_at=%s,
                    last_error=NULL, updated_at=%s
                WHERE drive_file_id=%s
                """,
                (EXPECTED_CHUNKS, now, now, FILE_ID),
            )
            manifest_rows = cur.rowcount
            cur.execute(
                """
                UPDATE public.drive_sync_jobs
                SET status='succeeded', worker_id=NULL, lease_expires_at=NULL,
                    last_error=NULL, completed_at=%s, updated_at=%s
                WHERE drive_file_id=%s AND status IN ('running', 'failed')
                """,
                (now, now, FILE_ID),
            )
            job_rows = cur.rowcount
            print(
                f"promoted={promoted} manifest_rows={manifest_rows} "
                f"job_rows={job_rows}"
            )


if __name__ == "__main__":
    main()
