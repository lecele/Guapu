#!/usr/bin/env python3
"""Executa um ensaio de restauração do backup do RAG em Postgres temporário."""

from __future__ import annotations

import argparse
import csv
import gzip
import json
import subprocess
import sys
import time
from pathlib import Path


def run(args: list[str], *, capture: bool = True) -> str:
    result = subprocess.run(args, check=True, text=True, capture_output=capture)
    return result.stdout.strip() if capture else ""


def psql(container: str, sql: str) -> str:
    return run(
        [
            "docker",
            "exec",
            container,
            "psql",
            "-U",
            "postgres",
            "-d",
            "postgres",
            "-v",
            "ON_ERROR_STOP=1",
            "-At",
            "-c",
            sql,
        ]
    )


def wait_ready(container: str) -> None:
    for _ in range(60):
        result = subprocess.run(
            ["docker", "exec", container, "pg_isready", "-U", "postgres"],
            text=True,
            capture_output=True,
        )
        if result.returncode == 0:
            return
        time.sleep(2)
    raise RuntimeError("Postgres temporário não ficou pronto")


def iter_rows(path: Path):
    with gzip.open(path, "rt", encoding="utf-8") as stream:
        header = json.loads(next(stream))
        if header.get("format") != "supabase_rest_documents":
            raise RuntimeError("formato de backup inesperado")
        for raw in stream:
            record = json.loads(raw)
            if record.get("type") == "footer":
                break
            if record.get("type") != "row":
                raise RuntimeError("registro de backup inesperado")
            yield record


def parse_embedding(value: object) -> list[float]:
    if isinstance(value, list):
        return [float(item) for item in value]
    if isinstance(value, str) and value.startswith("[") and value.endswith("]"):
        raw_values = value[1:-1].strip()
        return [float(item.strip()) for item in raw_values.split(",")] if raw_values else []
    raise RuntimeError("embedding em formato não reconhecido")


def restore(path: Path, container: str) -> dict[str, str]:
    first = next(iter_rows(path))
    id_type = "BIGINT" if isinstance(first.get("id"), int) else "TEXT"
    run(
        [
            "docker",
            "run",
            "-d",
            "--name",
            container,
            "-e",
            "POSTGRES_PASSWORD=guapu-restore-rehearsal-only",
            "-e",
            "POSTGRES_HOST_AUTH_METHOD=trust",
            "pgvector/pgvector:pg16",
        ],
        capture=True,
    )
    try:
        wait_ready(container)
        psql(container, "CREATE EXTENSION IF NOT EXISTS vector")
        psql(
            container,
            f"CREATE TABLE documents (id {id_type} PRIMARY KEY, content TEXT NOT NULL, embedding vector(768) NOT NULL, source TEXT NOT NULL, metadata JSONB, created_at TIMESTAMPTZ)",
        )
        copy_sql = "COPY documents (id, content, embedding, source, metadata, created_at) FROM STDIN WITH (FORMAT csv, HEADER true)"
        process = subprocess.Popen(
            [
                "docker",
                "exec",
                "-i",
                container,
                "psql",
                "-U",
                "postgres",
                "-d",
                "postgres",
                "-v",
                "ON_ERROR_STOP=1",
                "-c",
                copy_sql,
            ],
            stdin=subprocess.PIPE,
            text=True,
        )
        assert process.stdin is not None
        writer = csv.writer(process.stdin, lineterminator="\n")
        writer.writerow(["id", "content", "embedding", "source", "metadata", "created_at"])
        count = 0
        try:
            for row in iter_rows(path):
                embedding = parse_embedding(row.get("embedding"))
                if len(embedding) != 768:
                    raise RuntimeError(f"embedding inválido no ID {row.get('id')}")
                vector = "[" + ",".join(str(float(value)) for value in embedding) + "]"
                metadata = json.dumps(row.get("metadata"), ensure_ascii=False, separators=(",", ":"))
                writer.writerow(
                    [
                        row.get("id"),
                        row.get("content", ""),
                        vector,
                        row.get("source", ""),
                        metadata,
                        row.get("created_at"),
                    ]
                )
                count += 1
        finally:
            process.stdin.close()
        if process.wait() != 0:
            raise RuntimeError("COPY do backup falhou")
        checks = psql(
            container,
            "SELECT count(*), count(DISTINCT id), count(DISTINCT source), min(vector_dims(embedding)), max(vector_dims(embedding)) FROM documents",
        ).split("|")
        if len(checks) != 5:
            raise RuntimeError("resposta de validação inesperada")
        actual_count, unique_ids, sources, min_dims, max_dims = checks
        result = {
            "rows_read": str(count),
            "rows_in_database": actual_count,
            "unique_ids": unique_ids,
            "distinct_sources": sources,
            "min_embedding_dimensions": min_dims,
            "max_embedding_dimensions": max_dims,
        }
        if count != int(actual_count) or count != int(unique_ids) or min_dims != "768" or max_dims != "768":
            raise RuntimeError(f"validação falhou: {result}")
        return result
    finally:
        subprocess.run(["docker", "rm", "-f", container], check=False, capture_output=True, text=True)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--backup", type=Path, required=True)
    parser.add_argument("--container", default="guapu-restore-rehearsal")
    args = parser.parse_args()
    try:
        print(json.dumps(restore(args.backup, args.container), ensure_ascii=False, sort_keys=True))
        return 0
    except (OSError, RuntimeError, StopIteration, subprocess.CalledProcessError) as error:
        print(f"restore_error={error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
