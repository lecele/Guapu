"""Reconciliação agendada do Google Drive com o RAG."""

import os
import sys
import time

try:
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
except Exception:
    pass

import structlog

# Garante que o diretório de trabalho é o do script (para ler o .env local)
script_dir = os.path.dirname(os.path.abspath(__file__))
os.chdir(script_dir)
sys.path.append(script_dir)

from rag.ingestion import ingest_all_from_drive

# Configuração de logs estruturados
structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.stdlib.add_log_level,
        structlog.dev.ConsoleRenderer(),
    ],
)
logger = structlog.get_logger("cron_sync")

def main():
    logger.info("cron_sync_started", message="Iniciando reconciliação com o Google Drive...")
    start_time = time.time()
    
    try:
        results = ingest_all_from_drive()
        elapsed = time.time() - start_time
        
        total_inserted = sum(r.chunks_inserted for r in results)
        total_skipped = sum(r.chunks_skipped for r in results)
        total_removed = sum(r.chunks_removed for r in results)
        successful_files = sum(1 for r in results if r.success)
        failed_files = [result for result in results if not result.success]
        
        logger.info(
            "cron_sync_completed",
            duration_sec=round(elapsed, 2),
            total_files=len(results),
            successful_files=successful_files,
            failed_files=len(failed_files),
            total_chunks_inserted=total_inserted,
            total_chunks_skipped=total_skipped,
            total_chunks_removed=total_removed,
            actions={
                action: sum(1 for result in results if result.action == action)
                for action in sorted({result.action for result in results})
            },
        )
        
        print("\n" + "="*60)
        print("RESUMO DA SINCRONIZAÇÃO")
        print("="*60)
        for r in results:
            print(f"- {r.summary}")
        print("="*60)

        if failed_files:
            logger.error(
                "cron_sync_completed_with_errors",
                failed_file_ids=[result.file_id for result in failed_files],
            )
            sys.exit(1)
        
    except Exception as exc:
        logger.error("cron_sync_failed", error=str(exc), exc_info=True)
        sys.exit(1)

if __name__ == "__main__":
    main()
