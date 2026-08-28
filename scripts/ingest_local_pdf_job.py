"""Ingere um PDF local reparado e conclui seu job de sincronização."""

from __future__ import annotations

import argparse
import os
from datetime import datetime, timezone
from pathlib import Path

from supabase import create_client

from rag.ingestion import ingest_pdf_from_bytes, save_drive_manifest_result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pdf", type=Path)
    parser.add_argument("--file-id", required=True)
    parser.add_argument("--file-name", required=True)
    parser.add_argument("--drive-path", required=True)
    parser.add_argument("--modified-time", default="")
    parser.add_argument("--job-id", required=True)
    args = parser.parse_args()

    client = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    rows = client.table("drive_sync_jobs").select("status").eq("id", args.job_id).limit(1).execute().data
    if rows and rows[0].get("status") == "succeeded":
        print(f"local_pdf_ingestion_skipped=1 reason=job_already_succeeded job={args.job_id}")
        return

    result = ingest_pdf_from_bytes(
        pdf_bytes=args.pdf.read_bytes(),
        file_name=args.file_name,
        file_id=args.file_id,
        modified_time=args.modified_time,
        drive_path=args.drive_path,
    )
    if not result.success or result.status != "active" or result.total_chunks <= 0:
        raise RuntimeError("; ".join(result.errors) or "INGESTION_FAILED")

    save_drive_manifest_result(
        {
            "id": args.file_id,
            "name": args.file_name,
            "drive_path": args.drive_path,
            "mimeType": "application/pdf",
            "modifiedTime": args.modified_time or datetime.now(timezone.utc).isoformat(),
        },
        result,
    )
    now = datetime.now(timezone.utc).isoformat()
    client.table("drive_sync_jobs").update(
        {
            "status": "succeeded",
            "completed_at": now,
            "last_error": None,
            "worker_id": None,
            "lease_expires_at": None,
            "updated_at": now,
        }
    ).eq("id", args.job_id).execute()
    print(
        f"local_pdf_ingestion_complete=1 chunks={result.total_chunks} "
        f"inserted={result.chunks_inserted} removed={result.chunks_removed} job={args.job_id}"
    )


if __name__ == "__main__":
    main()
