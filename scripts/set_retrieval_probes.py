"""Ajuste reversível do parâmetro da função de retrieval; não altera dados."""
from __future__ import annotations
import socket
import sys
from urllib.parse import unquote, urlparse
import psycopg
from post_catalog_batch_rest import env_file

def main() -> None:
    probes = int(sys.argv[1])
    values = env_file('/etc/guapu/worker.env')
    parsed = urlparse(values['SUPABASE_DB_URL'])
    project = (parsed.hostname or '').split('.')[1]
    pooler = 'aws-1-sa-east-1.pooler.supabase.com'
    ip = socket.getaddrinfo(pooler, 6543, socket.AF_INET, socket.SOCK_STREAM)[0][4][0]
    conninfo = psycopg.conninfo.make_conninfo(host=pooler, hostaddr=ip, port=6543, dbname=parsed.path.lstrip('/') or 'postgres', user=unquote(parsed.username or 'postgres') + '.' + project, password=unquote(parsed.password or ''), sslmode='require')
    with psycopg.connect(conninfo, connect_timeout=15) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT proconfig FROM pg_proc WHERE oid='public.match_documents(vector,double precision,integer)'::regprocedure")
            before = cur.fetchone()[0]
            print(f'before={before}')
            if probes < 1 or probes > 256: raise ValueError('probes fora do intervalo')
            cur.execute(f"ALTER FUNCTION public.match_documents(vector,double precision,integer) SET ivfflat.probes = {probes}")
            cur.execute("SELECT proconfig FROM pg_proc WHERE oid='public.match_documents(vector,double precision,integer)'::regprocedure")
            print(f'after={cur.fetchone()[0]}')
        conn.commit()

if __name__ == '__main__': main()
