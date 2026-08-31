"""Audita PDFs originais do Drive por sinais bibliográficos, sem escrever no RAG."""
from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

IDS = [
    "1uC-_-TFRVx4pPW90wwfm0nS8CzkzdcMY",
    "1a0YMt3q7p70f5iFaX_qQJ1RHouEvalYA",
    "1_VSuj-wh7VOliXi2M_7idLkb1jEAk5Yn",
    "1Tm4GYvbkUYo315CYRF4ssgWIoAdjIC-H",
    "1-y2_9a53d0ArQgLc4_PtZ22yBECV3rzN",
    "12iLd6ulHIxM8yw9h501KqZt5OYyXVbtT",
    "1nAnS9Lgf5Ywwv43xtoq369StrZQaTTIU",
    "1a42jr8rEqtm-Z_4JJcUAQ1iXayt-nQrT",
    "1tlLGjy3H7HybRDJfw7UqUxbmA2SrcVdQ",
    "1DlFt-yq4yEtwCfTbQ1tbesx4SBIaFFMt",
    "12E3zeZALF2fXu7Axkq-bPbqqGi8PpkLa",
]


def load_env(path: str) -> None:
    for raw in open(path, encoding="utf-8"):
        line = raw.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            os.environ[key.strip()] = value.strip().strip('"').strip("'")


def main() -> None:
    load_env("/etc/guapu/worker.env")
    sys.path.insert(0, "/opt/guapu")
    from services.drive_service import download_pdf, get_drive_service

    # Inicializa explicitamente para falhar antes de qualquer download se a conta não tiver acesso.
    get_drive_service()
    rows = []
    with tempfile.TemporaryDirectory(prefix="guapu-audit-six-") as tmp:
        for file_id in IDS:
            pdf = download_pdf(file_id)
            path = Path(tmp) / (file_id + ".pdf")
            path.write_bytes(pdf)
            text_path = path.with_suffix(".txt")
            subprocess.run(["pdftotext", "-layout", str(path), str(text_path)], check=True)
            if file_id == "1uLOguHlm-IuiJ7nqv-j7m1u7bKPTm3cx":
                subprocess.run(["pdftoppm", "-f", "1", "-l", "1", "-png", "-r", "120", str(path), "/opt/guapu-app/backups/20260830-catalog-106/cardio-cover"], check=True)
            text = text_path.read_text(encoding="utf-8", errors="replace")
            compact = " ".join(text.split())
            markers = {
                "references_heading": any(x in text.lower() for x in ("referências", "referencias", "references")),
                "bibliographic_record": any(x in text.lower() for x in ("isbn", "issn", "doi", "ficha catalográfica", "ficha catalografica", "como citar", "published by")),
                "authors_signal": any(x in text.lower() for x in ("autores", "organizadores", "organizers", "direção editorial", "direcao editorial")),
                "publisher_signal": any(x in text.lower() for x in ("editora", "publisher", "universidade", "manole", "sobecc")),
            }
            terms = ("isbn", "ficha catalog", "catalogação", "catalogacao", "copyright", "referências", "referencias", "bibliografia", "editora", "©")
            term_contexts = {}
            lower = text.lower()
            for term in terms:
                index = lower.find(term.lower())
                if index >= 0:
                    term_contexts[term] = " ".join(text[max(0, index - 250):index + 900].split())
            rows.append({
                "drive_file_id": file_id,
                "bytes": len(pdf),
                "sha256": hashlib.sha256(pdf).hexdigest(),
                "text_chars": len(text),
                "markers": markers,
                "first_1800": compact[:1800],
                "early_7000": compact[:7000],
                "last_1800": compact[-1800:],
                "reference_contexts": [compact[max(0, i - 160):i + 500] for i in [compact.lower().find("referências"), compact.lower().find("referencias"), compact.lower().find("references")] if i >= 0][:3],
                "term_contexts": term_contexts,
            })
    print(json.dumps(rows, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
