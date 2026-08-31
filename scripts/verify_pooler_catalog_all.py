"""Validação somente leitura da cobertura do catálogo via pooler IPv4."""
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
        cur.execute("SELECT count(*) FROM public.documents")
        total = cur.fetchone()[0]
        cur.execute("SELECT count(*) FROM public.documents WHERE metadata->>'rag_status'='staging'")
        staging = cur.fetchone()[0]
        cur.execute("SELECT count(*) FROM public.documents WHERE metadata->>'drive_file_id' IS NULL")
        missing_drive = cur.fetchone()[0]
        cur.execute("SELECT count(*) FROM public.documents WHERE metadata->>'reference_source'='catalog' AND (metadata->>'reference_verified')::boolean IS TRUE")
        propagated = cur.fetchone()[0]
        cur.execute("""SELECT count(*) FROM public.documents d
            WHERE d.metadata->>'reference_source'='catalog'
              AND (d.metadata->>'reference_verified')::boolean IS TRUE
              AND NOT EXISTS (SELECT 1 FROM public.rag_document_catalog c
                              WHERE c.drive_file_id=d.metadata->>'reference_key'
                                AND c.verification_status='verified')""")
        outside_catalog = cur.fetchone()[0]
        cur.execute("""SELECT count(*) FROM public.rag_document_catalog c
            WHERE c.verification_status='verified'
              AND NOT EXISTS (SELECT 1 FROM public.documents d
                              WHERE d.metadata->>'reference_key'=c.drive_file_id
                                AND d.metadata->>'reference_source'='catalog'
                                AND (d.metadata->>'reference_verified')::boolean IS TRUE)""")
        catalog_without_chunks = cur.fetchone()[0]
        cur.execute("SELECT t.tgenabled FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relname='rag_document_catalog' AND t.tgname='sync_catalog_reference_metadata_to_chunks'")
        trigger = cur.fetchone()[0]
    print({"catalog_verified": catalog, "documents_total": total, "propagated_chunks": propagated,
           "catalog_without_chunks": catalog_without_chunks, "outside_catalog": outside_catalog,
           "staging": staging, "missing_drive_file_id": missing_drive, "trigger": trigger})


if __name__ == "__main__":
    main()
