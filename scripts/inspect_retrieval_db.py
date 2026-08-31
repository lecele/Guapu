"""Inspeção somente leitura da função e dos índices do retrieval."""
from __future__ import annotations
import os
import socket
from urllib.parse import unquote, urlparse
import psycopg
from post_catalog_batch_rest import env_file

def main() -> None:
    values = env_file('/etc/guapu/worker.env')
    parsed = urlparse(values['SUPABASE_DB_URL'])
    project = (parsed.hostname or '').split('.')[1]
    pooler = 'aws-1-sa-east-1.pooler.supabase.com'
    ip = socket.getaddrinfo(pooler, 6543, socket.AF_INET, socket.SOCK_STREAM)[0][4][0]
    conninfo = psycopg.conninfo.make_conninfo(
        host=pooler, hostaddr=ip, port=6543,
        dbname=parsed.path.lstrip('/') or 'postgres',
        user=unquote(parsed.username or 'postgres') + '.' + project,
        password=unquote(parsed.password or ''), sslmode='require',
    )
    with psycopg.connect(conninfo, connect_timeout=15) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='match_documents' ORDER BY p.oid DESC LIMIT 1")
            print('FUNCTION_START')
            print(cur.fetchone()[0])
            print('INDEXES')
            cur.execute("SELECT indexname, indexdef FROM pg_indexes WHERE schemaname='public' AND tablename='documents' AND indexname ILIKE '%embedding%'")
            for row in cur.fetchall(): print(row[0], row[1])
            print('STATS')
            cur.execute("SELECT relname, pg_size_pretty(pg_relation_size(indexrelid)), idx_scan FROM pg_stat_user_indexes WHERE schemaname='public' AND relname='documents' ORDER BY indexrelname")
            for row in cur.fetchall(): print(row)

if __name__ == '__main__': main()
