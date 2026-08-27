"""Executa os testes reais de recuperação após a sincronização da Fase 1.

O script chama o endpoint publicado e confere o telemetry persistido no banco.
Ele deve ser executado apenas após o verificador estrito da Fase 1 aprovar a
base, pois cada chamada gera uma resposta real e uma avaliação assíncrona.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from time import sleep
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from uuid import uuid4

from supabase import Client, create_client


SCENARIOS = (
    {
        "name": "plano_vigente",
        "question": "Qual é a carga horária e o período do plano de ensino vigente da disciplina INT 5224?",
        "required_source": "administrativo__plano_ensino_INT55224__plano__ufsc__2026_2.pdf",
        "forbidden_source": "administrativo__plano_ensino_INT55224__plano__ufsc__2026__v1.pdf",
        "expects_context": True,
        "expects_fallback": False,
        "requires_references": True,
        "forbid_reference_fallback": True,
    },
    {
        "name": "glossario_near_miss",
        "question": "No glossário técnico da disciplina, o que significa near miss?",
        "required_source": "glossario",
        "forbidden_source": "administrativo__plano_ensino_INT55224__plano__ufsc__2026__v1.pdf",
        "expects_context": True,
        "expects_fallback": False,
        "requires_references": True,
        "forbid_reference_fallback": True,
    },
    {
        "name": "plano_antigo_bloqueado",
        "question": "Segundo Alexandre Caminha, qual é a orientação do plano anterior?",
        "required_source": None,
        "forbidden_source": "administrativo__plano_ensino_INT55224__plano__ufsc__2026__v1.pdf",
        "expects_context": False,
        "expects_fallback": True,
        "requires_references": False,
        "forbid_reference_fallback": False,
    },
)


def request_json(url: str, body: dict) -> dict:
    request = Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=120) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        raise RuntimeError(f"HTTP {error.code}: {error.read().decode('utf-8', 'replace')[:500]}") from error


def telemetry(client: Client, session_id: str, request_id: str) -> dict:
    for _ in range(10):
        response = (
            client.table("chat_messages")
            .select("content,metadata")
            .eq("session_id", session_id)
            .eq("request_id", request_id)
            .eq("role", "assistant")
            .limit(1)
            .execute()
        )
        row = response.data[0] if response.data else None
        if row:
            return row
        sleep(0.5)
    raise RuntimeError("Turno não foi persistido no telemetry")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default=os.getenv("GUAPU_APP_URL", "").rstrip("/"))
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--repeat", type=int, default=3)
    args = parser.parse_args()
    if not args.base_url:
        raise SystemExit("Informe --base-url ou GUAPU_APP_URL")
    if args.repeat < 1:
        raise SystemExit("--repeat deve ser maior que zero")
    supabase_url = os.getenv("SUPABASE_URL", "").strip()
    supabase_key = (
        os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
        or os.getenv("SUPABASE_KEY", "").strip()
    )
    if not supabase_url or not supabase_key:
        raise SystemExit("SUPABASE_URL e uma chave Supabase não estão configurados")

    results: list[dict] = []
    telemetry_client = create_client(supabase_url, supabase_key)
    for scenario in SCENARIOS:
        for repetition in range(1, args.repeat + 1):
            session_id = f"qa-phase1-{scenario['name']}-{uuid4().hex}"
            request_id = str(uuid4())
            response = request_json(
                f"{args.base_url}/api/chat",
                {"session_id": session_id, "request_id": request_id, "message": scenario["question"]},
            )
            stored = telemetry(telemetry_client, session_id, request_id)
            metadata = stored.get("metadata") or {}
            sources = [str(item.get("source", "")) for item in metadata.get("retrieval", [])]
            required = scenario["required_source"]
            forbidden = scenario["forbidden_source"]
            answer = str(stored.get("content", ""))
            has_context = bool(metadata.get("has_context"))
            has_references = "**Referências:**" in answer
            has_reference_fallback = "Informação não disponível no artigo" in answer
            error_code = metadata.get("error_code")
            error_code_ok = (
                error_code is None
                if scenario["expects_context"]
                else error_code == "NO_RELEVANT_CONTEXT"
            )
            passed = (
                not response.get("error")
                and error_code_ok
                and has_context is scenario["expects_context"]
                and bool(metadata.get("fallback_used")) is scenario["expects_fallback"]
                and (required is None or required in sources)
                and forbidden not in sources
                and forbidden not in answer
                and has_references is scenario["requires_references"]
                and (not scenario["forbid_reference_fallback"] or not has_reference_fallback)
            )
            results.append(
                {
                    "scenario": scenario["name"],
                    "repetition": repetition,
                    "passed": passed,
                    "request_id": request_id,
                    "session_id": session_id,
                    "sources": sources,
                    "latency_ms": metadata.get("latency_ms", {}),
                    "fallback_used": metadata.get("fallback_used"),
                    "error_code": metadata.get("error_code"),
                    "answer": answer,
                }
            )

    report = {
        "passed": all(result["passed"] for result in results),
        "total": len(results),
        "approved": sum(result["passed"] for result in results),
        "results": results,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: report[key] for key in ("passed", "total", "approved")}, ensure_ascii=False))
    if not report["passed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
