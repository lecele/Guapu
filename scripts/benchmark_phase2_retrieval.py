"""Compara recuperação semântica e híbrida contra o Supabase real.

O script não gera respostas nem grava dados. Ele mede somente a recuperação,
confere fontes esperadas e informa quando a busca híbrida ultrapassa o
orçamento de latência definido para o caminho do aluno.
"""

from __future__ import annotations

import argparse
import json
import os
from time import perf_counter

from google import genai
from supabase import create_client


CASES = (
    {
        "name": "plano_vigente",
        "question": "Qual é a carga horária e o período do plano de ensino vigente da disciplina INT 5224?",
        "threshold": 0.25,
        "expected_source": "administrativo__plano_ensino_INT55224__plano__ufsc__2026_2.pdf",
    },
    {
        "name": "glossario_near_miss",
        "question": "No glossário técnico da disciplina, o que significa near miss?",
        "threshold": 0.35,
        "expected_source": "glossario.docx",
    },
    {
        "name": "biblioteca_infeccao",
        "question": "Quais cuidados de enfermagem são recomendados para prevenção de infecção do sítio cirúrgico?",
        "threshold": 0.35,
        "expected_source": "seguranca_cirurgica__cirurgia_segura__manual__oms__2009__v2",
    },
)


def required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise SystemExit(f"Variável obrigatória ausente: {name}")
    return value


def source_matches(source: str, expected: str) -> bool:
    normalize = lambda value: value.lower().removesuffix(".pdf").removesuffix(".docx")
    return normalize(source) == normalize(expected)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repeat", type=int, default=1)
    parser.add_argument("--budget-ms", type=int, default=3000)
    args = parser.parse_args()
    if args.repeat < 1:
        raise SystemExit("--repeat deve ser maior que zero")

    api_key = required_env("GOOGLE_API_KEY")
    supabase_url = required_env("SUPABASE_URL")
    supabase_key = required_env("SUPABASE_SERVICE_ROLE_KEY")
    ai = genai.Client(api_key=api_key)
    supabase = create_client(supabase_url, supabase_key)
    results: list[dict] = []

    for case in CASES:
        embedding = ai.models.embed_content(
            model="gemini-embedding-2",
            contents=case["question"],
            config={"output_dimensionality": 768, "task_type": "RETRIEVAL_QUERY"},
        ).embeddings[0].values
        args_common = {
            "query_embedding": embedding,
            "match_threshold": case["threshold"],
            "match_count": 5,
        }
        for method, function_name, rpc_args in (
            ("semantic", "match_documents", args_common),
            (
                "hybrid",
                "match_documents_hybrid",
                {**args_common, "query_text": case["question"]},
            ),
        ):
            started = perf_counter()
            try:
                response = supabase.rpc(function_name, rpc_args).execute()
                rows = response.data or []
                ok = True
                error_type = None
            except Exception as error:  # noqa: BLE001 - relatório de benchmark
                rows = []
                ok = False
                error_type = type(error).__name__
            latency_ms = round((perf_counter() - started) * 1000)
            sources = [str(row.get("source", "")) for row in rows]
            results.append(
                {
                    "case": case["name"],
                    "method": method,
                    "latency_ms": latency_ms,
                    "within_budget": latency_ms <= args.budget_ms,
                    "ok": ok,
                    "expected_source_found": any(
                        source_matches(source, case["expected_source"]) for source in sources
                    ),
                    "sources": sources,
                    "error_type": error_type,
                }
            )

    report = {
        "retrieval_correctness_passed": all(
            result["ok"] and result["expected_source_found"] for result in results
        ),
        "latency_budget_passed": all(result["within_budget"] for result in results),
        "budget_ms": args.budget_ms,
        "results": results,
    }
    print(json.dumps(report, ensure_ascii=False))
    if not report["retrieval_correctness_passed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
