"""Worker de ingestão contínua para a VPS.

Executar com ``python drive_sync_worker.py``. O processo assume um trabalho por
vez, renova o status no Supabase e pode ser supervisionado por systemd.
"""

from __future__ import annotations

import argparse
import os
import socket
import sys
import time

import structlog

from db.supabase_client import get_supabase_client
from rag.ingestion import (
    IngestionResult,
    _remove_drive_file,
    ingest_pdf_from_bytes,
    save_drive_manifest_result,
)
from rag.sync_queue import claim_next_job, mark_job_complete, mark_job_failed
from services.drive_service import download_pdf

logger = structlog.get_logger("drive_sync_worker")


def process_job(job: dict) -> IngestionResult | None:
    action = str(job["action"])
    file_info = dict(job["file_info"])
    file_id = str(file_info["id"])

    if action == "removed":
        removed = _remove_drive_file(file_id)
        logger.info("drive_sync_file_removed", file_id=file_id, removed=removed)
        return None

    file_name = str(file_info["name"])
    file_bytes = download_pdf(file_id)
    result = ingest_pdf_from_bytes(
        pdf_bytes=file_bytes,
        file_name=file_name,
        file_id=file_id,
        modified_time=str(file_info.get("modifiedTime", "")),
        drive_path=str(file_info.get("drive_path", file_name)),
        cleanup_legacy_source=bool(file_info.get("cleanup_legacy_source", False)),
    )
    result.action = action
    save_drive_manifest_result(file_info, result)
    if not result.success:
        raise RuntimeError("; ".join(result.errors) or "INGESTION_FAILED")
    return result


def run_worker(*, once: bool, poll_seconds: int, lease_seconds: int) -> None:
    client = get_supabase_client()
    worker_id = os.getenv("DRIVE_SYNC_WORKER_ID") or f"{socket.gethostname()}-{os.getpid()}"
    logger.info("drive_sync_worker_started", worker_id=worker_id, once=once)

    while True:
        job = claim_next_job(client, worker_id, lease_seconds)
        if not job:
            if once:
                return
            time.sleep(poll_seconds)
            continue

        try:
            result = process_job(job)
            mark_job_complete(client, str(job["id"]))
            logger.info(
                "drive_sync_job_completed",
                job_id=job["id"],
                action=job["action"],
                file_id=job["drive_file_id"],
                chunks_inserted=result.chunks_inserted if result else 0,
                chunks_removed=result.chunks_removed if result else 0,
            )
        except Exception as error:
            mark_job_failed(client, job, error)
            logger.exception(
                "drive_sync_job_failed",
                job_id=job["id"],
                action=job["action"],
                file_id=job["drive_file_id"],
                error=str(error),
            )
            if once:
                raise

        if once:
            return


def main() -> None:
    parser = argparse.ArgumentParser(description="Worker de sincronização Drive → RAG")
    parser.add_argument("--once", action="store_true", help="Processa no máximo um trabalho e encerra")
    parser.add_argument("--poll-seconds", type=int, default=15)
    parser.add_argument("--lease-seconds", type=int, default=1800)
    args = parser.parse_args()
    if args.poll_seconds < 1 or args.lease_seconds < 60:
        raise ValueError("poll-seconds deve ser >= 1 e lease-seconds deve ser >= 60")
    run_worker(
        once=args.once,
        poll_seconds=args.poll_seconds,
        lease_seconds=args.lease_seconds,
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        logger.error("drive_sync_worker_stopped", error=str(error), exc_info=True)
        sys.exit(1)
