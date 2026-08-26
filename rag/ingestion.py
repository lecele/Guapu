"""
rag/ingestion.py — Pipeline de Ingestion de Documentos PDF.

Fluxo completo:
  Drive (bytes)
      │
      ▼
  extract_text_from_pdf()   ← pdfplumber: extração de texto por página
      │
      ▼
  chunk_text()              ← RecursiveCharacterTextSplitter (LangChain)
      │
      ▼
  embed_chunks()            ← GoogleGenerativeAIEmbeddings (text-embedding-004)
      │
      ▼
  upsert_chunks_to_supabase() ← INSERT com ON CONFLICT (idempotente)
      │
      ▼
  IngestionResult (stats)

Orquestrador principal:
  ingest_pdf_from_bytes()   ← Chamado pelo webhook ou pela rota /admin/ingest
  ingest_all_from_drive()   ← Varre toda a pasta do Drive (sync inicial)
"""

from __future__ import annotations

import sys
try:
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
except Exception:
    pass

import hashlib
import io
import zipfile
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

import pdfplumber
import structlog
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.embeddings import Embeddings
from tenacity import retry, stop_after_attempt, wait_exponential

from config import get_settings
from db.supabase_client import get_supabase_client
from rag.graph import _get_embeddings
from rag.sync_plan import chunk_record_id, plan_drive_sync, select_file_batch

logger = structlog.get_logger(__name__)


# ==============================================================================
# 1. RESULTADO DA INGESTION
# ==============================================================================

@dataclass
class IngestionResult:
    """Relatório de resultado de uma operação de ingestion."""
    file_name: str
    file_id: str
    total_pages: int = 0
    total_chunks: int = 0
    chunks_inserted: int = 0
    chunks_skipped: int = 0       # Já existiam no banco (deduplicação)
    chunks_removed: int = 0
    action: str = "processed"
    status: str = "active"
    errors: list[str] = field(default_factory=list)
    success: bool = True

    @property
    def summary(self) -> str:
        status = (
            "FALHOU"
            if not self.success
            else "AVISO"
            if self.status == "unsupported"
            else "OK"
        )
        return (
            f"[{status}] | {self.file_name} | "
            f"{self.total_pages} paginas | "
            f"{self.total_chunks} chunks | "
            f"{self.chunks_inserted} gravados | "
            f"{self.chunks_removed} removidos | "
            f"acao={self.action}"
        )


# ==============================================================================
# 2. EXTRAÇÃO DE TEXTO DO PDF
# ==============================================================================

def extract_text_from_pdf(pdf_bytes: bytes) -> list[dict]:
    """
    Extrai o texto de cada página do PDF usando pdfplumber.

    Args:
        pdf_bytes: Conteúdo binário do PDF.

    Returns:
        Lista de dicts: [{ page_number: int, text: str }]
        Páginas sem texto extraível são omitidas.
    """
    pages = []

    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page_num, page in enumerate(pdf.pages, start=1):
            text = page.extract_text()
            if text and text.strip():
                pages.append({"page_number": page_num, "text": text.strip()})
            else:
                logger.debug("pdf_page_no_text", page=page_num)

    logger.info("pdf_text_extracted", pages_with_text=len(pages))
    return pages


def extract_text_from_docx_bytes(docx_bytes: bytes) -> list[dict]:
    """
    Extrai o texto de um arquivo DOCX (Office Open XML) sem dependencias externas.
    Trata o arquivo inteiro como a pagina 1.
    """
    try:
        buffer = io.BytesIO(docx_bytes)
        with zipfile.ZipFile(buffer) as z:
            xml_content = z.read('word/document.xml')
            root = ET.fromstring(xml_content)
            
            namespaces = {
                'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
            }
            
            paragraphs = []
            for p in root.findall('.//w:p', namespaces):
                p_text = "".join(t.text for t in p.findall('.//w:t', namespaces) if t.text)
                if p_text.strip():
                    paragraphs.append(p_text.strip())
            
            full_text = "\n\n".join(paragraphs)
            logger.info("docx_text_extracted", paragraphs_count=len(paragraphs), total_length=len(full_text))
            
            if full_text.strip():
                return [{"page_number": 1, "text": full_text}]
            return []
    except Exception as e:
        logger.error("docx_extract_error", error=str(e))
        return []


# ==============================================================================
# 3. CHUNKING
# ==============================================================================

