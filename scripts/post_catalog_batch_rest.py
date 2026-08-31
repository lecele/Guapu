"""Publica um lote explícito do catálogo via REST, sem alterar chunks/embeddings."""
from __future__ import annotations

import json
import os
import sys
import urllib.request
import urllib.error


def env_file(path: str) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw in open(path, encoding="utf-8"):
        line = raw.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            values[k] = v.strip().strip('"').strip("'")
    return values


def main() -> None:
    catalog_path, env_path, ids_path = sys.argv[1:]
    catalog = json.load(open(catalog_path, encoding="utf-8"))
    ids = [x.strip() for x in open(ids_path, encoding="utf-8") if x.strip()]
    rows = []
    for file_id in ids:
        entry = catalog[file_id]
        rows.append({
            "drive_file_id": file_id,
            "reference_title": entry["reference_title"],
            "reference_author": entry.get("reference_author"),
            "reference_year": entry.get("reference_year"),
            "reference_edition": entry.get("reference_edition"),
            "reference_publisher": entry.get("reference_publisher"),
            "verification_status": "verified",
            "verified_from": "original_drive_pdf",
            "notes": "Confirmado no PDF original do Drive; lote de catalogacao 20260830.",
        })
    values = env_file(env_path)
    key = values["SUPABASE_SERVICE_ROLE_KEY"]
    url = values["SUPABASE_URL"].rstrip("/") + "/rest/v1/rag_document_catalog"
    request = urllib.request.Request(
        url,
        data=json.dumps(rows, ensure_ascii=False).encode(),
        method="POST",
        headers={
            "apikey": key,
            "Authorization": "Bearer " + key,
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=representation",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            result = json.load(response)
    except urllib.error.HTTPError as error:
        print(f"catalog_post_error_status={error.code} body=" + error.read().decode("utf-8", errors="replace"))
        raise
    print(f"catalog_post_status={response.status} rows={len(result)}")


if __name__ == "__main__":
    main()
