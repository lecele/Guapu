"""Preenche metadados bibliográficos nos chunks já existentes, sem embeddings."""

import argparse
import csv
import json
import os
from collections import defaultdict
from pathlib import Path
import sys

import psycopg

# Ao executar ``python scripts/...`` no Windows, a raiz do projeto não é
# incluída automaticamente para imports de módulos compartilhados.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from reference_metadata import extract_reference_metadata, propose_cover_title

def key_for(row: dict) -> tuple[str, str]:
    metadata = row.get("metadata") or {}
    file_id = metadata.get("drive_file_id")
    return ("drive", str(file_id)) if file_id else ("source", str(row.get("source") or ""))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="Grava as alterações; sem esta opção apenas simula.")
    parser.add_argument("--report", type=Path, help="CSV de revisão dos metadados encontrados.")
    parser.add_argument(
        "--include-quarantined",
        action="store_true",
        help="Inclui documentos em quarentena; o padrão é revisar somente fontes ativas.",
    )
    args = parser.parse_args()
    db_url = os.environ.get("SUPABASE_DB_URL")
    if not db_url:
        raise RuntimeError("SUPABASE_DB_URL não configurada")

    with psycopg.connect(db_url) as conn, conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
        # A folha de rosto e a ficha bibliográfica ficam nas primeiras páginas.
        # Sem uma ordenação explícita, a ordem física da tabela podia escolher
        # chunks do meio do PDF e perder justamente essas evidências.
        cur.execute(
            """
            SELECT id, source, content, metadata
            FROM public.documents
            WHERE rag_document_is_active(metadata) OR %s
            ORDER BY source,
                     COALESCE(NULLIF(metadata->>'page_number', '')::integer, 999999),
                     COALESCE(NULLIF(metadata->>'chunk_index', '')::integer, 999999),
                     id
            """,
            (args.include_quarantined,),
        )
        groups: dict[tuple[str, str], list[dict]] = defaultdict(list)
        for row in cur:
            groups[key_for(row)].append(row)

        updates = []
        proposals = []
        for key, rows in groups.items():
            # As primeiras páginas normalmente contêm capa, ficha e sumário; unir
            # somente texto já armazenado preserva a regra de não usar filename.
            text = "\n".join(str(row["content"]) for row in rows[:20])
            metadata = extract_reference_metadata([{"text": text}])
            if metadata:
                updates.append((key, metadata, len(rows)))
            proposal = propose_cover_title(text)
            if proposal:
                proposals.append((key, proposal, len(rows)))

        print(f"Documentos lidos: {len(groups)} | com metadados extraíveis: {len(updates)}")
        if args.report:
            args.report.parent.mkdir(parents=True, exist_ok=True)
            with args.report.open("w", encoding="utf-8-sig", newline="") as stream:
                writer = csv.DictWriter(
                    stream,
                    fieldnames=["kind", "identifier", "chunks", "status", "reference_author", "reference_year", "reference_title", "reference_section"],
                )
                writer.writeheader()
                for (kind, value), metadata, chunks in updates:
                    writer.writerow({"kind": kind, "identifier": value, "chunks": chunks, "status": "extração explícita — elegível para gravação", **metadata})
                for (kind, value), title, chunks in proposals:
                    writer.writerow({"kind": kind, "identifier": value, "chunks": chunks, "status": "proposta de capa — não gravar automaticamente", "reference_title": title})
        if not args.apply:
            print("Simulação concluída. Use --apply para gravar.")
            return

        affected = 0
        for (kind, value), metadata, _chunks in updates:
            if kind == "drive":
                cur.execute(
                    "UPDATE public.documents SET metadata = metadata || %s::jsonb "
                    "WHERE metadata->>'drive_file_id' = %s AND NOT (metadata ? 'reference_title')",
                    (json.dumps(metadata), value),
                )
            else:
                cur.execute(
                    "UPDATE public.documents SET metadata = metadata || %s::jsonb "
                    "WHERE source = %s AND NOT (metadata ? 'reference_title')",
                    (json.dumps(metadata), value),
                )
            affected += cur.rowcount
        conn.commit()
        print(f"Chunks atualizados: {affected}")


if __name__ == "__main__":
    main()
