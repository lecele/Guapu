"""Backup e restauração controlados de documentos do RAG.

A remoção usa somente os IDs presentes em um backup previamente verificado.
O comando aborta se qualquer linha do banco tiver mudado desde o backup.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import gzip
import hashlib
import json
import os
from pathlib import Path
import sys
from typing import Any, Iterable

import psycopg
from psycopg.rows import dict_row


FORMAT_VERSION = 1
DELETE_CONFIRMATION = "DELETE_EXACT_BACKUP_ROWS"
RESTORE_CONFIRMATION = "RESTORE_EXACT_BACKUP_ROWS"


def _database_url() -> str:
    value = os.getenv("SUPABASE_DB_URL", "").strip()
    if value:
        return value

    env_path = Path(__file__).resolve().parents[1] / ".env"
    if env_path.is_file():
        for raw_line in env_path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if line.startswith("SUPABASE_DB_URL="):
                return line.split("=", 1)[1].strip()
    raise SystemExit("SUPABASE_DB_URL não está configurada.")


def _canonical_row(row: dict[str, Any]) -> bytes:
    return json.dumps(
        row,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")


def _rows_digest(rows: Iterable[dict[str, Any]]) -> str:
    digest = hashlib.sha256()
    for row in sorted(rows, key=lambda item: item["id"]):
        digest.update(_canonical_row(row))
        digest.update(b"\n")
    return digest.hexdigest()


def _normalize_db_row(row: dict[str, Any]) -> dict[str, Any]:
    created_at = row.get("created_at")
    if isinstance(created_at, datetime):
        created_at = created_at.isoformat()
    return {
        "id": str(row["id"]),
        "content": row["content"],
        "embedding": row["embedding"],
        "source": row.get("source"),
        "metadata": row.get("metadata") or {},
        "created_at": created_at,
    }


def _load_db_rows(
    connection: psycopg.Connection,
    sources: list[str] | None,
    *,
    legacy_only: bool,
) -> list[dict[str, Any]]:
    condition = "AND NOT (metadata ? 'drive_file_id')" if legacy_only else ""
    source_condition = "AND source = ANY(%s)" if sources is not None else ""
    parameters = (sources,) if sources is not None else ()
    with connection.cursor(row_factory=dict_row) as cursor:
        cursor.execute(
            f"""
            SELECT id::text AS id,
                   content,
                   embedding::text AS embedding,
                   source,
                   metadata,
                   created_at
            FROM public.documents
            WHERE TRUE
              {source_condition}
              {condition}
            ORDER BY id
            """,
            parameters,
        )
        return [_normalize_db_row(dict(row)) for row in cursor.fetchall()]


def write_backup(
    path: Path,
    rows: list[dict[str, Any]],
    *,
    sources: list[str],
    legacy_only: bool,
    all_legacy: bool = False,
) -> dict[str, Any]:
    if path.exists():
        raise FileExistsError(f"O backup já existe: {path}")
    path.parent.mkdir(parents=True, exist_ok=True)

    ordered_rows = sorted(rows, key=lambda item: item["id"])
    header = {
        "type": "header",
        "format_version": FORMAT_VERSION,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "table": "public.documents",
        "sources": sorted(sources),
        "legacy_only": legacy_only,
        "all_legacy": all_legacy,
    }
    footer = {
        "type": "footer",
        "row_count": len(ordered_rows),
        "rows_sha256": _rows_digest(ordered_rows),
    }

    temporary = path.with_name(path.name + ".tmp")
    try:
        with gzip.open(temporary, "wt", encoding="utf-8", newline="\n") as stream:
            stream.write(json.dumps(header, ensure_ascii=False, sort_keys=True) + "\n")
            for row in ordered_rows:
                stream.write(
                    json.dumps(
                        {"type": "row", **row},
                        ensure_ascii=False,
                        sort_keys=True,
                    )
                    + "\n"
                )
            stream.write(json.dumps(footer, ensure_ascii=False, sort_keys=True) + "\n")
        os.replace(temporary, path)
    finally:
        if temporary.exists():
            temporary.unlink()
    return {**header, **footer}


def read_backup(path: Path) -> tuple[dict[str, Any], list[dict[str, Any]], dict[str, Any]]:
    with gzip.open(path, "rt", encoding="utf-8") as stream:
        records = [json.loads(line) for line in stream if line.strip()]
    if len(records) < 2 or records[0].get("type") != "header" or records[-1].get("type") != "footer":
        raise ValueError("Estrutura do backup inválida.")

    header = records[0]
    footer = records[-1]
    rows = []
    for record in records[1:-1]:
        if record.pop("type", None) != "row":
            raise ValueError("Registro inesperado no backup.")
        rows.append(record)

    if header.get("format_version") != FORMAT_VERSION:
        raise ValueError("Versão de backup não suportada.")
    if footer.get("row_count") != len(rows):
        raise ValueError("Contagem do backup não confere.")
    if footer.get("rows_sha256") != _rows_digest(rows):
        raise ValueError("Checksum do conteúdo do backup não confere.")
    if len({row["id"] for row in rows}) != len(rows):
        raise ValueError("O backup contém IDs duplicados.")
    return header, rows, footer


def command_backup(arguments: argparse.Namespace) -> None:
    requested_sources = None if arguments.all_legacy else sorted(set(arguments.source or []))
    with psycopg.connect(_database_url()) as connection:
        rows = _load_db_rows(
            connection,
            requested_sources,
            legacy_only=arguments.legacy_only or arguments.all_legacy,
        )
    if not rows:
        raise SystemExit("Nenhuma linha encontrada; backup não criado.")
    sources = sorted({str(row["source"]) for row in rows if row.get("source") is not None})
    summary = write_backup(
        arguments.output.resolve(),
        rows,
        sources=sources,
        legacy_only=arguments.legacy_only or arguments.all_legacy,
        all_legacy=arguments.all_legacy,
    )
    print(f"backup_path={arguments.output.resolve()}")
    print(f"row_count={summary['row_count']}")
    print(f"rows_sha256={summary['rows_sha256']}")


def command_verify(arguments: argparse.Namespace) -> None:
    header, rows, footer = read_backup(arguments.input.resolve())
    print(f"backup_valid=true")
    print(f"sources={len(header['sources'])}")
    print(f"row_count={len(rows)}")
    print(f"rows_sha256={footer['rows_sha256']}")


def command_delete(arguments: argparse.Namespace) -> None:
    if arguments.confirm != DELETE_CONFIRMATION:
        raise SystemExit(f"Confirmação inválida. Use --confirm {DELETE_CONFIRMATION}")

    path = arguments.input.resolve()
    header, backup_rows, footer = read_backup(path)
    expected_count = int(footer["row_count"])
    if arguments.expected_count != expected_count:
        raise SystemExit(
            f"Contagem informada ({arguments.expected_count}) difere do backup ({expected_count})."
        )

    sources = None if header.get("all_legacy") else list(header["sources"])
    legacy_only = bool(header.get("legacy_only"))
    ids = [row["id"] for row in backup_rows]
    with psycopg.connect(_database_url()) as connection:
        current_rows = _load_db_rows(connection, sources, legacy_only=legacy_only)
        current_by_id = {row["id"]: row for row in current_rows}
        selected_rows = [current_by_id[row_id] for row_id in ids if row_id in current_by_id]
        if len(selected_rows) != expected_count:
            raise SystemExit(
                f"O banco tem {len(selected_rows)} dos {expected_count} IDs do backup; exclusão cancelada."
            )
        if _rows_digest(selected_rows) != footer["rows_sha256"]:
            raise SystemExit("Os dados mudaram desde o backup; exclusão cancelada.")

        with connection.cursor() as cursor:
            cursor.execute(
                "DELETE FROM public.documents WHERE id = ANY(%s::uuid[])",
                (ids,),
            )
            if cursor.rowcount != expected_count:
                raise RuntimeError(
                    f"Foram excluídas {cursor.rowcount} linhas, esperadas {expected_count}; transação cancelada."
                )
    print("delete_committed=true")
    print(f"deleted_rows={expected_count}")
    print(f"backup_path={path}")


def command_restore(arguments: argparse.Namespace) -> None:
    if arguments.confirm != RESTORE_CONFIRMATION:
        raise SystemExit(f"Confirmação inválida. Use --confirm {RESTORE_CONFIRMATION}")

    path = arguments.input.resolve()
    _, rows, footer = read_backup(path)
    ids = [row["id"] for row in rows]
    with psycopg.connect(_database_url()) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT id::text FROM public.documents WHERE id = ANY(%s::uuid[])",
                (ids,),
            )
            existing = cursor.fetchall()
            if existing:
                raise SystemExit(
                    f"{len(existing)} IDs já existem; restauração cancelada para evitar sobrescrita."
                )
            cursor.executemany(
                """
                INSERT INTO public.documents
                    (id, content, embedding, source, metadata, created_at)
                VALUES
                    (%s::uuid, %s, %s::vector, %s, %s::jsonb, %s::timestamptz)
                """,
                [
                    (
                        row["id"],
                        row["content"],
                        row["embedding"],
                        row.get("source"),
                        json.dumps(row.get("metadata") or {}, ensure_ascii=False),
                        row.get("created_at"),
                    )
                    for row in rows
                ],
            )
    print("restore_committed=true")
    print(f"restored_rows={footer['row_count']}")
    print(f"backup_path={path}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)

    backup = commands.add_parser("backup")
    selection = backup.add_mutually_exclusive_group(required=True)
    selection.add_argument("--source", action="append")
    selection.add_argument("--all-legacy", action="store_true")
    backup.add_argument("--output", type=Path, required=True)
    backup.add_argument("--legacy-only", action="store_true")
    backup.set_defaults(handler=command_backup)

    verify = commands.add_parser("verify")
    verify.add_argument("--input", type=Path, required=True)
    verify.set_defaults(handler=command_verify)

    delete = commands.add_parser("delete")
    delete.add_argument("--input", type=Path, required=True)
    delete.add_argument("--expected-count", type=int, required=True)
    delete.add_argument("--confirm", required=True)
    delete.set_defaults(handler=command_delete)

    restore = commands.add_parser("restore")
    restore.add_argument("--input", type=Path, required=True)
    restore.add_argument("--confirm", required=True)
    restore.set_defaults(handler=command_restore)
    return parser


def main() -> None:
    arguments = build_parser().parse_args()
    arguments.handler(arguments)


if __name__ == "__main__":
    try:
        main()
    except (FileExistsError, ValueError, psycopg.Error) as error:
        print(f"error={error}", file=sys.stderr)
        raise SystemExit(1) from error
