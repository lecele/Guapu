"""Confere, somente leitura, os documentos catalogados sem chunks propagados."""

from __future__ import annotations

import json
import urllib.parse
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    values: dict[str, str] = {}
    for raw in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
        if "=" in raw and not raw.lstrip().startswith("#"):
            key, value = raw.split("=", 1)
            values[key.strip()] = value.strip().strip('"').strip("'")
    host = urllib.parse.urlparse(values["SUPABASE_DB_URL"]).hostname or ""
    project = host[3:].split(".", 1)[0] if host.startswith("db.") else host.split(".", 1)[0]
    base = f"https://{project}.supabase.co"
    key = values["SUPABASE_SERVICE_ROLE_KEY"]
    headers = {"apikey": key, "Authorization": f"Bearer {key}", "Accept": "application/json"}
    catalog_url = base + "/rest/v1/rag_document_catalog?" + urllib.parse.urlencode({
        "select": "drive_file_id,reference_title",
        "verification_status": "eq.verified",
    })
    catalog = json.load(urllib.request.urlopen(urllib.request.Request(catalog_url, headers=headers), timeout=60))
    result = []
    for entry in catalog:
        file_id = str(entry["drive_file_id"])
        params = urllib.parse.urlencode({
            "select": "id",
            "metadata->>drive_file_id": f"eq.{file_id}",
            "metadata->>reference_key": f"eq.{file_id}",
            "limit": "1",
        })
        url = base + "/rest/v1/documents?" + params
        rows = json.load(urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=60))
        if not rows:
            result.append({"drive_file_id": file_id, "reference_title": entry.get("reference_title"), "chunks": 0})
    print(json.dumps({"missing_chunk_documents": result}, ensure_ascii=False))


if __name__ == "__main__":
    main()
