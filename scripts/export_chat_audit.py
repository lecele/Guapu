"""Exporta conversas para auditoria sem gravar identificadores reais no repositório.

Uso:
  python scripts/export_chat_audit.py --from 2026-08-24T18:00:00+00:00 \
    --to 2026-08-25T23:59:59+00:00 --output scratch/qa/chat_audit.json
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

import psycopg


def anonymize(session_id: str) -> str:
    digest = hashlib.sha256(session_id.encode("utf-8")).hexdigest()[:12]
    return f"session-{digest}"


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Exporta conversas para a matriz de regressão.")
    parser.add_argument("--from", dest="from_date", required=True, help="Data ISO-8601 inicial (inclusive).")
    parser.add_argument("--to", dest="to_date", required=True, help="Data ISO-8601 final (inclusiva).")
    parser.add_argument("--output", type=Path, required=True, help="Arquivo JSON de saída, preferencialmente dentro de scratch/.")
    return parser.parse_args()


def main() -> None:
    arguments = parse_arguments()
    database_url = os.environ.get("SUPABASE_DB_URL")
    if not database_url:
        raise SystemExit("Defina SUPABASE_DB_URL antes de executar este utilitário.")

    start = datetime.fromisoformat(arguments.from_date.replace("Z", "+00:00"))
    end = datetime.fromisoformat(arguments.to_date.replace("Z", "+00:00"))
    if start > end:
        raise SystemExit("--from deve ser anterior a --to.")

    with psycopg.connect(database_url) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT id::text, session_id, role, content, created_at, metadata
                FROM public.chat_messages
                WHERE created_at >= %s AND created_at <= %s
                ORDER BY session_id, created_at, id
                """,
                (start, end),
            )
            rows = cursor.fetchall()

    sessions: dict[str, list[dict[str, object]]] = defaultdict(list)
    error_counts: Counter[str] = Counter()
    telemetry_turns = 0
    for message_id, session_id, role, content, created_at, metadata in rows:
        metadata = metadata or {}
        if role == "assistant" and isinstance(metadata, dict) and "latency_ms" in metadata:
            telemetry_turns += 1
            error_code = metadata.get("error_code")
            if error_code:
                error_counts[str(error_code)] += 1
        sessions[anonymize(str(session_id))].append(
            {
                "message_id": message_id,
                "role": role,
                "content": content,
                "created_at": created_at.isoformat() if created_at else None,
                "telemetry": {
                    "has_context": metadata.get("has_context") if isinstance(metadata, dict) else None,
                    "sources_found": metadata.get("sources_found") if isinstance(metadata, dict) else None,
                    "error_code": metadata.get("error_code") if isinstance(metadata, dict) else None,
                    "latency_ms": metadata.get("latency_ms") if isinstance(metadata, dict) else None,
                },
            }
        )

    payload = {
        "window": {"from": start.isoformat(), "to": end.isoformat()},
        "summary": {
            "sessions": len(sessions),
            "messages": len(rows),
            "instrumented_assistant_turns": telemetry_turns,
            "error_codes": dict(error_counts),
        },
        "sessions": [{"case_candidate": key, "messages": value} for key, value in sessions.items()],
    }
    arguments.output.parent.mkdir(parents=True, exist_ok=True)
    arguments.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"audit_export={arguments.output}")
    print(f"sessions={len(sessions)} messages={len(rows)} telemetry_turns={telemetry_turns}")


if __name__ == "__main__":
    main()
