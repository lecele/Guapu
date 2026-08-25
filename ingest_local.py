"""
ingest_local.py
Ingere PDFs de uma pasta local (e subpastas) no Supabase.
Use quando nao tiver Service Account configurada para o Google Drive.

Uso:
    python ingest_local.py
    python ingest_local.py --pasta C:\\caminho\\para\\seus\\pdfs
"""

import argparse
import os
import sys
import hashlib
import io

import pdfplumber
import structlog
from langchain.text_splitter import RecursiveCharacterTextSplitter
from services.embeddings_service import Gemini2Embeddings
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

# Logging simples
structlog.configure(processors=[
    structlog.processors.TimeStamper(fmt="iso"),
    structlog.stdlib.add_log_level,
    structlog.dev.ConsoleRenderer(),
])
logger = structlog.get_logger()

# Configuracoes
SUPABASE_URL  = os.getenv("SUPABASE_URL")
SUPABASE_KEY  = os.getenv("SUPABASE_KEY")
GOOGLE_KEY    = os.getenv("GOOGLE_API_KEY")
CHUNK_SIZE    = int(os.getenv("INGESTION_CHUNK_SIZE", "1000"))
CHUNK_OVERLAP = int(os.getenv("INGESTION_CHUNK_OVERLAP", "150"))
BATCH_SIZE    = int(os.getenv("INGESTION_BATCH_SIZE", "20"))
TABLE_NAME    = os.getenv("RAG_TABLE_NAME", "documents")

DEFAULT_PASTA = os.path.join(os.path.dirname(__file__), "documentos")


def get_pdf_files(pasta: str) -> list[str]:
    """Encontra todos os PDFs recursivamente na pasta."""
    pdfs = []
    for root, _, files in os.walk(pasta):
        for f in files:
            if f.lower().endswith(".pdf"):
                pdfs.append(os.path.join(root, f))
    return sorted(pdfs)


def extract_text(pdf_path: str) -> list[dict]:
    """Extrai texto pagina a pagina com pdfplumber."""
    pages = []
    with pdfplumber.open(pdf_path) as pdf:
        for i, page in enumerate(pdf.pages, start=1):
            text = page.extract_text()
            if text and text.strip():
                pages.append({"page_number": i, "text": text.strip()})
    return pages


def chunk_pages(pages: list[dict], source: str) -> list[dict]:
    """Divide em chunks com metadados."""
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        separators=["\n\n", "\n", ". ", " ", ""],
    )
    chunks = []
    idx = 0
    for page in pages:
        for text in splitter.split_text(page["text"]):
            content_hash = hashlib.sha256(text.encode()).hexdigest()
            chunks.append({
                "content": text,
                "source": source,
                "page_number": page["page_number"],
                "chunk_index": idx,
                "content_hash": content_hash,
            })
            idx += 1
    return chunks


def embed_and_insert(chunks: list[dict], client, embeddings_model) -> tuple[int, int]:
    """Gera embeddings e insere no Supabase em lotes."""
    inserted = skipped = 0

    for i in range(0, len(chunks), BATCH_SIZE):
        batch = chunks[i:i + BATCH_SIZE]
        texts = [c["content"] for c in batch]

        try:
            vectors = embeddings_model.embed_documents(texts)
        except Exception as e:
            logger.error("embed_error", error=str(e))
            skipped += len(batch)
            continue

        records = [
            {
                "content": c["content"],
                "embedding": v,
                "source": c["source"],
                "metadata": {
                    "page_number": c["page_number"],
                    "chunk_index": c["chunk_index"],
                    "content_hash": c["content_hash"],
                },
            }
            for c, v in zip(batch, vectors)
        ]

        try:
            client.table(TABLE_NAME).upsert(records, on_conflict="id").execute()
            inserted += len(batch)
            logger.info("batch_inserted", n=len(batch), total=inserted)
        except Exception as e:
            logger.error("insert_error", error=str(e))
            skipped += len(batch)

    return inserted, skipped


def ingest_pdf(pdf_path: str, client, embeddings_model) -> dict:
    source = os.path.basename(pdf_path)
    logger.info("ingesting", file=source)

    pages = extract_text(pdf_path)
    if not pages:
        logger.warning("no_text", file=source)
        return {"file": source, "pages": 0, "chunks": 0, "inserted": 0}

    chunks = chunk_pages(pages, source)
    inserted, skipped = embed_and_insert(chunks, client, embeddings_model)

    result = {
        "file": source,
        "pages": len(pages),
        "chunks": len(chunks),
        "inserted": inserted,
        "skipped": skipped,
    }
    logger.info("done", **result)
    return result


def main():
    parser = argparse.ArgumentParser(description="Ingere PDFs locais no Supabase RAG")
    parser.add_argument("--pasta", default=DEFAULT_PASTA, help="Pasta raiz com os PDFs")
    args = parser.parse_args()

    pasta = args.pasta
    if not os.path.isdir(pasta):
        print(f"[ERRO] Pasta nao encontrada: {pasta}")
        print(f"Crie a pasta e coloque os PDFs la:")
        print(f"  {pasta}")
        sys.exit(1)

    pdfs = get_pdf_files(pasta)
    if not pdfs:
        print(f"[AVISO] Nenhum PDF encontrado em: {pasta}")
        sys.exit(0)

    print(f"\nEncontrados {len(pdfs)} PDFs em: {pasta}")
    for p in pdfs:
        print(f"  - {os.path.relpath(p, pasta)}")

    print(f"\nConectando ao Supabase: {SUPABASE_URL}")
    client = create_client(SUPABASE_URL, SUPABASE_KEY)

    print("Inicializando modelo de embeddings...")
    embeddings_model = Gemini2Embeddings(
        model="models/gemini-embedding-2",
        output_dimensionality=768,
        google_api_key=GOOGLE_KEY,
    )

    print(f"\nIniciando ingestao de {len(pdfs)} arquivo(s)...\n")

    results = []
    for pdf_path in pdfs:
        result = ingest_pdf(pdf_path, client, embeddings_model)
        results.append(result)

    print("\n" + "=" * 60)
    print("RESUMO DA INGESTAO")
    print("=" * 60)
    total_chunks = total_inserted = 0
    for r in results:
        status = "OK" if r["inserted"] > 0 else "VAZIO"
        print(f"[{status}] {r['file']}: {r['pages']} pags, {r['inserted']} chunks inseridos")
        total_chunks += r["chunks"]
        total_inserted += r["inserted"]

    print(f"\nTOTAL: {len(results)} arquivos | {total_chunks} chunks | {total_inserted} inseridos")
    print("=" * 60)


if __name__ == "__main__":
    main()
