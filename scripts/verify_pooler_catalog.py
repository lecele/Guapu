"""Validação somente leitura pós-propagação via pooler IPv4."""
from __future__ import annotations

import socket
import sys
from urllib.parse import unquote, urlparse

import psycopg

from post_catalog_batch_rest import env_file


FILE_ID = "1uLOguHlm-IuiJ7nqv-j7m1u7bKPTm3cx"


def main() -> None:
    values = env_file(sys.argv[1])
    parsed = urlparse(values["SUPABASE_DB_URL"])
    project = (parsed.hostname or "").split(".")[1]
    host = "aws-1-sa-east-1.pooler.supabase.com"
    ip = socket.getaddrinfo(host, 6543, socket.AF_INET, socket.SOCK_STREAM)[0][4][0]
    conninfo = psycopg.conninfo.make_conninfo(
        host=host, hostaddr=ip, port=6543, dbname=parsed.path.lstrip("/") or "postgres",
        user=unquote(parsed.username or "postgres") + "." + project,
        password=unquote(parsed.password or ""), sslmode="require",
    )
    with psycopg.connect(conninfo, connect_timeout=15) as conn, conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM public.rag_document_catalog WHERE verification_status='verified'")
        catalog = cur.fetchone()[0]
        cur.execute("""SELECT count(*), count(*) FILTER (WHERE metadata->>'reference_key'=%s AND metadata->>'reference_source'='catalog' AND (metadata->>'reference_verified')::boolean IS TRUE), count(*) FILTER (WHERE metadata->>'reference_key' IS DISTINCT FROM %s) FROM public.documents WHERE metadata->>'drive_file_id'=%s""", (FILE_ID, FILE_ID, FILE_ID))
        chunks, propagated, bad = cur.fetchone()
        cur.execute("SELECT count(*) FROM public.documents WHERE metadata->>'rag_status'='staging'")
        staging = cur.fetchone()[0]
        cur.execute("""SELECT t.tgenabled FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relname='rag_document_catalog' AND t.tgname='sync_catalog_reference_metadata_to_chunks'""")
        trigger = cur.fetchone()[0]
    print({"catalog_verified": catalog, "chunks": chunks, "propagated": propagated, "bad": bad, "staging": staging, "trigger": trigger})


if __name__ == "__main__":
    main()
