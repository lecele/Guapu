"""Propaga uma obra catalogada em lotes, preservando conteúdo e embeddings.

Uso operacional controlado: uma única obra, backup de metadados, transação única,
trigger temporariamente desabilitado apenas para evitar a atualização monolítica;
o mesmo enriquecimento do trigger é aplicado em lotes e o trigger é reativado
antes do commit.
"""
from __future__ import annotations

import json
import os
import socket
import sys
from pathlib import Path
from urllib.parse import unquote, urlparse

import psycopg

from post_catalog_batch_rest import env_file


CATALOG_KEYS = [
  "reference_title", "reference_author", "reference_year", "reference_edition",
    "reference_publisher", "reference_source", "reference_verified", "reference_key",
    "reference_confidence",
]


def main() -> None:
    env_path, catalog_path, file_id, backup_path = sys.argv[1:]
    values = env_file(env_path)
    catalog = json.load(open(catalog_path, encoding="utf-8"))
    entry = catalog[file_id]
    if entry.get("reference_verified") is not True:
        raise SystemExit("ABORTADO: entrada não verificada")
    db_url = values["SUPABASE_DB_URL"]
    metadata = {k: entry[k] for k in CATALOG_KEYS if k in entry and entry[k] is not None}
    metadata.update({"reference_source": "catalog", "reference_verified": True, "reference_key": file_id})

    parsed = urlparse(db_url)
    try:
        ipv4 = socket.getaddrinfo(parsed.hostname, parsed.port or 5432, socket.AF_INET, socket.SOCK_STREAM)[0][4][0]
        conninfo = psycopg.conninfo.make_conninfo(db_url, hostaddr=ipv4)
    except OSError:
        project = (parsed.hostname or "").split(".")[1]
        pooler_host = "aws-1-sa-east-1.pooler.supabase.com"
        pooler_ip = socket.getaddrinfo(pooler_host, 6543, socket.AF_INET, socket.SOCK_STREAM)[0][4][0]
        conninfo = psycopg.conninfo.make_conninfo(
            host=pooler_host, hostaddr=pooler_ip, port=6543,
            dbname=parsed.path.lstrip("/") or "postgres",
            user=unquote(parsed.username or "postgres") + "." + project,
            password=unquote(parsed.password or ""), sslmode="require",
        )
    with psycopg.connect(conninfo, connect_timeout=15) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id, metadata FROM public.documents WHERE metadata->>'drive_file_id' = %s ORDER BY id", (file_id,))
            rows = cur.fetchall()
            if not rows:
                raise SystemExit("ABORTADO: nenhum chunk encontrado")
            Path(backup_path).write_text(
                json.dumps([{"id": str(row[0]), "metadata": row[1]} for row in rows], ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
            print(f"preflight_chunks={len(rows)} backup={backup_path}")
            cur.execute("SET LOCAL lock_timeout = '5s'")
            cur.execute("SET LOCAL statement_timeout = '30s'")
            cur.execute("ALTER TABLE public.rag_document_catalog DISABLE TRIGGER sync_catalog_reference_metadata_to_chunks")
            cur.execute(
                """INSERT INTO public.rag_document_catalog
                (drive_file_id, reference_title, reference_author, reference_year,
                 reference_edition, reference_publisher, verification_status, verified_from, notes)
                VALUES (%s,%s,%s,%s,%s,%s,'verified','original_drive_pdf',%s)
                ON CONFLICT (drive_file_id) DO UPDATE SET
                  reference_title=EXCLUDED.reference_title,
                  reference_author=EXCLUDED.reference_author,
                  reference_year=EXCLUDED.reference_year,
                  reference_edition=EXCLUDED.reference_edition,
                  reference_publisher=EXCLUDED.reference_publisher,
                  verification_status='verified', verified_from=EXCLUDED.verified_from,
                  notes=EXCLUDED.notes, updated_at=now()""",
                (file_id, entry.get("reference_title"), entry.get("reference_author"), entry.get("reference_year"),
                 entry.get("reference_edition"), entry.get("reference_publisher"),
                 "Confirmado no PDF original do Drive; propagacao SQL em lotes 20260830."),
            )
            for start in range(0, len(rows), 100):
                ids = [row[0] for row in rows[start:start + 100]]
                cur.execute(
                    """UPDATE public.documents
                    SET metadata = (COALESCE(metadata, '{}'::jsonb) - %s::text[]) || %s::jsonb
                    WHERE id = ANY(%s)""",
                    (CATALOG_KEYS, json.dumps(metadata, ensure_ascii=False), ids),
                )
                print(f"batch={start // 100 + 1} updated={cur.rowcount}")
            cur.execute("ALTER TABLE public.rag_document_catalog ENABLE TRIGGER sync_catalog_reference_metadata_to_chunks")
            cur.execute(
                """SELECT count(*) FROM public.documents
                WHERE metadata->>'drive_file_id'=%s
                  AND metadata->>'reference_key'=%s
                  AND metadata->>'reference_source'='catalog'
                  AND (metadata->>'reference_verified')::boolean IS TRUE""",
                (file_id, file_id),
            )
            propagated = cur.fetchone()[0]
            if propagated != len(rows):
                raise SystemExit(f"ABORTADO: validação na transação {propagated}/{len(rows)}")
        conn.commit()
    print(f"committed file_id={file_id} chunks={propagated}")


if __name__ == "__main__":
    main()
