"""Extrai pequenas janelas de um PDF em um processo descartável.

O pdfplumber/pdfminer mantém caches internos que podem crescer em livros grandes.
Este módulo é chamado por ``rag.ingestion`` em subprocessos curtos para que o
sistema operacional devolva toda a memória após cada janela de páginas.
"""

from __future__ import annotations

import argparse
import json
import sys

import pdfplumber


def _write(payload: dict) -> None:
    print(json.dumps(payload, ensure_ascii=False), flush=True)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf_path")
    parser.add_argument("--count", action="store_true")
    parser.add_argument("--start", type=int)
    parser.add_argument("--end", type=int)
    args = parser.parse_args()

    try:
        with pdfplumber.open(args.pdf_path) as pdf:
            total_pages = len(pdf.pages)
            if args.count:
                _write({"total_pages": total_pages})
                return 0

            if not args.start or not args.end:
                raise ValueError("--start e --end são obrigatórios para extração")
            if args.start < 1 or args.end < args.start:
                raise ValueError("intervalo de páginas inválido")

            final_page = min(args.end, total_pages)
            for page_number in range(args.start, final_page + 1):
                page = pdf.pages[page_number - 1]
                text = page.extract_text() or ""
                _write({"page_number": page_number, "text": text.strip()})
                flush_cache = getattr(page, "flush_cache", None)
                if callable(flush_cache):
                    flush_cache()
        return 0
    except Exception as exc:
        _write({"error": f"{type(exc).__name__}: {exc}"})
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
