"""Promove uma carga Drive já completa sem baixar ou re-embutir o arquivo.

Uso deliberadamente explícito: o operador informa o ID e a quantidade esperada
de chunks. Sem ``--apply`` o script apenas valida e mostra o estado.
"""

from __future__ import annotations

import argparse
import os
from datetime import datetime, timezone

from supabase import Client, create_client


def load_rows(client: Client, file_id: str) -> list[dict]:
    rows: list[dict] = []
    page_size = 1000
    last_id: str | None = None
    while True:
        query = (
            client.table("documents")
            .select("id,source,metadata")
            .eq("metadata->>drive_file_id", file_id)
        )
        if last_id is not None:
            query = query.gt("id", last_id)
        response = query.order("id").limit(page_size).execute()
        page = response.data or []
        rows.extend(page)
        if len(page) < page_size:
            return rows
        last_id = str(page[-1]["id"])


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--file-id", required=True)
    parser.add_argument("--expected-chunks", required=True, type=int)
    parser.add_argument("--expected-source", required=True)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    url = os.environ.get("SUPABASE_URL", "").strip()
    key = (
        os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
        or os.environ.get("SUPABASE_KEY", "").strip()
    )
    if not url or not key:
        raise SystemExit("SUPABASE_URL e uma chave Supabase são obrigatórios")

    client = create_client(url, key)
    rows = load_rows(client, args.file_id)
    ids = [str(row["id"]) for row in rows]
    sources = {str(row.get("source") or "") for row in rows}
    statuses = {
        str((row.get("metadata") or {}).get("rag_status") or "active")
        for row in rows
    }

    if len(rows) != args.expected_chunks:
        raise SystemExit(
            f"ABORTADO: chunks encontrados={len(rows)}; esperados={args.expected_chunks}"
        )
    if not ids or len(set(ids)) != len(ids):
        raise SystemExit("ABORTADO: IDs ausentes ou duplicados")
    if sources != {args.expected_source}:
        raise SystemExit(f"ABORTADO: sources inesperados: {sorted(sources)}")
    if not statuses.issubset({"staging", "active"}):
        raise SystemExit(f"ABORTADO: estados inesperados: {sorted(statuses)}")

    print(
        f"validated file_id={args.file_id} chunks={len(rows)} "
        f"statuses={','.join(sorted(statuses))} apply={args.apply}"
    )
    if not args.apply:
        return

    result = client.rpc(
        "finalize_drive_document_sync",
        {"p_drive_file_id": args.file_id, "p_current_ids": ids},
    ).execute()
    result_rows = result.data or []
    if len(result_rows) != 1:
        raise SystemExit("ABORTADO: finalização não retornou resultado único")

    verified = load_rows(client, args.file_id)
    active_count = sum(
        1
        for row in verified
        if (row.get("metadata") or {}).get("rag_status", "active") == "active"
    )
    staging_count = sum(
        1
        for row in verified
        if (row.get("metadata") or {}).get("rag_status") == "staging"
    )
    if len(verified) != args.expected_chunks or active_count != args.expected_chunks or staging_count:
        raise SystemExit(
            "ABORTADO: pós-validação inconsistente "
            f"total={len(verified)} active={active_count} staging={staging_count}"
        )

    now = datetime.now(timezone.utc).isoformat()
    manifest = (
        client.table("drive_sync_manifest")
        .update(
            {
                "chunks_count": args.expected_chunks,
                "status": "active",
                "last_synced_at": now,
                "last_error": None,
                "updated_at": now,
            }
        )
        .eq("drive_file_id", args.file_id)
        .execute()
    )
    if manifest.data is None:
        raise SystemExit("ABORTADO: manifesto não foi atualizado")

    job = (
        client.table("drive_sync_jobs")
        .update(
            {
                "status": "succeeded",
                "worker_id": None,
                "lease_expires_at": None,
                "last_error": None,
                "completed_at": now,
                "updated_at": now,
            }
        )
        .eq("drive_file_id", args.file_id)
        .in_("status", ["running", "failed"])
        .execute()
    )
    if job.data is None:
        raise SystemExit("ABORTADO: job não foi atualizado")

    print(
        f"promoted chunks={active_count} "
        f"activated={result_rows[0].get('activated_count', 0)} "
        f"removed={result_rows[0].get('removed_count', 0)}"
    )


if __name__ == "__main__":
    main()
