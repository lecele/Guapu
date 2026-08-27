"""Gera a matriz auditável Drive/manifesto/documentos da Fase 1."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
from pathlib import Path
import re
import unicodedata

import psycopg
from psycopg.rows import dict_row


def database_url() -> str:
    value = os.getenv("SUPABASE_DB_URL", "").strip()
    if not value:
        raise SystemExit("SUPABASE_DB_URL não configurada")
    return value


def normalized_source(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value or "")
    normalized = "".join(char for char in normalized if not unicodedata.combining(char))
    normalized = normalized.lower().removesuffix(".pdf").removesuffix(".docx")
    return re.sub(r"[^a-z0-9]+", "_", normalized).strip("_")


def digest(values: set[str]) -> str:
    hasher = hashlib.sha256()
    for value in sorted(values):
        hasher.update(value.encode("utf-8"))
        hasher.update(b"\n")
    return hasher.hexdigest() if values else ""


def empty_item(source: str) -> dict:
    return {
        "source": source,
        "total": 0,
        "searchable": 0,
        "legacy": 0,
        "staging": 0,
        "drive_ids": set(),
        "drive_paths": set(),
        "legacy_hashes": set(),
        "managed_hashes": set(),
    }


def load_live_drive(path: Path | None) -> dict[str, dict]:
    """Lê o inventário JSON exportado diretamente da pasta do Drive."""
    if path is None:
        return {}
    raw = json.loads(path.read_text(encoding="utf-8"))
    files = raw.get("files", raw) if isinstance(raw, dict) else raw
    if not isinstance(files, list):
        raise SystemExit("Inventário do Drive precisa conter uma lista de arquivos")
    return {
        str(file_info["id"]): file_info
        for file_info in files
        if isinstance(file_info, dict) and file_info.get("id")
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", type=Path, required=True)
    parser.add_argument("--summary", type=Path, required=True)
    parser.add_argument("--drive-json", type=Path)
    args = parser.parse_args()
    live_drive_by_id = load_live_drive(args.drive_json)

    with psycopg.connect(database_url(), row_factory=dict_row) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT source,
                       id::text,
                       metadata->>'drive_file_id' AS drive_file_id,
                       metadata->>'drive_path' AS drive_path,
                       metadata->>'rag_status' AS rag_status,
                       COALESCE(metadata->>'content_hash', md5(content)) AS content_hash
                FROM documents
                ORDER BY source, id
                """
            )
            document_rows = [dict(row) for row in cursor.fetchall()]
            cursor.execute("SELECT * FROM drive_sync_manifest ORDER BY name, drive_file_id")
            manifests = [dict(row) for row in cursor.fetchall()]
            cursor.execute(
                """
                SELECT drive_file_id, action, status, attempts, max_attempts,
                       last_error, file_info
                FROM drive_sync_jobs
                ORDER BY drive_file_id
                """
            )
            jobs = [dict(row) for row in cursor.fetchall()]

    manifest_by_id = {str(row["drive_file_id"]): row for row in manifests}
    job_by_id = {str(row["drive_file_id"]): row for row in jobs}
    grouped: dict[str, dict] = {}
    normalized_groups: dict[str, list[str]] = {}
    source_by_drive_id: dict[str, str] = {}

    for row in document_rows:
        source = row["source"] or "(sem source)"
        item = grouped.setdefault(source, empty_item(source))
        item["total"] += 1
        drive_id = row.get("drive_file_id")
        status = row.get("rag_status")
        if drive_id:
            item["drive_ids"].add(str(drive_id))
            source_by_drive_id[str(drive_id)] = source
            if row.get("drive_path"):
                item["drive_paths"].add(str(row["drive_path"]))
            item["managed_hashes"].add(str(row["content_hash"]))
            if status == "staging":
                item["staging"] += 1
            elif status in (None, "active"):
                item["searchable"] += 1
        else:
            item["legacy"] += 1
            item["legacy_hashes"].add(str(row["content_hash"]))

    # Arquivos existentes no Drive sem vetores precisam aparecer explicitamente
    # na matriz: não são "ausentes", são pendências da sincronização.
    for drive_id, file_info in live_drive_by_id.items():
        source = source_by_drive_id.get(drive_id)
        if source is None:
            source = f"(Drive sem vetores) {file_info.get('name') or drive_id}"
            grouped.setdefault(source, empty_item(source))["drive_ids"].add(drive_id)
            source_by_drive_id[drive_id] = source
        if file_info.get("drive_path"):
            grouped[source]["drive_paths"].add(str(file_info["drive_path"]))

    for drive_id, manifest in manifest_by_id.items():
        if drive_id in source_by_drive_id:
            continue
        source = f"(Manifest sem vetores) {manifest.get('name') or drive_id}"
        grouped.setdefault(source, empty_item(source))["drive_ids"].add(drive_id)
        source_by_drive_id[drive_id] = source

    for source in grouped:
        normalized_groups.setdefault(normalized_source(source), []).append(source)

    output_rows = []
    for source, item in sorted(grouped.items(), key=lambda pair: pair[0].lower()):
        peers = [peer for peer in normalized_groups[normalized_source(source)] if peer != source]
        drive_ids = sorted(item["drive_ids"])
        manifest_states = sorted(
            {
                str(manifest_by_id[drive_id].get("status"))
                for drive_id in drive_ids
                if drive_id in manifest_by_id
            }
        )
        job_states = sorted(
            {
                f"{job_by_id[drive_id].get('action')}:{job_by_id[drive_id].get('status')}"
                for drive_id in drive_ids
                if drive_id in job_by_id
            }
        )
        overlap = item["legacy_hashes"] & item["managed_hashes"]
        overlap_ratio = (
            len(overlap) / max(1, min(len(item["legacy_hashes"]), len(item["managed_hashes"])))
            if item["legacy_hashes"] and item["managed_hashes"]
            else 0.0
        )
        live_drive_ids = [drive_id for drive_id in drive_ids if drive_id in live_drive_by_id]
        missing_from_drive_ids = [drive_id for drive_id in drive_ids if drive_id not in live_drive_by_id]
        manifest_missing_ids = [drive_id for drive_id in drive_ids if drive_id not in manifest_by_id]
        manifest_without_drive_ids = [
            drive_id
            for drive_id in drive_ids
            if drive_id in manifest_by_id and drive_id not in live_drive_by_id
        ]

        if item["staging"] > 0:
            classification = "PENDENTE_DE_CONFIRMAÇÃO"
            decision = "Aguardar conclusão atômica do job; staging não é pesquisável."
        elif live_drive_ids and item["total"] == 0:
            classification = "PENDENTE_DE_CONFIRMAÇÃO"
            decision = "Arquivo existe no Drive, mas não possui vetores; reconciliar fila e worker."
        elif missing_from_drive_ids and item["searchable"] > 0:
            classification = "PENDENTE_DE_CONFIRMAÇÃO"
            decision = "Vetores ativos sem arquivo vivo no Drive; confirmar remoção antes de excluir fisicamente."
        elif item["searchable"] > 0 and item["legacy"] == 0:
            classification = "ATIVO"
            decision = "Manter pesquisável; validar inventário e conteúdo."
        elif item["searchable"] > 0 and item["legacy"] > 0:
            classification = "DUPLICADO"
            decision = "Manter somente a versão rastreável; legado segue em quarentena até backup físico."
        elif item["legacy"] > 0 and peers:
            classification = "PENDENTE_DE_CONFIRMAÇÃO"
            decision = "Possível duplicata por nome normalizado; comparar conteúdo com os pares antes de excluir."
        elif item["legacy"] > 0:
            classification = "PENDENTE_DE_CONFIRMAÇÃO"
            decision = "Legado sem identidade do Drive; permanece em quarentena."
        else:
            classification = "FORA_DO_ESCOPO"
            decision = "Sem chunks utilizáveis; revisar origem."

        output_rows.append(
            {
                "source": source,
                "normalized_source": normalized_source(source),
                "classification": classification,
                "decision": decision,
                "total_chunks": item["total"],
                "searchable_chunks": item["searchable"],
                "legacy_quarantined_chunks": item["legacy"],
                "staging_chunks": item["staging"],
                "drive_file_ids": " | ".join(drive_ids),
                "drive_paths": " | ".join(sorted(item["drive_paths"])),
                "live_drive_file_ids": " | ".join(live_drive_ids),
                "missing_from_live_drive_ids": " | ".join(missing_from_drive_ids),
                "manifest_missing_ids": " | ".join(manifest_missing_ids),
                "manifest_without_live_drive_ids": " | ".join(manifest_without_drive_ids),
                "manifest_states": " | ".join(manifest_states),
                "job_states": " | ".join(job_states),
                "same_normalized_name_peers": " | ".join(peers),
                "exact_chunk_hash_overlap": len(overlap),
                "exact_chunk_overlap_ratio": f"{overlap_ratio:.4f}",
                "legacy_fingerprint_sha256": digest(item["legacy_hashes"]),
                "managed_fingerprint_sha256": digest(item["managed_hashes"]),
            }
        )

    args.csv.parent.mkdir(parents=True, exist_ok=True)
    with args.csv.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(output_rows[0]))
        writer.writeheader()
        writer.writerows(output_rows)

    class_counts: dict[str, int] = {}
    for row in output_rows:
        class_counts[row["classification"]] = class_counts.get(row["classification"], 0) + 1

    summary = [
        "# Resumo da matriz de reconciliação da Fase 1",
        "",
        "Status: **gerado automaticamente; decisões pendentes exigem revisão documental**.",
        "",
        f"- Fontes distintas na tabela `documents`: {len(output_rows)}",
        f"- Registros no manifesto: {len(manifests)}",
        f"- Arquivos no inventário vivo do Drive: {len(live_drive_by_id) if args.drive_json else 'não informado'}",
        f"- Jobs registrados: {len(jobs)}",
        f"- Chunks totais observados: {len(document_rows)}",
        f"- Chunks pesquisáveis: {sum(row['searchable_chunks'] for row in output_rows)}",
        f"- Chunks legados em quarentena: {sum(row['legacy_quarantined_chunks'] for row in output_rows)}",
        f"- Chunks em staging: {sum(row['staging_chunks'] for row in output_rows)}",
        f"- Arquivos do Drive sem vetores: {sum(1 for row in output_rows if row['live_drive_file_ids'] and row['total_chunks'] == 0)}",
        f"- Fontes com vetores ativos sem arquivo vivo: {sum(1 for row in output_rows if row['missing_from_live_drive_ids'] and row['searchable_chunks'] > 0)}",
        "",
        "## Fontes por classificação",
        "",
    ]
    summary.extend(f"- {key}: {value}" for key, value in sorted(class_counts.items()))
    summary.extend(
        [
            "",
            "A classificação automática nunca autoriza exclusão física. Linhas `PENDENTE_DE_CONFIRMAÇÃO` devem ser comparadas com o arquivo do Drive e com o conteúdo do cliente.",
            "",
            f"Matriz detalhada: `{args.csv.name}`",
        ]
    )
    args.summary.write_text("\n".join(summary) + "\n", encoding="utf-8")
    print(json.dumps({"csv": str(args.csv.resolve()), "summary": str(args.summary.resolve()), "sources": len(output_rows), "classifications": class_counts}, ensure_ascii=False))


if __name__ == "__main__":
    main()
