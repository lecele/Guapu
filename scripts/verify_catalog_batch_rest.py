"""Valida um lote de catálogo e a propagação correspondente, somente leitura."""
from __future__ import annotations

import json
import sys
import urllib.parse
import urllib.request

from post_catalog_batch_rest import env_file


def get(url: str, key: str) -> list[dict]:
    request = urllib.request.Request(url, headers={"apikey": key, "Authorization": "Bearer " + key})
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)


def main() -> None:
    env_path, ids_path = sys.argv[1:]
    values = env_file(env_path)
    key = values["SUPABASE_SERVICE_ROLE_KEY"]
    base = values["SUPABASE_URL"].rstrip("/") + "/rest/v1/"
    ids = [x.strip() for x in open(ids_path, encoding="utf-8") if x.strip()]
    encoded = ",".join(ids)
    all_catalog = get(base + "rag_document_catalog?select=drive_file_id&verification_status=eq.verified&limit=1000", key)
    catalog = get(base + "rag_document_catalog?select=drive_file_id,verification_status&drive_file_id=in.(" + urllib.parse.quote(encoded, safe="") + ")", key)
    chunks = get(base + "documents?select=metadata&metadata->>drive_file_id=in.(" + urllib.parse.quote(encoded, safe="") + ")&limit=1000", key)
    by_id = {x["drive_file_id"]: x for x in catalog}
    propagated = {i: 0 for i in ids}
    bad = []
    for row in chunks:
        metadata = row.get("metadata") or {}
        file_id = metadata.get("drive_file_id")
        if file_id in propagated:
            propagated[file_id] += 1
            if metadata.get("reference_source") != "catalog" or metadata.get("reference_verified") is not True or metadata.get("reference_key") != file_id:
                bad.append(file_id)
    print(json.dumps({"catalog_verified_total": len(all_catalog), "catalog_rows": len(catalog), "verified": sum(by_id.get(i, {}).get("verification_status") == "verified" for i in ids), "chunks": sum(propagated.values()), "propagated_by_id": propagated, "bad_chunks": len(bad)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
