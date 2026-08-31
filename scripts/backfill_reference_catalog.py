"""Sincroniza referências verificadas do catálogo para os chunks ativos."""

from __future__ import annotations

import json
from pathlib import Path

import psycopg

from compact_free_tier_rag import database_url

ROOT = Path(__file__).resolve().parents[1]
FIELDS = (
    "reference_title",
    "reference_author",
    "reference_year",
    "reference_edition",
    "reference_publisher",
    "reference_source",
    "reference_verified",
    "reference_key",
)


def main() -> None:
    catalog = json.loads((ROOT / "reference_catalog.json").read_text(encoding="utf-8"))
    verified = {
        str(file_id): {key: entry[key] for key in FIELDS if key in entry}
        for file_id, entry in catalog.items()
        if entry.get("reference_verified") is True
    }
    updated = 0
    with psycopg.connect(database_url(), autocommit=True) as connection:
        with connection.cursor() as cursor:
            for file_id, fields in verified.items():
                cursor.execute(
                    """
                    UPDATE public.documents
                    SET metadata = metadata || %s::jsonb
                    WHERE metadata->>'drive_file_id' = %s
                      AND public.rag_document_is_active(metadata)
                    """,
                    (json.dumps(fields, ensure_ascii=False), file_id),
                )
                updated += cursor.rowcount
    print(json.dumps({"catalog_entries": len(verified), "updated_chunks": updated}, ensure_ascii=False))


if __name__ == "__main__":
    main()
