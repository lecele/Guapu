"""Gera SQL idempotente para publicar o catálogo bibliográfico confirmado.

O arquivo gerado é para revisão/aplicação manual no Supabase SQL Editor.
"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "reference_catalog.json"
OUTPUT = ROOT / "documentos" / "QA" / "SUPABASE_CATALOGO_72_E_PROPAGACAO.sql"


def sql(value: str | None) -> str:
    if value is None:
        return "NULL"
    return "'" + value.replace("'", "''") + "'"


def main() -> None:
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    entries = [
        (file_id, entry)
        for file_id, entry in catalog.items()
        if entry.get("reference_verified") is True
    ]
    entries.sort()
    lines = [
        "-- Gerado a partir de reference_catalog.json; somente entradas verified.",
        "-- Revisar no Supabase SQL Editor antes de executar.",
        "-- Não inclui documentos pendentes, conteúdo, embeddings ou índices.",
        "BEGIN;",
        "",
        "CREATE TABLE IF NOT EXISTS public.rag_document_catalog (",
        "    drive_file_id TEXT PRIMARY KEY,",
        "    reference_title TEXT NOT NULL,",
        "    reference_author TEXT, reference_year TEXT, reference_edition TEXT,",
        "    reference_publisher TEXT,",
        "    verification_status TEXT NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending','verified','rejected')),",
        "    verified_from TEXT, notes TEXT,",
        "    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()",
        ");",
        "",
        "COMMIT;",
    ]
    for batch_index in range(0, len(entries), 10):
        batch = entries[batch_index:batch_index + 10]
        lines += [
            "",
            f"-- LOTE {batch_index // 10 + 1}: {len(batch)} documentos",
            "BEGIN;",
            "INSERT INTO public.rag_document_catalog (drive_file_id, reference_title, reference_author, reference_year, reference_edition, reference_publisher, verification_status, verified_from, notes)",
            "VALUES",
        ]
        values = []
        for file_id, entry in batch:
            values.append(
                "(" + ", ".join([
                    sql(file_id), sql(entry.get("reference_title")),
                    sql(entry.get("reference_author")), sql(entry.get("reference_year")),
                    sql(entry.get("reference_edition")), sql(entry.get("reference_publisher")),
                    "'verified'", "'reference_catalog.json'",
                    "'Confirmado no conteúdo dos chunks/Drive; lote local de catalogação.'",
                ]) + ")"
            )
        lines += [
            ",\n".join(values) + "\nON CONFLICT (drive_file_id) DO UPDATE SET\n"
            "reference_title=EXCLUDED.reference_title, reference_author=EXCLUDED.reference_author,\n"
            "reference_year=EXCLUDED.reference_year, reference_edition=EXCLUDED.reference_edition,\n"
            "reference_publisher=EXCLUDED.reference_publisher, verification_status='verified',\n"
            "verified_from=EXCLUDED.verified_from, notes=EXCLUDED.notes, updated_at=now();",
            "COMMIT;",
        ]
    lines += [
        "",
        "-- Aplique 040_sync_catalog_reference_metadata_to_chunks.sql antes deste bloco",
        "-- se o trigger ainda não existir. O trigger preserva content, embeddings e demais metadados.",
        "",
        f"-- EXPECTED_VERIFIED_CATALOG_ROWS: {len(entries)}",
    ]
    OUTPUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"generated={OUTPUT} entries={len(entries)}")


if __name__ == "__main__":
    main()
