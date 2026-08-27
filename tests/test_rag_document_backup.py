from __future__ import annotations

import copy
from pathlib import Path

import pytest

from scripts.rag_document_backup import read_backup, write_backup


def sample_rows() -> list[dict]:
    return [
        {
            "id": "00000000-0000-0000-0000-000000000001",
            "content": "conteúdo de teste",
            "embedding": "[0.1,0.2]",
            "source": "plano_antigo.pdf",
            "metadata": {"content_hash": "abc"},
            "created_at": "2026-08-27T12:00:00+00:00",
        },
        {
            "id": "00000000-0000-0000-0000-000000000002",
            "content": "segundo trecho",
            "embedding": "[0.3,0.4]",
            "source": "plano_antigo.pdf",
            "metadata": {"content_hash": "def"},
            "created_at": None,
        },
    ]


def test_backup_round_trip_and_checksum(tmp_path: Path) -> None:
    path = tmp_path / "backup.jsonl.gz"
    rows = sample_rows()
    summary = write_backup(
        path,
        rows,
        sources=["plano_antigo.pdf"],
        legacy_only=True,
    )

    header, restored, footer = read_backup(path)

    assert header["legacy_only"] is True
    assert restored == rows
    assert footer["row_count"] == 2
    assert footer["rows_sha256"] == summary["rows_sha256"]


def test_backup_refuses_to_overwrite(tmp_path: Path) -> None:
    path = tmp_path / "backup.jsonl.gz"
    write_backup(path, sample_rows(), sources=["plano_antigo.pdf"], legacy_only=True)

    with pytest.raises(FileExistsError):
        write_backup(path, sample_rows(), sources=["plano_antigo.pdf"], legacy_only=True)


def test_tampered_backup_is_rejected(tmp_path: Path) -> None:
    path = tmp_path / "backup.jsonl.gz"
    rows = sample_rows()
    write_backup(path, rows, sources=["plano_antigo.pdf"], legacy_only=True)

    import gzip
    import json

    with gzip.open(path, "rt", encoding="utf-8") as stream:
        records = [json.loads(line) for line in stream]
    tampered = copy.deepcopy(records)
    tampered[1]["content"] = "conteúdo adulterado"
    with gzip.open(path, "wt", encoding="utf-8") as stream:
        for record in tampered:
            stream.write(json.dumps(record, ensure_ascii=False) + "\n")

    with pytest.raises(ValueError, match="Checksum"):
        read_backup(path)
