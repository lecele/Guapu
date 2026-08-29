"""Avalia respostas do RAG fora do caminho de resposta do estudante."""

from __future__ import annotations

import argparse
import json
import os
import re
import socket
import sys
import time
from datetime import datetime, timezone
from typing import Any

import structlog
from google import genai
from google.genai import types

from db.supabase_client import get_supabase_client

logger = structlog.get_logger("response_quality_worker")


def claim_job(client: Any, worker_id: str, lease_seconds: int) -> dict[str, Any] | None:
    response = client.rpc(
        "claim_response_quality_evaluation",
        {"p_worker_id": worker_id, "p_lease_seconds": lease_seconds},
    ).execute()
    if getattr(response, "error", None):
        raise RuntimeError(f"QUALITY_EVALUATION_CLAIM_FAILED: {response.error}")
    return (response.data or [None])[0]


def load_turn(client: Any, job: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    response = client.table("chat_messages").select("content, metadata").eq(
        "session_id", job["session_id"]
    ).eq("request_id", job["request_id"]).eq("role", "assistant").maybe_single().execute()
    if getattr(response, "error", None) or not response.data:
        raise RuntimeError("ASSISTANT_TURN_NOT_FOUND")
    assistant = response.data
    user_response = client.table("chat_messages").select("content").eq(
        "session_id", job["session_id"]
    ).eq("request_id", job["request_id"]).eq("role", "user").maybe_single().execute()
    if getattr(user_response, "error", None) or not user_response.data:
        raise RuntimeError("USER_TURN_NOT_FOUND")
    return user_response.data, assistant


def load_context(client: Any, metadata: dict[str, Any]) -> list[dict[str, str]]:
    retrieval = metadata.get("retrieval") or []
    ids = [entry.get("document_id") for entry in retrieval if isinstance(entry, dict) and entry.get("document_id")]
    uuid_ids = [item for item in ids if isinstance(item, str) and not item.startswith("source:")]
    if not uuid_ids:
        return []
    response = client.table("documents").select("id, source, content").in_("id", uuid_ids).execute()
    if getattr(response, "error", None):
        raise RuntimeError(f"CONTEXT_READ_FAILED: {response.error}")
    by_id = {str(item["id"]): item for item in response.data or []}
    return [
        {"source": str(by_id[item]["source"]), "content": str(by_id[item]["content"])}
        for item in uuid_ids if item in by_id
    ]


def _model_candidates() -> list[str]:
    configured = os.environ.get("RAG_EVALUATOR_MODELS") or os.environ.get("RAG_EVALUATOR_MODEL")
    values = configured.split(",") if configured else [
        "gemini-2.5-flash-lite",
        "gemini-2.5-flash",
        "gemini-3.1-flash-lite",
        "gemini-3.5-flash-lite",
        "gemini-3.5-flash",
    ]
    return list(dict.fromkeys(item.strip() for item in values if item.strip()))


def _is_quota_error(error: Exception) -> bool:
    message = str(error).upper()
    return "429" in message or "RESOURCE_EXHAUSTED" in message or "QUOTA" in message


def _is_transient_model_error(error: Exception) -> bool:
    message = str(error).upper()
    return any(marker in message for marker in ("503", "UNAVAILABLE", "429", "RESOURCE_EXHAUSTED", "500"))


def _parse_evaluator_response(raw: str) -> dict[str, Any]:
    candidate = raw.strip()
    if candidate.startswith("```"):
        candidate = re.sub(r"^```(?:json)?\s*|\s*```$", "", candidate, flags=re.IGNORECASE | re.DOTALL).strip()
    start, end = candidate.find("{"), candidate.rfind("}")
    if start >= 0 and end > start:
        candidate = candidate[start : end + 1]
    try:
        parsed = json.loads(candidate)
    except json.JSONDecodeError:
        # Alguns retornos trazem \u inválido dentro da justificativa. Preservamos
        # o texto, escapando apenas sequências que não são válidas em JSON.
        repaired = re.sub(r"\\u(?![0-9a-fA-F]{4})", r"\\\\u", candidate)
        repaired = re.sub(r"\\(?![\"\\/bfnrtu])", r"\\\\", repaired)
        parsed = json.loads(repaired)
    if not isinstance(parsed, dict):
        raise RuntimeError("INVALID_EVALUATOR_JSON_OBJECT")
    return parsed


def evaluate(question: str, answer: str, context: list[dict[str, str]]) -> tuple[dict[str, Any], str]:
    api_key = os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        raise RuntimeError("GOOGLE_API_KEY_NOT_CONFIGURED")
    material = "\n\n---\n\n".join(
        f"[Fonte: {entry['source']}]\n{entry['content'][:6000]}" for entry in context
    )
    prompt = f"""Você é um avaliador automático de aderência RAG para educação em enfermagem.
Avalie somente se a RESPOSTA é sustentada pelo CONTEXTO RECUPERADO. Não use conhecimento externo.

PERGUNTA: {question}

RESPOSTA: {answer}

CONTEXTO RECUPERADO:\n{material}

Retorne JSON válido, sem markdown, com:
{{"score":0-100,"verdict":"correct|incomplete|incorrect|unverifiable","grounding_score":0-100,"completeness_score":0-100,"relevance_score":0-100,"rationale":"até 400 caracteres"}}

Use "unverifiable" quando o contexto não permitir julgar. "incorrect" exige contradição ou afirmação não sustentada. "incomplete" é uma resposta parcialmente sustentada mas insuficiente."""
    timeout_ms = max(1000, int(os.environ.get("RAG_EVALUATOR_TIMEOUT_MS", "60000")))
    client = genai.Client(api_key=api_key, http_options=types.HttpOptions(timeout=timeout_ms))
    last_error: Exception | None = None
    retry_count = max(0, int(os.environ.get("RAG_EVALUATOR_RETRIES", "2")))
    for model in _model_candidates():
        for attempt in range(retry_count + 1):
            try:
                response = client.models.generate_content(
                    model=model,
                    contents=prompt,
                    config=types.GenerateContentConfig(response_mime_type="application/json", temperature=0),
                )
                raw = response.text or ""
                result = _parse_evaluator_response(raw)
                if result.get("verdict") not in {"correct", "incomplete", "incorrect", "unverifiable"}:
                    raise RuntimeError("INVALID_EVALUATOR_VERDICT")
                for key in ("score", "grounding_score", "completeness_score", "relevance_score"):
                    result[key] = max(0, min(100, int(result.get(key, 0))))
                result["rationale"] = str(result.get("rationale", ""))[:400]
                return result, model
            except Exception as error:
                last_error = error
                if _is_quota_error(error):
                    raise RuntimeError(f"GEMINI_QUOTA_EXHAUSTED: {error}") from error
                if not _is_transient_model_error(error) or attempt >= retry_count:
                    break
                time.sleep(min(8, 2 ** attempt))
    raise RuntimeError(f"GEMINI_EVALUATION_FAILED: {last_error}") from last_error


def complete(client: Any, job: dict[str, Any], result: dict[str, Any], model: str, source_count: int) -> None:
    now = datetime.now(timezone.utc).isoformat()
    payload = {
        "status": "succeeded", "completed_at": now, "updated_at": now, "lease_expires_at": None,
        "score": result["score"], "verdict": result["verdict"],
        "grounding_score": result["grounding_score"], "completeness_score": result["completeness_score"],
        "relevance_score": result["relevance_score"], "rationale": result["rationale"],
        "evaluator_model": model, "source_count": source_count, "last_error": None,
    }
    response = client.table("response_quality_evaluations").update(payload).eq("id", job["id"]).execute()
    if getattr(response, "error", None):
        raise RuntimeError(f"QUALITY_EVALUATION_WRITE_FAILED: {response.error}")


def fail(client: Any, job: dict[str, Any], error: Exception) -> None:
    attempts, maximum = int(job.get("attempts", 0)), int(job.get("max_attempts", 3))
    permanent = _is_quota_error(error) or "GOOGLE_API_KEY_NOT_CONFIGURED" in str(error)
    response = client.table("response_quality_evaluations").update({
        "status": "failed" if permanent or attempts >= maximum else "queued", "lease_expires_at": None,
        "last_error": str(error)[:1000], "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", job["id"]).execute()
    if getattr(response, "error", None):
        raise RuntimeError(f"QUALITY_EVALUATION_FAIL_WRITE_FAILED: {response.error}")


def run(*, once: bool, poll_seconds: int, lease_seconds: int) -> None:
    client = get_supabase_client()
    worker_id = os.getenv("RAG_EVALUATOR_WORKER_ID") or f"{socket.gethostname()}-{os.getpid()}"
    while True:
        job = claim_job(client, worker_id, lease_seconds)
        if not job:
            if once:
                return
            time.sleep(poll_seconds)
            continue
        try:
            user, assistant = load_turn(client, job)
            context = load_context(client, assistant.get("metadata") or {})
            result, model = evaluate(str(user["content"]), str(assistant["content"]), context)
            complete(client, job, result, model, len(context))
            logger.info("response_quality_evaluated", evaluation_id=job["id"], score=result["score"], verdict=result["verdict"])
        except Exception as error:
            fail(client, job, error)
            logger.exception("response_quality_evaluation_failed", evaluation_id=job["id"], error=str(error))
            if once:
                raise
        if once:
            return


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--poll-seconds", type=int, default=10)
    parser.add_argument("--lease-seconds", type=int, default=900)
    args = parser.parse_args()
    try:
        run(once=args.once, poll_seconds=args.poll_seconds, lease_seconds=args.lease_seconds)
    except Exception as error:
        logger.error("response_quality_worker_stopped", error=str(error), exc_info=True)
        sys.exit(1)
