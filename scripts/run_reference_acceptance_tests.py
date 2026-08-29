"""Testes reais das referências por obra, usando o endpoint publicado."""

from __future__ import annotations

import argparse
import json
import os
from time import sleep
from urllib.request import Request, urlopen
from uuid import uuid4

from supabase import Client, create_client


SCENARIOS = (
    {
        "name": "glossario",
        "question": "No glossário técnico da disciplina, o que significa near miss?",
        "source": "glossario",
        "reference": "Glossário Técnico",
    },
    {
        "name": "manual_tecnico",
        "question": "Segundo o Manual Técnico do Tutor de Enfermagem, como funciona o método socrático?",
        "source": "Manual Técnico",
        "reference": "Manual Técnico de Arquitetura, Engenharia e Operação: Tutor de Enfermagem",
    },
    {
        "name": "cuidados_criticos",
        "question": "Quais cuidados críticos de enfermagem são importantes para prevenir infecções?",
        "source": "cuidados_criticos",
        "reference": "Cuidados críticos de enfermagem",
    },
    {
        "name": "nutricao",
        "question": "O que é avaliação nutricional e quais métodos podem ser usados?",
        "source": "nutricao",
        "reference": "Nutrition Assessment: Clinical and Research Applications",
    },
    {
        "name": "sobecc",
        "question": "Quais são as etapas de limpeza e enxágue de produtos para saúde?",
        "source": "praticas_recomendadas",
        "reference": "Práticas Recomendadas SOBECC",
    },
)


def post(url: str, body: dict) -> dict:
    request = Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urlopen(request, timeout=120) as response:
        return json.loads(response.read().decode("utf-8"))


def get_telemetry(client: Client, session_id: str, request_id: str) -> dict:
    for _ in range(20):
        response = (
            client.table("chat_messages")
            .select("content,metadata")
            .eq("session_id", session_id)
            .eq("request_id", request_id)
            .eq("role", "assistant")
            .limit(1)
            .execute()
        )
        if response.data:
            return response.data[0]
        sleep(0.5)
    raise RuntimeError("telemetria não persistida")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    supabase_url = os.environ["SUPABASE_URL"]
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ["SUPABASE_KEY"]
    client = create_client(supabase_url, service_key)
    results = []
    for scenario in SCENARIOS:
        session_id = f"qa-reference-{scenario['name']}-{uuid4().hex}"
        request_id = str(uuid4())
        response = post(
            f"{args.base_url.rstrip('/')}/api/chat",
            {"session_id": session_id, "request_id": request_id, "message": scenario["question"]},
        )
        stored = get_telemetry(client, session_id, request_id)
        metadata = stored.get("metadata") or {}
        answer = str(stored.get("content") or "")
        sources = [str(item.get("source") or "") for item in metadata.get("retrieval") or []]
        reference_lines = answer.split("**Referências:**", 1)[-1].strip().splitlines() if "**Referências:**" in answer else []
        matching_refs = [line for line in reference_lines if scenario["reference"].lower() in line.lower()]
        passed = (
            not response.get("error")
            and bool(metadata.get("has_context"))
            and any(scenario["source"].lower() in source.lower() for source in sources)
            and bool(matching_refs)
            and any("p." in line for line in matching_refs)
        )
        results.append(
            {
                "scenario": scenario["name"],
                "passed": passed,
                "sources": sources,
                "provider_fallback": bool(metadata.get("fallback_used")),
                "latency_ms": metadata.get("latency_ms"),
                "reference_lines": matching_refs,
            }
        )

    report = {"passed": all(item["passed"] for item in results), "total": len(results), "approved": sum(item["passed"] for item in results), "results": results}
    with open(args.output, "w", encoding="utf-8") as stream:
        json.dump(report, stream, ensure_ascii=False, indent=2)
        stream.write("\n")
    print(json.dumps({key: report[key] for key in ("passed", "total", "approved")}, ensure_ascii=False))
    for result in results:
        print(json.dumps(result, ensure_ascii=False))
    raise SystemExit(0 if report["passed"] else 1)


if __name__ == "__main__":
    main()
