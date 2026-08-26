"""Fila persistente de sincronização do Google Drive para o worker da VPS."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from rag.sync_plan import DriveSyncPlan


@dataclass(frozen=True)
class DriveSyncJob:
    drive_file_id: str
    action: str
    file_info: dict[str, Any]


def jobs_from_sync_plan(plan: DriveSyncPlan, current_files: list[dict[str, Any]]) -> list[DriveSyncJob]:
    """Converte um plano de reconciliação em trabalhos idempotentes por arquivo."""
    name_counts: dict[str, int] = {}
    for file_info in current_files:
        name = str(file_info["name"])
        name_counts[name] = name_counts.get(name, 0) + 1

    jobs: list[DriveSyncJob] = []
    for action, items in (("changed", plan.changed), ("new", plan.new)):
        for file_info in items:
            payload = dict(file_info)
            payload["cleanup_legacy_source"] = name_counts.get(str(file_info["name"]), 0) == 1
            jobs.append(DriveSyncJob(str(file_info["id"]), action, payload))

    for manifest_entry in plan.removed:
        payload = {
            "id": manifest_entry["drive_file_id"],
            "name": manifest_entry["name"],
            "drive_path": manifest_entry.get("drive_path", manifest_entry["name"]),
            "mimeType": manifest_entry.get("mime_type", "application/octet-stream"),
        }
        jobs.append(DriveSyncJob(str(manifest_entry["drive_file_id"]), "removed", payload))

    return jobs


def enqueue_jobs(client: Any, jobs: list[DriveSyncJob]) -> None:
    for job in jobs:
        response = client.rpc(
            "enqueue_drive_sync_job",
            {
                "p_drive_file_id": job.drive_file_id,
                "p_action": job.action,
                "p_file_info": job.file_info,
            },
        ).execute()
        if getattr(response, "error", None):
            raise RuntimeError(f"DRIVE_SYNC_QUEUE_ENQUEUE_FAILED: {response.error}")


def claim_next_job(client: Any, worker_id: str, lease_seconds: int = 1800) -> dict[str, Any] | None:
    response = client.rpc(
        "claim_drive_sync_job",
        {"p_worker_id": worker_id, "p_lease_seconds": lease_seconds},
    ).execute()
    if getattr(response, "error", None):
        raise RuntimeError(f"DRIVE_SYNC_QUEUE_CLAIM_FAILED: {response.error}")
    rows = response.data or []
    return rows[0] if rows else None


def mark_job_complete(client: Any, job_id: str) -> None:
    now = datetime.now(timezone.utc).isoformat()
    response = client.table("drive_sync_jobs").update(
        {
            "status": "succeeded",
            "completed_at": now,
            "lease_expires_at": None,
            "updated_at": now,
        }
    ).eq("id", job_id).execute()
    if getattr(response, "error", None):
        raise RuntimeError(f"DRIVE_SYNC_QUEUE_COMPLETE_FAILED: {response.error}")


def mark_job_failed(client: Any, job: dict[str, Any], error: Exception) -> None:
    attempts = int(job.get("attempts", 0))
    max_attempts = int(job.get("max_attempts", 3))
    now = datetime.now(timezone.utc).isoformat()
    response = client.table("drive_sync_jobs").update(
        {
            "status": "failed" if attempts >= max_attempts else "queued",
            "last_error": str(error)[:4000],
            "lease_expires_at": None,
            "updated_at": now,
        }
    ).eq("id", job["id"]).execute()
    if getattr(response, "error", None):
        raise RuntimeError(f"DRIVE_SYNC_QUEUE_FAIL_FAILED: {response.error}")
