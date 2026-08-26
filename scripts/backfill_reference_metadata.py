"""Preenche metadados bibliográficos nos chunks já existentes, sem embeddings."""

import argparse
import json
import os
import re
from collections import defaultdict

import psycopg

def extract_reference_metadata(pages: list[dict]) -> dict[str, str]:
    text = "\n".join(str(page.get("text", "")) for page in pages[:3]).replace(chr(0), "")
    citation = re.search(
        r"(?m)^\s*([A-ZÀ-Ý][A-Za-zÀ-ÿ'’.-]+(?:\s+(?:[A-ZÀ-Ý][A-Za-zÀ-ÿ'’.-]+|de|da|do|dos|das)){0,5})\s*\(?((?:19|20)\d{2})\)?[.,]\s*(.{12,180})$",
        text,
    )
    if citation:
        return {"reference_author": citation.group(1).strip(), "reference_year": citation.group(2), "reference_title": citation.group(3).strip().rstrip(". ")}
    chapter = re.search(r"(?im)^\s*(?:cap[ií]tulo|cap\.)\s*(\d+)?\s*[-—–:.]\s*(.{8,180})$", text)
    if chapter:
        result = {"reference_title": chapter.group(2).strip().rstrip(". ")}
        if chapter.group(1): result["reference_section"] = f"Cap. {chapter.group(1)}"
        return result
    return {}


def key_for(row: dict) -> tuple[str, str]:
    metadata = row.get("metadata") or {}
    file_id = metadata.get("drive_file_id")
    return ("drive", str(file_id)) if file_id else ("source", str(row.get("source") or ""))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="Grava as alterações; sem esta opção apenas simula.")
    args = parser.parse_args()
    db_url = os.environ.get("SUPABASE_DB_URL")
    if not db_url:
        raise RuntimeError("SUPABASE_DB_URL não configurada")

    with psycopg.connect(db_url) as conn, conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
        cur.execute("SELECT id, source, content, metadata FROM public.documents")
        groups: dict[tuple[str, str], list[dict]] = defaultdict(list)
        for row in cur:
            groups[key_for(row)].append(row)

        updates = []
        for key, rows in groups.items():
            # As primeiras páginas normalmente contêm capa, ficha e sumário; unir
            # somente texto já armazenado preserva a regra de não usar filename.
            text = "\n".join(str(row["content"]) for row in rows[:20])
            metadata = extract_reference_metadata([{"text": text}])
            if metadata:
                updates.append((key, metadata))

        print(f"Documentos lidos: {len(groups)} | com metadados extraíveis: {len(updates)}")
        if not args.apply:
            print("Simulação concluída. Use --apply para gravar.")
            return

        affected = 0
        for (kind, value), metadata in updates:
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
