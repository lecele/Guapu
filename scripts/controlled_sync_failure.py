"""Executa uma única falha de finalização para provar rollback lógico do RAG.

Uso restrito à homologação explícita. O script só processa o primeiro job se o
ID dele coincidir exatamente com ``--drive-file-id`` e exige uma frase de
confirmação fixa. Nenhum erro é injetado no worker normal.
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path
import socket
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import drive_sync_worker
from db.supabase_client import get_supabase_client
from rag import ingestion
from rag.sync_queue import claim_next_job, mark_job_failed


CONFIRMATION = "PHASE1_CONTROLLED_FINALIZE_FAILURE"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--drive-file-id", required=True)
    parser.add_argument("--confirm", required=True)
    arguments = parser.parse_args()
    if arguments.confirm != CONFIRMATION:
        raise SystemExit(f"Confirmação inválida. Use --confirm {CONFIRMATION}")

    client = get_supabase_client()
    worker_id = f"phase1-controlled-failure-{socket.gethostname()}-{os.getpid()}"
    job = claim_next_job(client, worker_id, 600)
    if not job:
        raise SystemExit("Nenhum job disponível para o ensaio.")
    if str(job["drive_file_id"]) != arguments.drive_file_id:
        client.table("drive_sync_jobs").update(
            {
                "status": "queued",
                "worker_id": None,
                "lease_expires_at": None,
                "last_error": "Job devolvido sem processamento: não era o alvo do ensaio controlado.",
            }
        ).eq("id", job["id"]).execute()
        raise SystemExit("O primeiro job não era o alvo; ensaio cancelado sem processá-lo.")

    original_finalize = ingestion._finalize_document_sync

    def controlled_failure(file_id: str, current_ids: set[str]) -> int:
        if file_id != arguments.drive_file_id or not current_ids:
            raise RuntimeError("CONTROLLED_FAILURE_SAFETY_CHECK_FAILED")
        raise RuntimeError("CONTROLLED_FINALIZE_FAILURE_BEFORE_ATOMIC_ACTIVATION")

    ingestion._finalize_document_sync = controlled_failure
    try:
        drive_sync_worker.process_job(job)
    except Exception as error:
        mark_job_failed(client, job, error)
        if "CONTROLLED_FINALIZE_FAILURE" not in str(error):
            raise
        print(f"controlled_failure_confirmed=true")
        print(f"drive_file_id={arguments.drive_file_id}")
        print(f"job_id={job['id']}")
    else:
        raise RuntimeError("O ensaio deveria falhar antes da ativação, mas terminou sem erro.")
    finally:
        ingestion._finalize_document_sync = original_finalize


if __name__ == "__main__":
    main()
