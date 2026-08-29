"""Audita referências de documentos ativos via Supabase REST, sem alterar dados."""

from __future__ import annotations

import argparse
import json
import os
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from reference_metadata import extract_reference_metadata, propose_cover_title


def fetch_page(base_url: str, service_key: str, offset: int, limit: int) -> list[dict[str, Any]]:
    query = urlencode(
        {
            "select": "metadata,content",
            "metadata->>rag_status": "eq.active",
            "limit": str(limit),
            "offset": str(offset),
        }
    )
    request = Request(
        f"{base_url.rstrip('/')}/rest/v1/documents?{query}",
        headers={
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Accept": "application/json",
        },
    )
    with urlopen(request, timeout=90) as response:
        return json.load(response)


def numeric(metadata: dict[str, Any], field: str) -> int:
    try:
        return int(metadata.get(field) or 999999)
    except (TypeError, ValueError):
        return 999999


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=1000)
    parser.add_argument("--catalog", type=Path, default=ROOT / "reference_catalog.json")
    args = parser.parse_args()

    base_url = os.environ.get("SUPABASE_URL")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not base_url or not service_key:
        raise RuntimeError("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias")

    catalog = json.loads(args.catalog.read_text(encoding="utf-8")) if args.catalog.exists() else {}
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    # O limite máximo padrão do REST do Supabase é 1000; respeitá-lo evita
    # encerrar a auditoria cedo quando alguém informa um lote maior.
    page_limit = min(max(args.limit, 1), 1000)
    offset = 0
    while True:
        rows = fetch_page(base_url, service_key, offset, page_limit)
        if not rows:
            break
        for row in rows:
            metadata = row.get("metadata") or {}
            file_id = metadata.get("drive_file_id")
            if file_id:
                groups[str(file_id)].append(row)
        offset += len(rows)
        if len(rows) < page_limit:
            break

    summary: list[dict[str, Any]] = []
    for file_id, rows in sorted(groups.items()):
        ordered = sorted(
            rows,
            key=lambda row: (
                numeric(row.get("metadata") or {}, "page_number"),
                numeric(row.get("metadata") or {}, "chunk_index"),
            ),
        )
        text = "\n".join(str(row.get("content") or "") for row in ordered[:20])
        explicit = extract_reference_metadata([{"text": text}])
        cover = propose_cover_title(text)
        existing = any(
            (row.get("metadata") or {}).get("reference_verified") is True for row in rows
        )
        entry = catalog.get(file_id) or {}
        verified = entry.get("reference_verified") is True or existing
        summary.append(
            {
                "drive_file_id": file_id,
                "chunks": len(rows),
                "catalog_verified": verified,
                "catalog_title": entry.get("reference_title"),
                "explicit_metadata": explicit,
                "cover_candidate": cover,
                "status": "verified" if verified else (
                    "candidate_review" if explicit or cover else "needs_manual_review"
                ),
            }
        )

    counts: dict[str, int] = defaultdict(int)
    for item in summary:
        counts[item["status"]] += 1
    print(
        json.dumps(
            {
                "documents": len(summary),
                "chunks": sum(item["chunks"] for item in summary),
                "status_counts": counts,
                "items": summary,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