def sanitize_text_for_storage(value: str) -> str:
    """Remove caracteres que o PostgreSQL não aceita em campos de texto.

    PDFs e DOCX podem conter o caractere NUL. Ele não tem valor semântico para
    a busca e faz o lote inteiro falhar no PostgREST, por isso é removido antes
    do chunking e do embedding.
    """
    return value.replace(chr(0), "")


def chunk_text(
    pages: list[dict],
    source_name: str,
    chunk_size: int = 1000,
    chunk_overlap: int = 150,
) -> list[dict]:
    """
    Divide o texto das páginas em chunks usando RecursiveCharacterTextSplitter.

    Estratégia: tenta preservar parágrafos → frases → palavras.
    Cada chunk mantém metadados de origem para rastreabilidade acadêmica.

    Args:
        pages:        Lista de páginas com texto (saída de extract_text_from_pdf).
        source_name:  Nome do arquivo de origem (ex: "Manual UTI - 2023.pdf").
        chunk_size:   Tamanho máximo de cada chunk em caracteres.
        chunk_overlap: Sobreposição entre chunks consecutivos.

    Returns:
        Lista de dicts: [{ content, source, page_number, chunk_index, content_hash }]
    """
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        separators=["\n\n", "\n", ". ", " ", ""],
    )

    chunks = []
    global_chunk_index = 0

    safe_source_name = sanitize_text_for_storage(source_name)

    for page in pages:
        page_text = sanitize_text_for_storage(str(page["text"]))
        if not page_text.strip():
            continue
        page_chunks = splitter.split_text(page_text)

        for chunk_text_content in page_chunks:
            # Hash do conteúdo para deduplicação idempotente
            content_hash = hashlib.sha256(
                chunk_text_content.encode("utf-8")
            ).hexdigest()

            chunks.append(
                {
                    "content": chunk_text_content,
                    "source": safe_source_name,
                    "page_number": page["page_number"],
                    "chunk_index": global_chunk_index,
                    "content_hash": content_hash,
                }
            )
            global_chunk_index += 1

    logger.info(
        "text_chunked",
        source=source_name,
        total_chunks=len(chunks),
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
    )
    return chunks


# ==============================================================================
# 4. EMBEDDING + UPSERT NO SUPABASE (com batch e deduplicação)
# ==============================================================================

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    reraise=True,
)
def _embed_batch(texts: list[str], embeddings_model: Embeddings) -> list[list[float]]:
    """
    Gera embeddings para um lote de textos.
    Retry automático em caso de falha da API.
    """
    return embeddings_model.embed_documents(texts)


def upsert_chunks_to_supabase(
    chunks: list[dict],
    file_id: str,
    modified_time: str = "",
    drive_path: str = "",
    batch_size: int = 20,
) -> tuple[int, set[str]]:
    """
    Insere os chunks com seus embeddings no Supabase.

    O ID determinístico combina o ID do arquivo no Drive com o hash do conteúdo.
    Isso preserva a origem quando dois arquivos contêm o mesmo texto.

    Args:
        chunks:     Lista de chunks (saída de chunk_text).
        file_id:    ID do arquivo no Google Drive (para rastreamento).
        batch_size: Número de chunks por lote de embed + insert.

    Returns:
        Tupla (chunks_gravados, ids_atuais).
    """
    if not chunks:
        return 0, set()

    settings = get_settings()
    client = get_supabase_client()
    embeddings_model = _get_embeddings()

    inserted = 0
    current_ids: set[str] = set()
    existing_ids_before = {row["id"] for row in _document_rows_for_file(file_id)}

    # Processa em lotes para respeitar rate limits da API
    for batch_start in range(0, len(chunks), batch_size):
        batch = chunks[batch_start : batch_start + batch_size]
        texts = [c["content"] for c in batch]

        logger.info(
            "ingestion_batch_start",
            batch=f"{batch_start // batch_size + 1}",
            size=len(batch),
        )

        # Gera embeddings para o lote
        try:
            vectors = _embed_batch(texts, embeddings_model)
        except Exception as exc:
            logger.error("ingestion_embed_error", error=str(exc))
            try:
                _delete_document_rows(sorted(current_ids - existing_ids_before))
            except Exception as cleanup_exc:
                logger.error("ingestion_partial_cleanup_error", error=str(cleanup_exc))
            raise RuntimeError(f"Falha ao gerar embeddings: {exc}") from exc

        # Prepara os registros para INSERT
        records = [
            {
                "id": chunk_record_id(
                    file_id,
                    chunk["content_hash"],
                    chunk["page_number"],
                    chunk["chunk_index"],
                ),
                "content": chunk["content"],
                "embedding": vector,
                "source": chunk["source"],
                "metadata": {
                    "page_number": chunk["page_number"],
                    "chunk_index": chunk["chunk_index"],
                    "content_hash": chunk["content_hash"],
                    "drive_file_id": file_id,
                    "drive_modified_time": modified_time,
                    "drive_path": drive_path,
                },
            }
            for chunk, vector in zip(batch, vectors)
        ]

        current_ids.update(record["id"] for record in records)

        try:
            result = (
                client.table(settings.rag_table_name)
                .upsert(records, on_conflict="id", ignore_duplicates=False)
                .execute()
            )
            batch_inserted = len(result.data) if result.data else 0
            inserted += batch_inserted

            logger.info(
                "ingestion_batch_done",
                written=batch_inserted,
            )

        except Exception as exc:
            logger.error("ingestion_upsert_error", error=str(exc))
            try:
                _delete_document_rows(sorted(current_ids - existing_ids_before))
            except Exception as cleanup_exc:
                logger.error("ingestion_partial_cleanup_error", error=str(cleanup_exc))
            raise RuntimeError(f"Falha ao gravar chunks no Supabase: {exc}") from exc

    return inserted, current_ids


