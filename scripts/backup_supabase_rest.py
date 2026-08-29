"""Exporta o corpus do RAG pelo PostgREST, sem alterar o Supabase.

O arquivo gerado é um NDJSON gzipado com cabeçalho, todas as linhas de
``public.documents`` e rodapé com contagem e SHA-256. A finalidade é criar
uma cópia verificável quando a VPS não possui rota PostgreSQL/``pg_dump``.
Este utilitário não implementa restauração automática nem sobrescreve linhas.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import gzip
import hashlib
import json
from pathlib import Path
import os
import sys
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


FORMAT_VERSION = 1
SELECT = "id,content,embedding,source,metadata,created_at"


def load_env(path: Path) -> tuple[str, str]:
    values: dict[str, str] = {}
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    url = values.get("SUPABASE_URL", "").rstrip("/")
    key = values.get("SUPABASE_SERVICE_ROLE_KEY") or values.get("SUPABASE_KEY", "")
    if not url or not key:
        raise SystemExit("SUPABASE_URL e uma chave Supabase são necessárias no env-file.")
    return url, key


def canonical(row: dict[str, Any]) -> bytes:
    return json.dumps(row, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def fetch_page(
    url: str,
    key: str,
    page_size: int,
    cursor: str | None,
) -> tuple[list[dict[str, Any]], int | None]:
    params = {"select": SELECT, "order": "id"}
    if cursor:
        # Paginação por cursor evita o custo crescente de OFFSET em tabelas grandes.
        params["id"] = f"gt.{cursor}"
    query = urlencode(params)
    end = page_size - 1
    request = Request(
        f"{url}/rest/v1/documents?{query}",
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Range": f"0-{end}",
            "Prefer": "count=exact",
        },
    )
    try:
        with urlopen(request, timeout=120) as response:
            rows = json.loads(response.read().decode("utf-8"))
            content_range = response.headers.get("Content-Range", "")
    except (HTTPError, URLError, TimeoutError) as error:
        detail = error.read().decode("utf-8", "replace")[:300] if isinstance(error, HTTPError) else str(error)
        position = cursor or "início"
        raise RuntimeError(f"falha REST após o cursor {position}: {detail}") from error
    if not isinstance(rows, list) or any(not isinstance(row, dict) for row in rows):
        position = cursor or "início"
        raise RuntimeError(f"resposta REST inválida após o cursor {position}")
    total: int | None = None
    if "/" in content_range:
        raw_total = content_range.rsplit("/", 1)[1]
        if raw_total.isdigit():
            total = int(raw_total)
    return rows, total


def export(arguments: argparse.Namespace) -> None:
    url, key = load_env(arguments.env_file)
    output = arguments.output.resolve()
    if output.exists():
        raise SystemExit(f"o backup já existe: {output}")
    output.parent.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha256()
    count = 0
    expected_total: int | None = None
    seen: set[str] = set()
    temporary = output.with_name(output.name + ".tmp")
    header = {
        "type": "header",
        "format": "supabase_rest_documents",
        "format_version": FORMAT_VERSION,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "table": "public.documents",
        "select": SELECT,
    }
    try:
        with gzip.open(temporary, "wt", encoding="utf-8", newline="\n") as stream:
            stream.write(json.dumps(header, ensure_ascii=False, sort_keys=True) + "\n")
            cursor: str | None = None
            while True:
                rows, total = fetch_page(url, key, arguments.page_size, cursor)
                if expected_total is None and total is not None:
                    expected_total = total
                if not rows:
                    break
                for row in rows:
                    row_id = str(row.get("id", ""))
                    if not row_id or row_id in seen:
                        raise RuntimeError(f"ID ausente ou duplicado no backup: {row_id or '<vazio>'}")
                    seen.add(row_id)
                    payload = {"type": "row", **row}
                    stream.write(json.dumps(payload, ensure_ascii=False, sort_keys=True) + "\n")
                    digest.update(canonical(row))
                    digest.update(b"\n")
                    count += 1
                cursor = str(rows[-1]["id"])
                print(f"exported_rows={count}", flush=True)
                if expected_total is not None and count >= expected_total:
                    break
                if len(rows) < arguments.page_size:
                    break
            if expected_total is not None and count != expected_total:
                raise RuntimeError(f"contagem REST diverge: exportadas={count}, esperadas={expected_total}")
            footer = {
                "type": "footer",
                "row_count": count,
                "rows_sha256": digest.hexdigest(),
                "expected_total": expected_total,
            }
            stream.write(json.dumps(footer, ensure_ascii=False, sort_keys=True) + "\n")
        os.replace(temporary, output)
    finally:
        if temporary.exists():
            temporary.unlink()
    print(f"backup_path={output}")
    print(f"row_count={count}")
    print(f"rows_sha256={digest.hexdigest()}")


def verify(arguments: argparse.Namespace) -> None:
    digest = hashlib.sha256()
    count = 0
    header: dict[str, Any] | None = None
    footer: dict[str, Any] | None = None
    with gzip.open(arguments.input.resolve(), "rt", encoding="utf-8") as stream:
        for raw_line in stream:
            record = json.loads(raw_line)
            if header is None:
                header = record
                continue
            if record.get("type") == "footer":
                footer = record
                continue
            row = {key: value for key, value in record.items() if key != "type"}
            digest.update(canonical(row))
            digest.update(b"\n")
            count += 1
    if not header or header.get("format") != "supabase_rest_documents" or not footer:
        raise RuntimeError("backup sem cabeçalho/rodapé válidos")
    if count != footer.get("row_count") or digest.hexdigest() != footer.get("rows_sha256"):
        raise RuntimeError("contagem ou checksum do backup não confere")
    print("backup_valid=true")
    print(f"row_count={count}")
    print(f"rows_sha256={digest.hexdigest()}")
    print(f"size_bytes={arguments.input.resolve().stat().st_size}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--input", type=Path)
    parser.add_argument("--page-size", type=int, default=500)
    parser.add_argument("command", nargs="?", choices=("export", "verify"), default="export")
    arguments = parser.parse_args()
    if arguments.command == "verify":
        if not arguments.input:
            raise SystemExit("verify exige --input")
        verify(arguments)
        return
    if not 1 <= arguments.page_size <= 1000:
        raise SystemExit("--page-size deve estar entre 1 e 1000")
    export(arguments)


if __name__ == "__main__":
    try:
        main()
    except (OSError, json.JSONDecodeError, RuntimeError) as error:
        print(f"error={error}", file=sys.stderr)
        raise SystemExit(1) from error
