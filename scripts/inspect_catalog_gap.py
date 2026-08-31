"""Inspeciona IDs do catálogo cuja propagação não apareceu na agregação."""

from __future__ import annotations

import json
import urllib.parse
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
IDS = [
    "1B6zSzhdLAkuIo6tAsxUEjnvdu5sparL5",
    "1FCdYFq79-qL4t0wgmmrOmaOnU_p9vDwv",
    "1_8WY52g7BmnDCgiOeCVR5Adm3rhaTlTz",
    "1asX74LMu-mPVLx0kJ9HqoX_R2LgPIctF",
    "1cvepErJkxwdGQqpbFa9XsKNEXupDtVpM",
    "1daAAVEUbXVkW77c7qhpW1jJx0MuWsMNj",
    "1fK0AF3jec4OrQtIAROJPKMrdU8VWv89",
]


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
    result = []
    for file_id in IDS:
        query = urllib.parse.urlencode({
            "select": "metadata",
            "metadata->>drive_file_id": f"eq.{file_id}",
            "limit": "5",
        })
        rows = json.load(urllib.request.urlopen(urllib.request.Request(base + "/rest/v1/documents?" + query, headers=headers), timeout=60))
        result.append({
            "drive_file_id": file_id,
            "chunks": len(rows),
            "reference_fields": [
                {k: (row.get("metadata") or {}).get(k) for k in ("reference_source", "reference_verified", "reference_key", "reference_title")}
                for row in rows[:2]
            ],
        })
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
