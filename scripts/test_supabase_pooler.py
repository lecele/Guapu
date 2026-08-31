"""Testa somente leitura do pooler IPv4 do Supabase, sem imprimir segredos."""
from __future__ import annotations

import socket
import sys
from urllib.parse import unquote, urlparse

import psycopg

from post_catalog_batch_rest import env_file


def main() -> None:
    values = env_file(sys.argv[1])
    parsed = urlparse(values["SUPABASE_DB_URL"])
    project = (parsed.hostname or "").split(".")[1]
    password = unquote(parsed.password or "")
    user = unquote(parsed.username or "postgres") + "." + project
    for host in ("aws-0-sa-east-1.pooler.supabase.com", "aws-1-sa-east-1.pooler.supabase.com"):
        try:
            ip = socket.getaddrinfo(host, 6543, socket.AF_INET, socket.SOCK_STREAM)[0][4][0]
            conninfo = psycopg.conninfo.make_conninfo(
                host=host, hostaddr=ip, port=6543, dbname=parsed.path.lstrip("/") or "postgres",
                user=user, password=password, sslmode="require",
            )
            with psycopg.connect(conninfo, connect_timeout=10) as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT 1")
                    print(f"pooler_ok host={host} ip={ip} result={cur.fetchone()[0]}")
                    return
        except Exception as exc:
            print(f"pooler_failed host={host} error={type(exc).__name__}")
    raise SystemExit(1)


if __name__ == "__main__":
    main()
