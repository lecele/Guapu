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
import uuid
from dataclasses import dataclass, field
from typing import Optional

import pdfplumber
import structlog
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from tenacity import retry, stop_after_attempt, wait_exponential

from config import get_settings
from db.supabase_client import get_supabase_client
from rag.graph import _get_embeddings

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
    errors: list[str] = field(default_factory=list)
    success: bool = True

    @property
    def summary(self) -> str:
        status = "OK" if self.success else "FALHOU"
        return (
            f"[{status}] | {self.file_name} | "
            f"{self.total_pages} paginas | "
            f"{self.total_chunks} chunks | "
            f"{self.chunks_inserted} inseridos | "
            f"{self.chunks_skipped} duplicados"
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

    for page in pages:
        page_chunks = splitter.split_text(page["text"])

        for chunk_text_content in page_chunks:
            # Hash do conteúdo para deduplicação idempotente
            content_hash = hashlib.sha256(
                chunk_text_content.encode("utf-8")
            ).hexdigest()

            chunks.append(
                {
                    "content": chunk_text_content,
                    "source": source_name,
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
def _embed_batch(texts: list[str], embeddings_model: GoogleGenerativeAIEmbeddings) -> list[list[float]]:
    """
    Gera embeddings para um lote de textos.
    Retry automático em caso de falha da API.
    """
    return embeddings_model.embed_documents(texts)


def upsert_chunks_to_supabase(
    chunks: list[dict],
    file_id: str,
    batch_size: int = 20,
) -> tuple[int, int]:
    """
    Insere os chunks com seus embeddings no Supabase.

    Estratégia de deduplicação: usa `content_hash` como chave única.
    Se o chunk já existir (mesmo hash), ignora (ON CONFLICT DO NOTHING).

    Args:
        chunks:     Lista de chunks (saída de chunk_text).
        file_id:    ID do arquivo no Google Drive (para rastreamento).
        batch_size: Número de chunks por lote de embed + insert.

    Returns:
        Tupla (chunks_inseridos, chunks_ignorados).
    """
    if not chunks:
        return 0, 0

    settings = get_settings()
    client = get_supabase_client()
    embeddings_model = _get_embeddings()

    inserted = 0
    skipped = 0

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
            skipped += len(batch)
            continue

        # Prepara os registros para INSERT
        records = [
            {
                "id": str(uuid.uuid5(uuid.NAMESPACE_DNS, chunk["content_hash"])),
                "content": chunk["content"],
                "embedding": vector,
                "source": chunk["source"],
                "metadata": {
                    "page_number": chunk["page_number"],
                    "chunk_index": chunk["chunk_index"],
                    "content_hash": chunk["content_hash"],
                    "drive_file_id": file_id,
                },
            }
            for chunk, vector in zip(batch, vectors)
        ]

        # Upsert: ignora duplicatas por ID determinístico gerado a partir do content_hash
        try:
            result = (
                client.table(settings.rag_table_name)
                .upsert(records, on_conflict="id", ignore_duplicates=True)
                .execute()
            )
            batch_inserted = len(result.data) if result.data else 0
            batch_skipped = len(batch) - batch_inserted
            inserted += batch_inserted
            skipped += batch_skipped

            logger.info(
                "ingestion_batch_done",
                inserted=batch_inserted,
                skipped=batch_skipped,
            )

        except Exception as exc:
            logger.error("ingestion_upsert_error", error=str(exc))
            skipped += len(batch)

    return inserted, skipped


# ==============================================================================
# 5. ORQUESTRADOR PRINCIPAL — Um arquivo
# ==============================================================================

def ingest_pdf_from_bytes(
    pdf_bytes: bytes,
    file_name: str,
    file_id: str,
    chunk_size: int = 1000,
    chunk_overlap: int = 150,
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
            result.errors.append("Nenhum texto extraível encontrado no arquivo.")
            result.success = False
            logger.warning("ingestion_no_text", file_name=file_name)
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
        inserted, skipped = upsert_chunks_to_supabase(chunks, file_id=file_id)
        result.chunks_inserted = inserted
        result.chunks_skipped = skipped

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
    Varre toda a pasta do Google Drive e ingere todos os PDFs encontrados.

    Usado para a sincronização inicial da base de conhecimento.
    Arquivos já processados são ignorados automaticamente (deduplicação por hash).

    Returns:
        Lista de IngestionResult, um por arquivo processado.
    """
    from services.drive_service import list_pdf_files, download_pdf

    settings = get_settings()

    if not settings.drive_folder_id:
        raise ValueError("DRIVE_FOLDER_ID não configurado no .env")

    logger.info("ingestion_all_start", folder_id=settings.drive_folder_id)

    files = list_pdf_files(settings.drive_folder_id)

    if not files:
        logger.warning("ingestion_no_files_found", folder_id=settings.drive_folder_id)
        return []

    results = []

    for file_info in files:
        file_id = file_info["id"]
        file_name = file_info["name"]

        logger.info("ingestion_processing_file", file_name=file_name, file_id=file_id)

        try:
            pdf_bytes = download_pdf(file_id)
            result = ingest_pdf_from_bytes(
                pdf_bytes=pdf_bytes,
                file_name=file_name,
                file_id=file_id,
            )
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
            )

        results.append(result)

    total_inserted = sum(r.chunks_inserted for r in results)
    total_chunks = sum(r.total_chunks for r in results)

    logger.info(
        "ingestion_all_complete",
        files_processed=len(results),
        total_chunks=total_chunks,
        total_inserted=total_inserted,
        successful=sum(1 for r in results if r.success),
    )

    return results
