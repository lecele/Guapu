"""Verifica a propagação bibliográfica via Supabase REST, somente leitura."""

from __future__ import annotations

import json
import os
import urllib.parse
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def env_file() -> dict[str, str]:
    values: dict[str, str] = {}
    for raw in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
        if "=" not in raw or raw.lstrip().startswith("#"):
            continue
        key, value = raw.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def main() -> None:
    values = env_file()
    db_url = urllib.parse.urlparse(values["SUPABASE_DB_URL"])
    host = db_url.hostname or ""
    project = host[3:].split(".", 1)[0] if host.startswith("db.") else host.split(".", 1)[0]
    base = f"https://{project}.supabase.co"
    key = values.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    headers = {"apikey": key, "Authorization": f"Bearer {key}", "Accept": "application/json"}

    catalog_url = base + "/rest/v1/rag_document_catalog?" + urllib.parse.urlencode({
        "select": "drive_file_id,verification_status",
        "verification_status": "eq.verified",
    })
    catalog = json.load(urllib.request.urlopen(urllib.request.Request(catalog_url, headers=headers), timeout=60))
    expected = {str(row["drive_file_id"]) for row in catalog}

    total = staging = missing_drive = verified_chunks = 0
    keys: set[str] = set()
    drive_ids: set[str] = set()
    offset = 0
    while True:
        params = urllib.parse.urlencode({"select": "metadata", "order": "id", "limit": "1000", "offset": str(offset)})
        url = base + "/rest/v1/documents?" + params
        rows = json.load(urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=90))
        if not rows:
            break
        total += len(rows)
        for row in rows:
            metadata = row.get("metadata") or {}
            drive_id = metadata.get("drive_file_id")
            staging += int(metadata.get("rag_status") == "staging")
            missing_drive += int(not drive_id)
            if metadata.get("reference_source") == "catalog" and metadata.get("reference_verified") is True:
                verified_chunks += 1
                if metadata.get("reference_key"):
                    keys.add(str(metadata["reference_key"]))
                if drive_id:
                    drive_ids.add(str(drive_id))
        offset += len(rows)
        if len(rows) < 1000:
            break

    print(json.dumps({
        "catalog_verified": len(expected),
        "documents_total": total,
        "staging": staging,
        "missing_drive_file_id": missing_drive,
        "catalog_verified_chunks": verified_chunks,
        "catalog_reference_keys": len(keys),
        "catalog_drive_ids": len(drive_ids),
        "catalog_ids_without_propagated_chunks": sorted(expected - drive_ids),
        "propagated_ids_not_in_catalog": sorted(drive_ids - expected),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
