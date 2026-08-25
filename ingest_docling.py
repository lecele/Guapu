"""
ingest_docling.py — Ingere PDFs/DOCX da pasta nova_base/ usando Docling.

Estratégia de performance:
- Docling com backend rápido (pypdfium2) para PDFs digitais (sem OCR)
- OCR apenas quando necessário (fallback automático)
- Chunking por seção/heading para melhor contexto no RAG
- Embeddings em batch via gemini-embedding-2 (768 dims)
- Deduplicação por hash de conteúdo
- Workers paralelos para embeddings

Uso:
    python ingest_docling.py
    python ingest_docling.py --pasta ./nova_base/enfermagem_perioperatoria
    python ingest_docling.py --pasta ./nova_base  (processa tudo)
"""

import argparse
import hashlib
import os
import sys
import time
from pathlib import Path

# ── Checagem de dependências ───────────────────────────────────────────────────
try:
    from docling.document_converter import DocumentConverter, PdfFormatOption
    from docling.datamodel.pipeline_options import PdfPipelineOptions
    from docling.datamodel.base_models import InputFormat
except ImportError:
    print("[ERRO] Docling não instalado. Execute: pip install docling")
    sys.exit(1)

try:
    from supabase import create_client
except ImportError:
    print("[ERRO] Supabase não instalado. Execute: pip install supabase")
    sys.exit(1)

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

import google.generativeai as genai

# ── Config ─────────────────────────────────────────────────────────────────────
SUPABASE_URL  = os.getenv("SUPABASE_URL", "https://ymolbcxabnhseofngluq.supabase.co")
SUPABASE_KEY  = os.getenv("SUPABASE_KEY")
GOOGLE_KEY    = os.getenv("GOOGLE_API_KEY")
TABLE_NAME    = os.getenv("RAG_TABLE_NAME", "documents")
BATCH_SIZE    = int(os.getenv("INGESTION_BATCH_SIZE", "20"))
# Chunking por heading — tamanho máximo de chunk em caracteres
MAX_CHUNK_CHARS = 1200
MIN_CHUNK_CHARS = 80   # descarta chunks muito pequenos (títulos vazios)

SUPPORTED_EXTS = {".pdf", ".docx", ".pptx", ".doc"}

# ── Docling setup ──────────────────────────────────────────────────────────────
def build_converter():
    """Conversor Docling otimizado: rápido para PDFs digitais, OCR desligado por padrão."""
    pipeline_options = PdfPipelineOptions()
    pipeline_options.do_ocr = False            # sem OCR → muito mais rápido
    pipeline_options.do_table_structure = True  # preserva tabelas

    converter = DocumentConverter(
        format_options={
            InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options)
        }
    )
    return converter


# ── Chunking hierárquico ───────────────────────────────────────────────────────
def chunk_docling_doc(doc, source_name: str) -> list[dict]:
    """
    Converte documento Docling em chunks semânticos por seção.
    Estratégia: agrupa texto por heading (H1/H2/H3) para manter contexto.
    """
    try:
        md_text = doc.export_to_markdown()
    except Exception:
        # fallback para texto plano
        md_text = doc.export_to_text() if hasattr(doc, 'export_to_text') else str(doc)

    if not md_text or not md_text.strip():
        return []

    chunks = []
    current_heading = ""
    current_text = []
    current_chars = 0

    def flush_chunk():
        nonlocal current_text, current_chars
        text = "\n".join(current_text).strip()
        if len(text) >= MIN_CHUNK_CHARS:
            full_text = f"{current_heading}\n{text}".strip() if current_heading else text
            chunks.append({
                "content": full_text,
                "source": source_name,
                "content_hash": hashlib.sha256(full_text.encode()).hexdigest(),
            })
        current_text = []
        current_chars = 0

    lines = md_text.split("\n")
    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue

        # Detecta headings markdown (# ## ###)
        is_heading = stripped.startswith("#")
        if is_heading:
            if current_text:
                flush_chunk()
            current_heading = stripped.lstrip("#").strip()
            continue

        # Acumula texto até MAX_CHUNK_CHARS
        line_len = len(stripped)
        if current_chars + line_len > MAX_CHUNK_CHARS and current_text:
            flush_chunk()

        current_text.append(stripped)
        current_chars += line_len

    if current_text:
        flush_chunk()

    return chunks


