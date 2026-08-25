"""Audita ou aplica migrações SQL sem armazenar credenciais no projeto."""

from __future__ import annotations

import argparse
import os
from pathlib import Path

import psycopg


def database_url() -> str:
    value = os.getenv("SUPABASE_DB_URL")
    if not value:
        raise SystemExit("Defina SUPABASE_DB_URL antes de executar este utilitário.")
    return value


def check_schema() -> None:
    with psycopg.connect(database_url(), autocommit=True) as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT current_user")
            print(f"db_user={cursor.fetchone()[0]}")

            cursor.execute(
                """
                SELECT column_name, data_type, is_nullable
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = 'chat_messages'
                ORDER BY ordinal_position
                """
            )
            for column_name, data_type, is_nullable in cursor.fetchall():
                print(f"chat_messages.{column_name}|{data_type}|nullable={is_nullable}")

            cursor.execute("SELECT to_regclass('public.chat_session_state') IS NOT NULL")
            print(f"state_table_exists={cursor.fetchone()[0]}")

            cursor.execute("SELECT to_regclass('public.drive_sync_manifest') IS NOT NULL")
            print(f"drive_manifest_exists={cursor.fetchone()[0]}")


def apply_migration(path: Path) -> None:
    migration = path.resolve()
    if not migration.is_file() or migration.suffix.lower() != ".sql":
        raise SystemExit(f"Migração SQL inválida: {migration}")

    sql = migration.read_text(encoding="utf-8")
    with psycopg.connect(database_url(), autocommit=True) as connection:
        with connection.cursor() as cursor:
            cursor.execute(sql)
    print(f"migration_applied={migration.name}")


def main() -> None:
    parser = argparse.ArgumentParser()
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--check", action="store_true", help="Exibe apenas o contrato atual do chat.")
    action.add_argument("--apply", type=Path, help="Aplica o arquivo SQL informado.")
    arguments = parser.parse_args()

    if arguments.check:
        check_schema()
    else:
        apply_migration(arguments.apply)


if __name__ == "__main__":
    main()
