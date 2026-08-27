"""Cria backup verificável de candidatos legados antes de qualquer remoção.

Este utilitário é somente leitura: exporta os chunks legados dos pares que a
auditoria classificou como identidade provável. A remoção, se autorizada, é
uma operação separada e só pode ocorrer após a Fase 1 estar aprovada.
"""

from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import json
import os
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import psycopg
from psycopg.rows import dict_row


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--candidates-csv", type=Path, required=True)
    parser.add_argument("--output-gzip", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    args = parser.parse_args()
    database_url = os.getenv("SUPABASE_DB_URL", "").strip()
    if not database_url:
        raise SystemExit("SUPABASE_DB_URL não configurada")

    with args.candidates_csv.open(encoding="utf-8-sig", newline="") as stream:
        sources = sorted(
            {
                row["legacy_source"]
                for row in csv.DictReader(stream)
                if row.get("conclusion", "").startswith("IDENTIDADE_PROVAVEL")
            }
        )
    if not sources:
        raise SystemExit("Nenhum candidato elegível encontrado")

    args.output_gzip.parent.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha256()
    counts: Counter[str] = Counter()
    total = 0
    with psycopg.connect(database_url, row_factory=dict_row) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id::text, content, embedding::text AS embedding, source, metadata, created_at
                FROM documents
                WHERE NULLIF(metadata->>'drive_file_id', '') IS NULL
                  AND source = ANY(%s)
                ORDER BY source, id
                """,
                (sources,),
            )
            with gzip.open(args.output_gzip, "wt", encoding="utf-8", newline="\n") as stream:
                for row in cursor:
                    payload = json.dumps(dict(row), ensure_ascii=False, default=str, separators=(",", ":"))
                    stream.write(payload + "\n")
                    digest.update((payload + "\n").encode("utf-8"))
                    counts[str(row["source"])] += 1
                    total += 1

    manifest = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "operation": "backup_only",
        "reason": "Candidatos legados com identidade provável; nenhuma exclusão executada.",
        "sources": len(sources),
        "chunks": total,
        "rows_sha256": digest.hexdigest(),
        "source_chunk_counts": dict(sorted(counts.items())),
        "artifact": str(args.output_gzip.resolve()),
    }
    args.manifest.parent.mkdir(parents=True, exist_ok=True)
    args.manifest.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"sources": len(sources), "chunks": total, "sha256": digest.hexdigest()}, ensure_ascii=False))


if __name__ == "__main__":
    main()
