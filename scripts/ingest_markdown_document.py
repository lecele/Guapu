"""Ingere um Markdown OCR mantendo o ID e a origem do arquivo no Drive."""

from __future__ import annotations

import argparse
import os
import re
from datetime import datetime, timezone
from pathlib import Path

from supabase import create_client

from rag.ingestion import IngestionResult, _finalize_document_sync, chunk_text, save_drive_manifest_result, upsert_chunk_stream_to_supabase


PAGE_HEADER = re.compile(r"^# Página (\d+)\s*$", re.MULTILINE)


def read_pages(markdown_path: Path) -> tuple[int, list[dict]]:
    content = markdown_path.read_text(encoding="utf-8")
    matches = list(PAGE_HEADER.finditer(content))
    pages = []
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(content)
        text = content[match.end():end].strip()
        pages.append({"page_number": int(match.group(1)), "text": text})
    return len(matches), [page for page in pages if page["text"]]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("markdown", type=Path)
    parser.add_argument("--file-id", required=True)
    parser.add_argument("--file-name", required=True)
    parser.add_argument("--drive-path", required=True)
    parser.add_argument("--modified-time", default="")
    parser.add_argument("--job-id", required=True)
    args = parser.parse_args()

    total_pages, pages = read_pages(args.markdown)
    result = IngestionResult(file_name=args.file_name, file_id=args.file_id)
    result.total_pages = total_pages

    def chunks():
        start_index = 0
        for page in pages:
            page_chunks = chunk_text(
                [page],
                source_name=args.file_name,
                start_index=start_index,
            )
            start_index += len(page_chunks)
            yield from page_chunks

    inserted, current_ids, total_chunks = upsert_chunk_stream_to_supabase(
        chunks(),
        file_id=args.file_id,
        modified_time=args.modified_time,
        drive_path=args.drive_path,
        batch_size=5,
    )
    if not current_ids:
        raise RuntimeError("OCR não produziu chunks para ingestão")

    result.total_chunks = total_chunks
    result.chunks_inserted = inserted
    result.chunks_removed = _finalize_document_sync(args.file_id, current_ids)
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

    client = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
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
        f"markdown_ingestion_complete=1 pages={result.total_pages} "
        f"chunks={result.total_chunks} inserted={result.chunks_inserted} "
        f"removed={result.chunks_removed} job={args.job_id}"
    )


if __name__ == "__main__":
    main()
