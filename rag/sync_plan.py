"""Planejamento puro da reconciliação Google Drive -> RAG."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
import uuid


@dataclass(frozen=True)
class DriveSyncPlan:
    new: tuple[dict, ...]
    changed: tuple[dict, ...]
    unchanged: tuple[dict, ...]
    removed: tuple[dict, ...]


def chunk_record_id(
    file_id: str,
    content_hash: str,
    page_number: int,
    chunk_index: int,
) -> str:
    """Gera uma chave estável que também preserva ocorrências repetidas."""
    identity = f"{file_id}:{page_number}:{chunk_index}:{content_hash}"
    return str(uuid.uuid5(uuid.NAMESPACE_URL, identity))


def _same_version(drive_file: dict, manifest_entry: dict) -> bool:
    """Compara checksum quando disponível e modifiedTime como fallback."""
    if drive_file.get("name") != manifest_entry.get("name"):
        return False
    if (drive_file.get("drive_path") or drive_file.get("name")) != (
        manifest_entry.get("drive_path") or manifest_entry.get("name")
    ):
        return False

    current_checksum = drive_file.get("md5Checksum")
    previous_checksum = manifest_entry.get("md5_checksum")
    if current_checksum and previous_checksum:
        return current_checksum == previous_checksum
    def normalize(value: str | None) -> datetime | str | None:
        if not value:
            return value
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return value

    return normalize(drive_file.get("modifiedTime")) == normalize(manifest_entry.get("modified_time"))


def plan_drive_sync(current_files: list[dict], manifest_rows: list[dict]) -> DriveSyncPlan:
    """Classifica arquivos sem tocar no Drive nem no banco."""
    current_by_id = {item["id"]: item for item in current_files}
    manifest_by_id = {item["drive_file_id"]: item for item in manifest_rows}

    new: list[dict] = []
    changed: list[dict] = []
    unchanged: list[dict] = []

    for file_id, drive_file in current_by_id.items():
        previous = manifest_by_id.get(file_id)
        if previous is None:
            new.append(drive_file)
        elif previous.get("status") != "active" or not _same_version(drive_file, previous):
            changed.append(drive_file)
        else:
            unchanged.append(drive_file)

    removed = [
        entry
        for file_id, entry in manifest_by_id.items()
        if file_id not in current_by_id
    ]

    sort_key = lambda item: (item.get("drive_path") or item.get("name") or "", item.get("id") or item.get("drive_file_id") or "")
    return DriveSyncPlan(
        new=tuple(sorted(new, key=sort_key)),
        changed=tuple(sorted(changed, key=sort_key)),
        unchanged=tuple(sorted(unchanged, key=sort_key)),
        removed=tuple(sorted(removed, key=sort_key)),
    )


def select_file_batch(
    plan: DriveSyncPlan,
    max_files: int,
) -> tuple[tuple[tuple[str, dict], ...], tuple[tuple[str, dict], ...]]:
    """Prioriza correções de arquivos alterados e limita o trabalho por execução."""
    if max_files < 1:
        raise ValueError("max_files deve ser maior que zero")
    pending = tuple(("changed", item) for item in plan.changed) + tuple(
        ("new", item) for item in plan.new
    )
    return pending[:max_files], pending[max_files:]