def _delete_document_rows(row_ids: list[str], batch_size: int = 200) -> int:
    """Exclui IDs explícitos em lotes pequenos para evitar URLs muito grandes."""
    if not row_ids:
        return 0
    settings = get_settings()
    client = get_supabase_client()
    removed = 0
    for start in range(0, len(row_ids), batch_size):
        batch = row_ids[start : start + batch_size]
        response = client.table(settings.rag_table_name).delete().in_("id", batch).execute()
        removed += len(response.data) if response.data is not None else len(batch)
    return removed


def _document_rows_for_file(file_id: str) -> list[dict]:
    """Busca todos os chunks de um arquivo respeitando o limite do PostgREST."""
    settings = get_settings()
    client = get_supabase_client()
    rows: list[dict] = []
    page_size = 1000
    offset = 0
    while True:
        response = (
            client.table(settings.rag_table_name)
            .select("id,source,metadata")
            .eq("metadata->>drive_file_id", file_id)
            .range(offset, offset + page_size - 1)
            .execute()
        )
        page = response.data or []
        rows.extend(page)
        if len(page) < page_size:
            break
        offset += page_size
    return rows


def _remove_stale_chunks(file_id: str, current_ids: set[str]) -> int:
    existing_ids = {row["id"] for row in _document_rows_for_file(file_id)}
    return _delete_document_rows(sorted(existing_ids - current_ids))


def _remove_legacy_chunks_for_unique_source(file_name: str, file_id: str) -> int:
    """Remove chunks antigos sem drive_file_id após a nova versão estar íntegra."""
    settings = get_settings()
    client = get_supabase_client()
    rows: list[dict] = []
    offset = 0
    page_size = 1000
    while True:
        response = (
            client.table(settings.rag_table_name)
            .select("id,metadata")
            .eq("source", file_name)
            .range(offset, offset + page_size - 1)
            .execute()
        )
        page = response.data or []
        rows.extend(page)
        if len(page) < page_size:
            break
        offset += page_size

    legacy_ids = [
        row["id"]
        for row in rows
        if not (row.get("metadata") or {}).get("drive_file_id")
    ]
    removed = _delete_document_rows(legacy_ids)
    if removed:
        logger.info(
            "ingestion_legacy_chunks_removed",
            file_name=file_name,
            file_id=file_id,
            removed=removed,
        )
    return removed


def _load_drive_manifest() -> list[dict]:
    client = get_supabase_client()
    rows: list[dict] = []
    offset = 0
    page_size = 1000
    while True:
        response = (
            client.table("drive_sync_manifest")
            .select("*")
            .range(offset, offset + page_size - 1)
            .execute()
        )
        page = response.data or []
        rows.extend(page)
        if len(page) < page_size:
            break
        offset += page_size
    return rows


