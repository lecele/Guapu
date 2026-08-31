"""Bateria curta publicada para os quatro materiais com identidade parcial."""
from __future__ import annotations

import json
import os
import re
from time import sleep
from urllib.request import Request, urlopen
from uuid import uuid4

from supabase import create_client

SCENARIOS = [
    ("clinica_cirurgica", "O que é doença do refluxo gastroesofágico e como ela é diagnosticada?", "clinica_cirurgica", "Clínica Cirúrgica 2"),
    ("recuperacao_anestesica", "Quais cuidados devem ser observados no transporte e na admissão do paciente na SRPA?", "recuperacao_anestesica", "Passo 1"),
    ("sinais_agravo", "Quais sinais respiratórios de alerta devem ser avaliados na SRPA?", "sinais_agravo", "Alterações respiratórias"),
    ("tabela_medicamentos", "Quais cuidados de enfermagem são importantes na administração do tramadol?", "tabela_medicamentos", "Analgésicos"),
]

def post(url: str, body: dict) -> dict:
    req = Request(url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"}, method="POST")
    with urlopen(req, timeout=120) as response:
        return json.loads(response.read().decode())

def main() -> None:
    base = os.environ["GUAPU_APP_URL"].rstrip("/")
    client = create_client(os.environ["SUPABASE_URL"], os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ["SUPABASE_KEY"])
    results = []
    for name, question, source_hint, reference_hint in SCENARIOS:
        session_id, request_id = f"qa-partial4-{name}-{uuid4().hex}", str(uuid4())
        response = post(f"{base}/api/chat", {"session_id": session_id, "request_id": request_id, "message": question})
        row = None
        for _ in range(30):
            found = client.table("chat_messages").select("content,metadata").eq("session_id", session_id).eq("request_id", request_id).eq("role", "assistant").limit(1).execute().data
            if found:
                row = found[0]
                break
            sleep(0.5)
        if not row:
            raise RuntimeError(f"telemetria ausente: {name}")
        answer, metadata = str(row.get("content") or ""), row.get("metadata") or {}
        sources = [str(item.get("source") or "") for item in metadata.get("retrieval") or []]
        refs = re.findall(r"(?im)^- (.+)$", answer.split("**Referências**", 1)[1]) if "**Referências**" in answer else []
        passed = (not response.get("error") and bool(metadata.get("has_context")) and any(source_hint in source for source in sources) and any(reference_hint.lower() in ref.lower() for ref in refs) and "**Referências:**" not in answer)
        results.append({"scenario": name, "passed": passed, "request_id": request_id, "latency_ms": metadata.get("latency_ms"), "sources": sources, "references": refs})
    report = {"passed": all(item["passed"] for item in results), "total": len(results), "approved": sum(item["passed"] for item in results), "results": results}
    print(json.dumps(report, ensure_ascii=False))
    raise SystemExit(0 if report["passed"] else 1)

if __name__ == "__main__":
    main()
