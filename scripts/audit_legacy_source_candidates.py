"""Compara fontes legadas em quarentena com fontes ativas do RAG.

O relatório é somente leitura. Ele identifica pares por nome canônico e mede
similaridade lexical do conteúdo para embasar uma posterior decisão humana de
remoção física. Não executa nenhuma exclusão.
"""

from __future__ import annotations

import argparse
import csv
import os
from collections import defaultdict
from pathlib import Path
import re
import unicodedata

import psycopg
from psycopg.rows import dict_row


TOKEN_RE = re.compile(r"[a-z0-9]{4,}")


def normalized_source(value: str) -> str:
    """Remove extensão, acentos e separadores para uma comparação estável."""
    normalized = unicodedata.normalize("NFKD", value or "")
    normalized = "".join(char for char in normalized if not unicodedata.combining(char))
    normalized = normalized.lower().removesuffix(".pdf").removesuffix(".docx")
    return re.sub(r"[^a-z0-9]+", "_", normalized).strip("_")


def token_set(contents: list[str]) -> set[str]:
    """Produz uma assinatura lexical independente de tamanho/limites dos chunks."""
    joined = " ".join(contents).lower()
    normalized = unicodedata.normalize("NFKD", joined)
    normalized = "".join(char for char in normalized if not unicodedata.combining(char))
    return set(TOKEN_RE.findall(normalized))


def jaccard(left: set[str], right: set[str]) -> float:
    if not left and not right:
        return 1.0
    union = left | right
    return len(left & right) / len(union) if union else 0.0


def conclusion(score: float) -> str:
    if score >= 0.92:
        return "IDENTIDADE_PROVAVEL — confirmar backup e origem antes de excluir"
    if score >= 0.55:
        return "VERSAO_RELACIONADA — manter ambas até validação documental"
    return "NOME_SEM_EQUIVALENCIA_DE_CONTEUDO — não excluir"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", type=Path, required=True)
    args = parser.parse_args()
    database_url = os.getenv("SUPABASE_DB_URL", "").strip()
    if not database_url:
        raise SystemExit("SUPABASE_DB_URL não configurada")

    with psycopg.connect(database_url, row_factory=dict_row) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT source,
                       content,
                       metadata->>'drive_file_id' AS drive_file_id,
                       COALESCE(metadata->>'rag_status', 'active') AS rag_status
                FROM documents
                WHERE source IS NOT NULL
                """
            )
            rows = [dict(row) for row in cursor.fetchall()]

    legacy_content: dict[str, list[str]] = defaultdict(list)
    managed_content: dict[str, list[str]] = defaultdict(list)
    managed_ids: dict[str, set[str]] = defaultdict(set)
    for row in rows:
        source = str(row["source"])
        if row["drive_file_id"] and row["rag_status"] == "active":
            managed_content[source].append(str(row["content"] or ""))
            managed_ids[source].add(str(row["drive_file_id"]))
        elif not row["drive_file_id"]:
            legacy_content[source].append(str(row["content"] or ""))

    managed_by_normalized: dict[str, list[str]] = defaultdict(list)
    for source in managed_content:
        managed_by_normalized[normalized_source(source)].append(source)

    output: list[dict[str, object]] = []
    token_cache: dict[tuple[str, str], set[str]] = {}
    for legacy_source, legacy_chunks in sorted(legacy_content.items()):
        candidates = managed_by_normalized.get(normalized_source(legacy_source), [])
        for managed_source in sorted(candidates):
            legacy_key = ("legacy", legacy_source)
            managed_key = ("managed", managed_source)
            legacy_tokens = token_cache.setdefault(legacy_key, token_set(legacy_chunks))
            managed_tokens = token_cache.setdefault(managed_key, token_set(managed_content[managed_source]))
            score = jaccard(legacy_tokens, managed_tokens)
            output.append(
                {
                    "legacy_source": legacy_source,
                    "managed_source": managed_source,
                    "drive_file_ids": " | ".join(sorted(managed_ids[managed_source])),
                    "legacy_chunks": len(legacy_chunks),
                    "managed_active_chunks": len(managed_content[managed_source]),
                    "legacy_unique_tokens": len(legacy_tokens),
                    "managed_unique_tokens": len(managed_tokens),
                    "shared_unique_tokens": len(legacy_tokens & managed_tokens),
                    "jaccard_similarity": f"{score:.4f}",
                    "conclusion": conclusion(score),
                }
            )

    args.csv.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "legacy_source", "managed_source", "drive_file_ids", "legacy_chunks",
        "managed_active_chunks", "legacy_unique_tokens", "managed_unique_tokens",
        "shared_unique_tokens", "jaccard_similarity", "conclusion",
    ]
    with args.csv.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(output)

    print(f"pares_analisados={len(output)}; relatorio={args.csv.resolve()}")


if __name__ == "__main__":
    main()