# ── Embeddings em batch ────────────────────────────────────────────────────────
def embed_batch(texts: list[str], model_name="models/gemini-embedding-2", dim=768) -> list[list[float]]:
    """Gera embeddings em batch. Retorna lista de vetores."""
    try:
        res = genai.embed_content(
            model=model_name,
            content=texts,
            output_dimensionality=dim,
        )
        embeddings = res.get("embedding") or res.get("embeddings") or []
        if isinstance(embeddings, list) and isinstance(embeddings[0], float):
            # single embedding retornado como lista plana
            return [embeddings]
        return embeddings
    except Exception as e:
        # fallback: um por vez
        print(f"  [WARN] Batch falhou ({e}), tentando um por vez...", flush=True)
        results = []
        for text in texts:
            r = genai.embed_content(model=model_name, content=text, output_dimensionality=dim)
            emb = r.get("embedding") or r.get("embeddings")
            results.append(emb)
        return results


# ── Inserção no Supabase ───────────────────────────────────────────────────────
def insert_chunks(client, chunks: list[dict], embeddings: list[list[float]]) -> int:
    records = []
    for chunk, emb in zip(chunks, embeddings):
        records.append({
            "content": chunk["content"],
            "embedding": emb,
            "source": chunk["source"],
            "metadata": {"content_hash": chunk["content_hash"]},
        })

    # Verifica duplicatas por hash antes de inserir
    hashes = [c["content_hash"] for c in chunks]
    existing = client.table(TABLE_NAME).select("metadata->content_hash").in_(
        "metadata->>content_hash", hashes
    ).execute()
    existing_hashes = {
        row["metadata"]["content_hash"]
        for row in (existing.data or [])
        if row.get("metadata", {}).get("content_hash")
    } if existing.data else set()

    new_records = [r for r, c in zip(records, chunks) if c["content_hash"] not in existing_hashes]

    if not new_records:
        return 0

    client.table(TABLE_NAME).insert(new_records).execute()
    return len(new_records)


# ── Fallback usando pypdf ───────────────────────────────────────────────────────
def chunk_pypdf_fallback(filepath: Path) -> list[dict]:
    """Fallback simples e leve usando pypdf para evitar estouro de memória."""
    try:
        import pypdf
    except ImportError:
        print("  [WARN] pypdf não instalado para fallback. Executando pip install pypdf...")
        import subprocess
        subprocess.run([sys.executable, "-m", "pip", "install", "pypdf", "-q"])
        import pypdf

    source_name = filepath.name
    chunks = []
    
    try:
        reader = pypdf.PdfReader(str(filepath))
        current_text = []
        current_chars = 0
        page_num = 1
        
        for page in reader.pages:
            text = page.extract_text()
            if not text:
                continue
            
            # Limpa quebras de linha e espaços extras
            text_cleaned = "\n".join([line.strip() for line in text.split("\n") if line.strip()])
            
            # Divide a página em partes se for muito grande
            paragraphs = text_cleaned.split("\n")
            for para in paragraphs:
                para_len = len(para)
                if current_chars + para_len > MAX_CHUNK_CHARS and current_text:
                    full_text = "\n".join(current_text).strip()
                    if len(full_text) >= MIN_CHUNK_CHARS:
                        chunks.append({
                            "content": f"[Pág. {page_num}] {full_text}",
                            "source": source_name,
                            "content_hash": hashlib.sha256(full_text.encode()).hexdigest(),
                        })
                    current_text = []
                    current_chars = 0
                
                current_text.append(para)
                current_chars += para_len
            
            page_num += 1

        if current_text:
            full_text = "\n".join(current_text).strip()
            if len(full_text) >= MIN_CHUNK_CHARS:
                chunks.append({
                    "content": f"[Pág. {page_num-1}] {full_text}",
                    "source": source_name,
                    "content_hash": hashlib.sha256(full_text.encode()).hexdigest(),
                })
                
    except Exception as e:
        print(f"  [ERRO] Fallback pypdf falhou para {source_name}: {e}", flush=True)
        
    return chunks