def _manifest_payload(file_info: dict, result: IngestionResult) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    return {
        "drive_file_id": file_info["id"],
        "name": file_info["name"],
        "drive_path": file_info.get("drive_path", file_info["name"]),
        "mime_type": file_info.get("mimeType", "application/octet-stream"),
        "modified_time": file_info.get("modifiedTime") or now,
        "md5_checksum": file_info.get("md5Checksum"),
        "chunks_count": result.total_chunks,
        # O banco em produção diferencia somente itens sincronizados e erros
        # técnicos. Um PDF digitalizado é uma sincronização concluída, porém
        # com aviso em last_error para aparecer no painel sem gerar retentativas.
        "status": "active" if result.success else "error",
        "last_synced_at": now if result.success else None,
        "last_error": (
            None
            if result.success and result.status == "active"
            else "; ".join(result.errors)[:4000]
        ),
        "updated_at": now,
    }


def save_drive_manifest_result(file_info: dict, result: IngestionResult) -> None:
    get_supabase_client().table("drive_sync_manifest").upsert(
        _manifest_payload(file_info, result),
        on_conflict="drive_file_id",
    ).execute()


def _remove_drive_file(file_id: str) -> int:
    """Remove os chunks antes de apagar o manifesto; falhas preservam o rastreio."""
    rows = _document_rows_for_file(file_id)
    removed = _delete_document_rows([row["id"] for row in rows])
    get_supabase_client().table("drive_sync_manifest").delete().eq(
        "drive_file_id", file_id
    ).execute()
    return removed


# ==============================================================================
# 5. ORQUESTRADOR PRINCIPAL — Um arquivo
# ==============================================================================

def ingest_pdf_from_bytes(
    pdf_bytes: bytes,
    file_name: str,
    file_id: str,
    chunk_size: int = 1000,
    chunk_overlap: int = 150,
    modified_time: str = "",
    drive_path: str = "",
    cleanup_legacy_source: bool = False,
) -> IngestionResult:
    """
    Pipeline completo de ingestion para um único PDF.

    Etapas:
        1. Extrai texto por página (pdfplumber)
        2. Divide em chunks sobrepostos (RecursiveCharacterTextSplitter)
        3. Gera embeddings em lotes (text-embedding-004)
        4. Upsert no Supabase com deduplicação por hash

    Args:
        pdf_bytes:     Conteúdo binário do PDF.
        file_name:     Nome do arquivo (usado como source nos metadados).
        file_id:       ID do arquivo no Google Drive.
        chunk_size:    Tamanho máximo dos chunks (padrão: 1000 chars).
        chunk_overlap: Sobreposição entre chunks (padrão: 150 chars).

    Returns:
        IngestionResult com estatísticas completas da operação.
    """
    result = IngestionResult(file_name=file_name, file_id=file_id)

    logger.info("ingestion_start", file_name=file_name, file_id=file_id)

    try:
        # ── Passo 1: Extração de texto ────────────────────────────────────────
        if file_name.lower().endswith(".docx"):
            pages = extract_text_from_docx_bytes(pdf_bytes)
        else:
            pages = extract_text_from_pdf(pdf_bytes)
        result.total_pages = len(pages)

        if not pages:
            # PDFs digitalizados não podem ser pesquisados sem OCR. Não devem
            # interromper a reconciliação inteira, mas também não podem manter
            # chunks de uma versão anterior do mesmo arquivo no RAG.
            result.errors.append(
                "Nenhum texto extraível encontrado; envie uma versão com OCR para indexação."
            )
            result.status = "unsupported"
            result.chunks_removed = _remove_stale_chunks(file_id, set())
            logger.warning(
                "ingestion_no_text",
                file_name=file_name,
                chunks_removed=result.chunks_removed,
            )
            return result

        # ── Passo 2: Chunking ─────────────────────────────────────────────────
        chunks = chunk_text(
            pages,
            source_name=file_name,
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
        )
        result.total_chunks = len(chunks)

        # ── Passo 3 & 4: Embed + Upsert ──────────────────────────────────────
        inserted, current_ids = upsert_chunks_to_supabase(
            chunks,
            file_id=file_id,
            modified_time=modified_time,
            drive_path=drive_path,
            batch_size=get_settings().ingestion_batch_size,
        )
        result.chunks_inserted = inserted
        result.chunks_removed = _remove_stale_chunks(file_id, current_ids)
        if cleanup_legacy_source:
            result.chunks_removed += _remove_legacy_chunks_for_unique_source(file_name, file_id)

    except Exception as exc:
        result.success = False
        result.errors.append(str(exc))
        logger.error("ingestion_failed", file_name=file_name, error=str(exc), exc_info=True)

    logger.info(
        "ingestion_complete",
        summary=result.summary,
        success=result.success,
    )
    return result


