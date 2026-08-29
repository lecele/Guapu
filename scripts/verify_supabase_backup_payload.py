"""Valida a carga de um backup do corpus sem conectar ou alterar banco algum."""

from __future__ import annotations

import argparse
import gzip
import hashlib
import json
from collections import Counter
from pathlib import Path
import sys
from typing import Any


REQUIRED = {"id", "content", "embedding", "source", "metadata", "created_at"}


def canonical(row: dict[str, Any]) -> bytes:
    return json.dumps(row, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def embedding_dimension(value: Any) -> int:
    if isinstance(value, list):
        if not all(isinstance(item, (int, float)) for item in value):
            raise ValueError("embedding contém valor não numérico")
        return len(value)
    if isinstance(value, str) and value.startswith("[") and value.endswith("]"):
        values = value[1:-1].strip()
        if not values:
            return 0
        for item in values.split(","):
            float(item.strip())
        return len(values.split(","))
    raise ValueError("embedding não está em formato vetorial reconhecido")


def verify(path: Path) -> None:
    digest = hashlib.sha256()
    ids: set[str] = set()
    dimensions: Counter[int] = Counter()
    sources: Counter[str] = Counter()
    header: dict[str, Any] | None = None
    footer: dict[str, Any] | None = None
    count = 0
    with gzip.open(path, "rt", encoding="utf-8") as stream:
        for raw_line in stream:
            record = json.loads(raw_line)
            if header is None:
                if record.get("type") != "header":
                    raise ValueError("cabeçalho ausente")
                header = record
                continue
            if record.get("type") == "footer":
                if footer is not None:
                    raise ValueError("mais de um rodapé")
                footer = record
                continue
            if record.get("type") != "row":
                raise ValueError("registro sem tipo row")
            row = {key: value for key, value in record.items() if key != "type"}
            missing = REQUIRED - row.keys()
            if missing:
                raise ValueError(f"campos ausentes: {sorted(missing)}")
            row_id = str(row["id"])
            if not row_id or row_id in ids:
                raise ValueError("ID ausente ou duplicado")
            if not isinstance(row["content"], str) or not isinstance(row["metadata"], dict):
                raise ValueError("conteúdo ou metadados inválidos")
            dimensions[embedding_dimension(row["embedding"])] += 1
            sources[str(row["source"])] += 1
            ids.add(row_id)
            digest.update(canonical(row))
            digest.update(b"\n")
            count += 1
    if not header or header.get("format") != "supabase_rest_documents" or not footer:
        raise ValueError("formato de backup inválido")
    if footer.get("row_count") != count or footer.get("rows_sha256") != digest.hexdigest():
        raise ValueError("contagem ou checksum divergente")
    print("restore_rehearsal_valid=true")
    print(f"row_count={count}")
    print(f"unique_ids={len(ids)}")
    print(f"embedding_dimensions={dict(sorted(dimensions.items()))}")
    print(f"distinct_sources={len(sources)}")
    print(f"rows_sha256={digest.hexdigest()}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    arguments = parser.parse_args()
    verify(arguments.input.resolve())


if __name__ == "__main__":
    try:
        main()
    except (OSError, json.JSONDecodeError, ValueError) as error:
        print(f"error={error}", file=sys.stderr)
        raise SystemExit(1) from error
