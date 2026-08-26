"""Planeja a reconciliação Drive → RAG e publica trabalhos para o worker da VPS."""

from __future__ import annotations

import os
import sys

import structlog

from config import get_settings
from db.supabase_client import get_supabase_client
from rag.ingestion import _load_drive_manifest
from rag.sync_plan import plan_drive_sync
from rag.sync_queue import enqueue_jobs, jobs_from_sync_plan
from services.drive_service import list_pdf_files

logger = structlog.get_logger("queue_drive_sync")


def main() -> None:
    settings = get_settings()
    if not settings.drive_folder_id:
        raise ValueError("DRIVE_FOLDER_ID não configurado")

    files = list_pdf_files(settings.drive_folder_id)
    manifest_rows = _load_drive_manifest()
    plan = plan_drive_sync(files, manifest_rows)
    jobs = jobs_from_sync_plan(plan, files)
    enqueue_jobs(get_supabase_client(), jobs)

    logger.info(
        "drive_sync_jobs_enqueued",
        queued=len(jobs),
        new=len(plan.new),
        changed=len(plan.changed),
        removed=len(plan.removed),
        unchanged=len(plan.unchanged),
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        logger.error("drive_sync_queue_failed", error=str(error), exc_info=True)
        sys.exit(1)
