"""Converte um PDF escaneado em Markdown com OCR página a página.

O conversor mantém cabeçalhos ``# Página N`` para que a ingestão preserve a
rastreabilidade da página original no RAG.
"""

from __future__ import annotations

import argparse
import re
import subprocess
import tempfile
from pathlib import Path


def page_count(pdf_path: Path) -> int:
    result = subprocess.run(
        ["pdfinfo", str(pdf_path)],
        check=True,
        capture_output=True,
        text=True,
    )
    match = re.search(r"^Pages:\s+(\d+)$", result.stdout, re.MULTILINE)
    if not match:
        raise RuntimeError("pdfinfo não informou a quantidade de páginas")
    return int(match.group(1))


def ocr_page(pdf_path: Path, page_number: int, temp_dir: Path) -> str:
    image_prefix = temp_dir / f"page-{page_number:04d}"
    subprocess.run(
        [
            "pdftoppm",
            "-f",
            str(page_number),
            "-l",
            str(page_number),
            "-r",
            "220",
            "-png",
            "-singlefile",
            str(pdf_path),
            str(image_prefix),
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        text=True,
    )
    image_path = image_prefix.with_suffix(".png")
    try:
        result = subprocess.run(
            ["tesseract", str(image_path), "stdout", "-l", "por+eng", "--psm", "3"],
            check=True,
            capture_output=True,
            text=True,
        )
        return result.stdout.replace("\f", "").strip()
    finally:
        image_path.unlink(missing_ok=True)


def convert(pdf_path: Path, markdown_path: Path) -> tuple[int, int]:
    total_pages = page_count(pdf_path)
    markdown_path.parent.mkdir(parents=True, exist_ok=True)
    pages_with_text = 0
    with tempfile.TemporaryDirectory(prefix="guapu-ocr-") as temp_name:
        temp_dir = Path(temp_name)
        with markdown_path.open("w", encoding="utf-8", newline="\n") as output:
            output.write(f"# {pdf_path.stem}\n\n")
            for page_number in range(1, total_pages + 1):
                text = ocr_page(pdf_path, page_number, temp_dir)
                output.write(f"# Página {page_number}\n\n")
                if text:
                    pages_with_text += 1
                    output.write(text)
                    output.write("\n\n")
                output.flush()
                print(
                    f"ocr_page={page_number}/{total_pages} "
                    f"text={'yes' if text else 'no'}",
                    flush=True,
                )
    return total_pages, pages_with_text


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input_pdf", type=Path)
    parser.add_argument("output_markdown", type=Path)
    args = parser.parse_args()
    total_pages, pages_with_text = convert(args.input_pdf, args.output_markdown)
    print(
        f"ocr_complete=1 pages={total_pages} pages_with_text={pages_with_text} "
        f"output={args.output_markdown}"
    )


if __name__ == "__main__":
    main()