# ==============================================================================
# 6. ORQUESTRADOR — Toda a pasta do Drive (sync inicial)
# ==============================================================================

def ingest_all_from_drive() -> list[IngestionResult]:
    """
    Reconcilia a pasta do Drive com o RAG usando um manifesto persistente.
    Arquivos inalterados não geram novos embeddings; alterações substituem chunks
    obsoletos somente depois do novo conteúdo ser gravado; remoções limpam o RAG.

    Returns:
        Lista de IngestionResult, um por arquivo processado.
    """
    from services.drive_service import list_pdf_files, download_pdf

    settings = get_settings()

    if not settings.drive_folder_id:
        raise ValueError("DRIVE_FOLDER_ID não configurado no .env")

    logger.info("ingestion_all_start", folder_id=settings.drive_folder_id)

    files = list_pdf_files(settings.drive_folder_id)

    manifest_rows = _load_drive_manifest()
    plan = plan_drive_sync(files, manifest_rows)
    logger.info(
        "drive_sync_plan",
        new=len(plan.new),
        changed=len(plan.changed),
        unchanged=len(plan.unchanged),
        removed=len(plan.removed),
    )

    results: list[IngestionResult] = [
        IngestionResult(
            file_name=item["name"],
            file_id=item["id"],
            total_chunks=int(
                next(
                    (row.get("chunks_count", 0) for row in manifest_rows if row["drive_file_id"] == item["id"]),
                    0,
                )
            ),
            chunks_skipped=int(
                next(
                    (row.get("chunks_count", 0) for row in manifest_rows if row["drive_file_id"] == item["id"]),
                    0,
                )
            ),
            action="unchanged",
        )
        for item in plan.unchanged
    ]

    name_counts: dict[str, int] = {}
    for current_file in files:
        name_counts[current_file["name"]] = name_counts.get(current_file["name"], 0) + 1

    files_to_process, deferred_files = select_file_batch(
        plan,
        settings.drive_sync_max_files,
    )
    results.extend(
        IngestionResult(
            file_name=file_info["name"],
            file_id=file_info["id"],
            action="deferred",
        )
        for _, file_info in deferred_files
    )

    for action, file_info in files_to_process:
        file_id = file_info["id"]
        file_name = file_info["name"]

        logger.info("ingestion_processing_file", file_name=file_name, file_id=file_id)

        try:
            pdf_bytes = download_pdf(file_id)
            result = ingest_pdf_from_bytes(
                pdf_bytes=pdf_bytes,
                file_name=file_name,
                file_id=file_id,
                modified_time=file_info.get("modifiedTime", ""),
                drive_path=file_info.get("drive_path", file_name),
                cleanup_legacy_source=name_counts[file_name] == 1,
            )
            result.action = action
        except Exception as exc:
            logger.error(
                "ingestion_file_error",
                file_name=file_name,
                file_id=file_id,
                error=str(exc),
            )
            result = IngestionResult(
                file_name=file_name,
                file_id=file_id,
                success=False,
                errors=[str(exc)],
                action=action,
            )

        save_drive_manifest_result(file_info, result)
        results.append(result)

    for manifest_entry in plan.removed:
        file_id = manifest_entry["drive_file_id"]
        try:
            removed_count = _remove_drive_file(file_id)
            results.append(
                IngestionResult(
                    file_name=manifest_entry["name"],
                    file_id=file_id,
                    chunks_removed=removed_count,
                    action="removed",
                )
            )
        except Exception as exc:
            logger.error("drive_sync_remove_error", file_id=file_id, error=str(exc))
            results.append(
                IngestionResult(
                    file_name=manifest_entry["name"],
                    file_id=file_id,
                    success=False,
                    errors=[str(exc)],
                    action="remove_failed",
                )
            )

    total_inserted = sum(r.chunks_inserted for r in results)
    total_chunks = sum(r.total_chunks for r in results)

    logger.info(
        "ingestion_all_complete",
        files_processed=len(results),
        total_chunks=total_chunks,
        total_inserted=total_inserted,
        total_removed=sum(r.chunks_removed for r in results),
        unchanged=len(plan.unchanged),
        deferred=len(deferred_files),
        successful=sum(1 for r in results if r.success),
    )

    return results
