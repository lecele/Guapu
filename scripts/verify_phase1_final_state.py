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

import psycopg
from psycopg.rows import dict_row


def load_drive_ids(path: Path) -> set[str]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    files = raw.get("files", raw) if isinstance(raw, dict) else raw
    if not isinstance(files, list):
        raise SystemExit("Inventário do Drive inválido")
    return {str(item["id"]) for item in files if isinstance(item, dict) and item.get("id")}


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
    database_url = os.getenv("SUPABASE_DB_URL", "").strip()
    if not database_url:
        raise SystemExit("SUPABASE_DB_URL não configurada")

    drive_ids = load_drive_ids(args.drive_json)
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
