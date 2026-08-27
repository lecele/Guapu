"""Remove apenas duplicatas legadas que tenham backup e aprovação da Fase 1.

Por padrão executa um diagnóstico. A exclusão exige ``--apply`` e só é aceita
quando o verificador final da Fase 1 produziu ``passed: true``.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
from collections import Counter
from pathlib import Path

import psycopg
from psycopg.rows import dict_row


def candidate_sources(path: Path) -> set[str]:
    with path.open(encoding="utf-8-sig", newline="") as stream:
        return {
            row["legacy_source"]
            for row in csv.DictReader(stream)
            if row.get("conclusion", "").startswith("IDENTIDADE_PROVAVEL")
        }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--candidates-csv", type=Path, required=True)
    parser.add_argument("--backup-manifest", type=Path, required=True)
    parser.add_argument("--phase1-report", type=Path, required=True)
    parser.add_argument("--expected-backup-sha256", required=True)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    backup = json.loads(args.backup_manifest.read_text(encoding="utf-8"))
    phase1 = json.loads(args.phase1_report.read_text(encoding="utf-8"))
    if backup.get("operation") != "backup_only":
        raise SystemExit("Manifesto de backup inválido")
    if backup.get("rows_sha256") != args.expected_backup_sha256:
        raise SystemExit("Hash do backup não confere; exclusão bloqueada")
    if not phase1.get("passed"):
        raise SystemExit("Fase 1 ainda não foi aprovada; exclusão bloqueada")

    sources = candidate_sources(args.candidates_csv)
    expected_counts = {str(key): int(value) for key, value in backup["source_chunk_counts"].items()}
    if sources != set(expected_counts):
        raise SystemExit("Lista de candidatos diverge do backup; exclusão bloqueada")
    database_url = os.getenv("SUPABASE_DB_URL", "").strip()
    if not database_url:
        raise SystemExit("SUPABASE_DB_URL não configurada")

    with psycopg.connect(database_url, row_factory=dict_row) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT source, count(*) AS chunks
                FROM documents
                WHERE NULLIF(metadata->>'drive_file_id', '') IS NULL
                  AND source = ANY(%s)
                GROUP BY source
                ORDER BY source
                """,
                (sorted(sources),),
            )
            current_counts = {str(row["source"]): int(row["chunks"]) for row in cursor.fetchall()}
            result = {
                "phase1_passed": True,
                "eligible_sources": len(sources),
                "expected_chunks": sum(expected_counts.values()),
                "current_chunks": sum(current_counts.values()),
                "matches_backup": current_counts == expected_counts,
                "mode": "apply" if args.apply else "dry_run",
            }
            if current_counts != expected_counts:
                raise SystemExit("Banco diverge do backup; exclusão bloqueada")
            if not args.apply:
                print(json.dumps(result, ensure_ascii=False))
                return
            cursor.execute(
                """
                DELETE FROM documents
                WHERE NULLIF(metadata->>'drive_file_id', '') IS NULL
                  AND source = ANY(%s)
                RETURNING source
                """,
                (sorted(sources),),
            )
            deleted_counts = Counter(str(row["source"]) for row in cursor.fetchall())
            if dict(deleted_counts) != expected_counts:
                raise RuntimeError("Contagem removida diverge do backup; transação será revertida")
            connection.commit()
            result["deleted_chunks"] = sum(deleted_counts.values())
            print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
