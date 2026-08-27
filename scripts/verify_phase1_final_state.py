"""Verificador objetivo de encerramento da Fase 1 (Drive → RAG).

O comando é intencionalmente somente leitura. Em modo estrito retorna código
não zero enquanto houver qualquer pendência que possa fazer o RAG servir uma
base incompleta ou fora de sincronia.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any

import psycopg
from psycopg.rows import dict_row
from supabase import Client, create_client


def load_drive_ids(path: Path) -> set[str]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    files = raw.get("files", raw) if isinstance(raw, dict) else raw
    if not isinstance(files, list):
        raise SystemExit("Inventário do Drive inválido")
    return {str(item["id"]) for item in files if isinstance(item, dict) and item.get("id")}


def load_state_from_database(database_url: str) -> tuple[list[dict[str, Any]], dict[str, str], list[dict[str, Any]], int]:
    with psycopg.connect(database_url, row_factory=dict_row) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT metadata->>'drive_file_id' AS drive_file_id,
                       COUNT(*) FILTER (WHERE rag_document_is_active(metadata)) AS active_chunks,
                       COUNT(*) FILTER (WHERE metadata->>'rag_status' = 'staging') AS staging_chunks
                FROM documents
                WHERE NULLIF(metadata->>'drive_file_id', '') IS NOT NULL
                GROUP BY metadata->>'drive_file_id'
                """
            )
            states = [dict(row) for row in cursor.fetchall()]
            cursor.execute("SELECT drive_file_id, status FROM drive_sync_manifest")
            manifests = {str(row["drive_file_id"]): str(row["status"]) for row in cursor.fetchall()}
            cursor.execute("SELECT drive_file_id, status, attempts, max_attempts FROM drive_sync_jobs")
            jobs = [dict(row) for row in cursor.fetchall()]
            cursor.execute(
                """
                SELECT COUNT(*) AS count
                FROM documents
                WHERE rag_document_is_active(metadata)
                  AND NULLIF(metadata->>'drive_file_id', '') IS NULL
                """
            )
            active_unmanaged = int(cursor.fetchone()["count"])
    return states, manifests, jobs, active_unmanaged


def load_state_from_supabase() -> tuple[list[dict[str, Any]], dict[str, str], list[dict[str, Any]], int]:
    """Consulta o mesmo estado via PostgREST quando o PostgreSQL direto não tem rota."""
    supabase_url = os.getenv("SUPABASE_URL", "").strip()
    supabase_key = (
        os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
        or os.getenv("SUPABASE_KEY", "").strip()
    )
    if not supabase_url or not supabase_key:
        raise SystemExit("SUPABASE_URL e uma chave Supabase são necessárias para o fallback REST")

    client: Client = create_client(supabase_url, supabase_key)
    states = [dict(row) for row in client.rpc("get_rag_drive_file_states", {}).execute().data]
    manifests = {
        str(row["drive_file_id"]): str(row["status"])
        for row in client.table("drive_sync_manifest").select("drive_file_id,status").execute().data
    }
    jobs = [
        dict(row)
        for row in client.table("drive_sync_jobs")
        .select("drive_file_id,status,attempts,max_attempts")
        .execute()
        .data
    ]
    # Sem drive_file_id, somente o status explicitamente ativo é pesquisável.
    unmanaged_response = (
        client.table("documents")
        .select("id", count="exact", head=True)
        .eq("metadata->>rag_status", "active")
        .is_("metadata->>drive_file_id", "null")
        .execute()
    )
    active_unmanaged = int(unmanaged_response.count or 0)
    return states, manifests, jobs, active_unmanaged


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--drive-json", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument(
        "--allow-pending",
        action="store_true",
        help="Gera diagnóstico sem falhar o processo enquanto a fila ainda trabalha.",
    )
    args = parser.parse_args()
    drive_ids = load_drive_ids(args.drive_json)
    database_url = os.getenv("SUPABASE_DB_URL", "").strip()
    state_source = "postgres"
    if database_url:
        try:
            states, manifests, jobs, active_unmanaged = load_state_from_database(database_url)
        except psycopg.OperationalError:
            states, manifests, jobs, active_unmanaged = load_state_from_supabase()
            state_source = "supabase_rest_fallback"
    else:
        states, manifests, jobs, active_unmanaged = load_state_from_supabase()
        state_source = "supabase_rest"

    active_by_id = {str(row["drive_file_id"]): int(row["active_chunks"]) for row in states}
    staging_by_id = {str(row["drive_file_id"]): int(row["staging_chunks"]) for row in states}
    active_ids = {file_id for file_id, count in active_by_id.items() if count > 0}
    staging_ids = {file_id for file_id, count in staging_by_id.items() if count > 0}
    pending_jobs = [row for row in jobs if row["status"] in {"queued", "running"}]
    failed_jobs = [row for row in jobs if row["status"] == "failed"]

    checks = {
        "drive_files_without_active_vectors": sorted(drive_ids - active_ids),
        "active_vectors_without_live_drive_file": sorted(active_ids - drive_ids),
        "drive_files_without_active_manifest": sorted(
            file_id for file_id in drive_ids if manifests.get(file_id) != "active"
        ),
        "staging_drive_file_ids": sorted(staging_ids),
        "pending_jobs": pending_jobs,
        "failed_jobs": failed_jobs,
        "active_unmanaged_chunks": active_unmanaged,
    }
    passed = not any(checks.values())
    report = {
        "phase": 1,
        "passed": passed,
        "state_source": state_source,
        "inventory_drive_files": len(drive_ids),
        "active_managed_file_ids": len(active_ids),
        "active_managed_chunks": sum(active_by_id.values()),
        "staging_chunks": sum(staging_by_id.values()),
        "checks": checks,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False))
    if not passed and not args.allow_pending:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