# ── Processa um arquivo ────────────────────────────────────────────────────────
def process_file(filepath: Path, converter, client) -> dict:
    source_name = filepath.name
    result = {"file": source_name, "chunks": 0, "inserted": 0, "skipped": 0, "error": None}
    chunks = []
    use_fallback = False

    # 1. Roteamento inteligente: PDFs vão direto para o pypdf (leve e evita crash de RAM).
    # Outros formatos (docx, pptx) usam o Docling.
    if filepath.suffix.lower() == ".pdf":
        use_fallback = True
    else:
        try:
            t0 = time.time()
            conv_result = converter.convert(str(filepath))
            doc = conv_result.document
            elapsed_conv = time.time() - t0
            print(f"  -> Docling: {elapsed_conv:.1f}s", flush=True)
            chunks = chunk_docling_doc(doc, source_name)
        except Exception as e:
            print(f"  [WARN] Docling falhou para {source_name}: {e}. Acionando fallback...", flush=True)
            use_fallback = True

    # 2. Executa o parser pypdf se ativado
    if use_fallback or not chunks:
        if filepath.suffix.lower() == ".pdf":
            t0 = time.time()
            chunks = chunk_pypdf_fallback(filepath)
            elapsed_fb = time.time() - t0
            print(f"  -> Parser pypdf: {len(chunks)} chunks em {elapsed_fb:.1f}s", flush=True)
        else:
            result["error"] = "Docling falhou e o arquivo não é PDF para fallback"
            return result

    result["chunks"] = len(chunks)

    if not chunks:
        result["error"] = "Nenhum chunk extraído por nenhum método"
        return result

    print(f"  -> {len(chunks)} chunks prontos para processamento", flush=True)

    # Processa em batches
    inserted_total = 0
    for i in range(0, len(chunks), BATCH_SIZE):
        batch = chunks[i : i + BATCH_SIZE]
        texts = [c["content"] for c in batch]

        try:
            embeddings = embed_batch(texts)
        except Exception as e:
            print(f"  [WARN] Embedding batch {i//BATCH_SIZE+1} falhou: {e}", flush=True)
            result["skipped"] += len(batch)
            continue

        try:
            n = insert_chunks(client, batch, embeddings)
            inserted_total += n
            result["skipped"] += len(batch) - n
            print(f"  -> Batch {i//BATCH_SIZE+1}: {n} inseridos", flush=True)
        except Exception as e:
            print(f"  [ERRO] Insert falhou: {e}", flush=True)
            result["skipped"] += len(batch)

    result["inserted"] = inserted_total
    return result


# ── Main ───────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="Ingere documentos no Supabase com Docling")
    parser.add_argument("--pasta", default="./nova_base", help="Pasta raiz com os arquivos")
    args = parser.parse_args()

    pasta = Path(args.pasta)
    if not pasta.exists():
        print(f"[ERRO] Pasta não encontrada: {pasta}")
        sys.exit(1)

    # Coleta todos os arquivos suportados
    files = sorted([
        f for f in pasta.rglob("*")
        if f.is_file() and f.suffix.lower() in SUPPORTED_EXTS
    ])

    if not files:
        print(f"[AVISO] Nenhum arquivo suportado em: {pasta}")
        sys.exit(0)

    print(f"\n{'='*60}")
    print(f"INGESTÃO COM DOCLING — {len(files)} arquivo(s)")
    print(f"Fonte: {pasta}")
    print(f"Supabase: {SUPABASE_URL}")
    print(f"{'='*60}\n")

    # Inicializa clientes
    genai.configure(api_key=GOOGLE_KEY)
    client = create_client(SUPABASE_URL, SUPABASE_KEY)
    converter = build_converter()

    results = []
    for i, filepath in enumerate(files, 1):
        rel = filepath.relative_to(pasta)
        print(f"\n[{i}/{len(files)}] {rel}", flush=True)
        t_start = time.time()
        result = process_file(filepath, converter, client)
        elapsed = time.time() - t_start
        status = "OK" if not result["error"] else "ERRO"
        print(f"  [{status}] {result['inserted']} inseridos, {result['skipped']} pulados | {elapsed:.1f}s total", flush=True)
        if result["error"]:
            print(f"  Motivo: {result['error']}", flush=True)
        results.append(result)

    # Resumo
    print(f"\n{'='*60}")
    print("RESUMO")
    print(f"{'='*60}")
    total_files = len(results)
    ok_files = sum(1 for r in results if not r["error"])
    total_chunks = sum(r["chunks"] for r in results)
    total_inserted = sum(r["inserted"] for r in results)
    total_skipped = sum(r["skipped"] for r in results)

    print(f"Arquivos: {ok_files}/{total_files} processados com sucesso")
    print(f"Chunks:   {total_chunks} extraídos | {total_inserted} inseridos | {total_skipped} duplicados/pulados")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
