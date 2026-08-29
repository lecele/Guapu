"""Cria snapshots verificáveis de tabelas operacionais do Supabase via REST."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import gzip
import hashlib
import json
from pathlib import Path
import os
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from backup_supabase_rest import load_env


ALLOWED_TABLES = {"drive_sync_manifest", "drive_sync_jobs"}


def canonical(row: dict) -> bytes:
    return json.dumps(row, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def fetch(url: str, key: str, table: str) -> tuple[list[dict], int | None]:
    query = urlencode({"select": "*"})
    request = Request(
        f"{url}/rest/v1/{table}?{query}",
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Range": "0-999",
            "Prefer": "count=exact",
        },
    )
    try:
        with urlopen(request, timeout=120) as response:
            rows = json.loads(response.read().decode("utf-8"))
            content_range = response.headers.get("Content-Range", "")
    except (HTTPError, URLError, TimeoutError) as error:
        detail = error.read().decode("utf-8", "replace")[:300] if isinstance(error, HTTPError) else str(error)
        raise RuntimeError(f"falha REST em {table}: {detail}") from error
    if not isinstance(rows, list) or any(not isinstance(row, dict) for row in rows):
        raise RuntimeError(f"resposta REST inválida em {table}")
    total = None
    if "/" in content_range and content_range.rsplit("/", 1)[1].isdigit():
        total = int(content_range.rsplit("/", 1)[1])
    if total is not None and total != len(rows):
        raise RuntimeError(f"{table} excede o limite seguro de 1000 registros: {total}")
    return rows, total


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", type=Path, required=True)
    parser.add_argument("--table", choices=sorted(ALLOWED_TABLES), required=True)
    parser.add_argument("--output", type=Path, required=True)
    arguments = parser.parse_args()
    url, key = load_env(arguments.env_file)
    output = arguments.output.resolve()
    if output.exists():
        raise SystemExit(f"o snapshot já existe: {output}")
    rows, expected_total = fetch(url, key, arguments.table)
    digest = hashlib.sha256()
    for row in sorted(rows, key=lambda item: json.dumps(item, ensure_ascii=False, sort_keys=True)):
        digest.update(canonical(row))
        digest.update(b"\n")
    payload = {
        "format": "supabase_rest_table_snapshot",
        "format_version": 1,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "table": f"public.{arguments.table}",
        "row_count": len(rows),
        "rows_sha256": digest.hexdigest(),
        "rows": rows,
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_name(output.name + ".tmp")
    try:
        with gzip.open(temporary, "wt", encoding="utf-8", newline="\n") as stream:
            json.dump(payload, stream, ensure_ascii=False, sort_keys=True)
        os.replace(temporary, output)
    finally:
        if temporary.exists():
            temporary.unlink()
    print(f"snapshot_path={output}")
    print(f"table={arguments.table}")
    print(f"row_count={len(rows)}")
    print(f"rows_sha256={digest.hexdigest()}")


if __name__ == "__main__":
    try:
        main()
    except (OSError, json.JSONDecodeError, RuntimeError) as error:
        print(f"error={error}", file=sys.stderr)
        raise SystemExit(1) from error
