"""
cron_sync.py — Sincronização automática diária do RAG com o Google Drive.

Pode ser agendado no Agendador de Tarefas do Windows ou via cron no Linux/VPS.
"""

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
    logger.info("cron_sync_started", message="Iniciando sincronização diária com o Google Drive...")
    start_time = time.time()
    
    try:
        results = ingest_all_from_drive()
        elapsed = time.time() - start_time
        
        total_inserted = sum(r.chunks_inserted for r in results)
        total_skipped = sum(r.chunks_skipped for r in results)
        successful_files = sum(1 for r in results if r.success)
        
        logger.info(
            "cron_sync_completed",
            duration_sec=round(elapsed, 2),
            total_files=len(results),
            successful_files=successful_files,
            total_chunks_inserted=total_inserted,
            total_chunks_skipped=total_skipped
        )
        
        print("\n" + "="*60)
        print("RESUMO DA SINCRONIZAÇÃO")
        print("="*60)
        for r in results:
            print(f"- {r.summary}")
        print("="*60)
        
    except Exception as exc:
        logger.error("cron_sync_failed", error=str(exc), exc_info=True)
        sys.exit(1)

if __name__ == "__main__":
    main()
