"""Extração conservadora de dados bibliográficos presentes no documento."""

from __future__ import annotations

import re
import unicodedata


_CITATION = re.compile(
    r"(?m)^\s*([A-ZÀ-Ý][A-Za-zÀ-ÿ'’.-]+(?:\s+(?:[A-ZÀ-Ý][A-Za-zÀ-ÿ'’.-]+|de|da|do|dos|das)){0,5})\s*\(?((?:19|20)\d{2})\)?[.,]\s*(.{12,180})$"
)
_CHAPTER = re.compile(r"(?im)^\s*(?:cap[ií]tulo|cap\.)\s*(\d+)?\s*[-—–:.]\s*(.{8,180})$")
_BLOCKED_COVER_LINES = re.compile(
    r"(?:dire[cç][aã]o editorial|revis[aã]o acad[eê]mica|projeto gr[aá]fico|"
    r"diagrama[cç][aã]o|copyright|todos os direitos|isbn|sum[aá]rio|ficha catalogr[aá]fica)",
    re.IGNORECASE,
)
_TITLE_SIGNALS = {
    "anestesia", "cardiologia", "cirurgia", "cirurgico", "cuidados", "diagnosticos",
    "enfermagem", "ferida", "guideline", "guidelines", "guia", "infection",
    "nutricao", "prevention", "surgical", "terapia", "tratamento",
}


def propose_cover_title(text: str) -> str:
    """Extrai título de capa sem recorrer ao nome do arquivo."""
    # Mantemos a pontuação neste ponto: ela distingue título de capa de texto
    # corrido. A limpeza tipográfica só ocorre depois, no candidato aceito.
    raw_lines = [re.sub(r"\s+", " ", line).strip() for line in text.splitlines()]
    lines = [line for line in raw_lines if line and len(line) >= 3][:36]
    best = (0, "")
    for start in range(len(lines)):
        parts: list[str] = []
        for line in lines[start:start + 4]:
            if _BLOCKED_COVER_LINES.search(line) or line.lower().startswith(("para acessar", "acesso em", "http", "www.")):
                break
            # Frase pontuada após um título é apresentação do documento, não
            # continuação do título de capa.
            if parts and line.endswith((".", "!", "?")):
                break
            if len(line) > 100 or not re.search(r"[A-Za-zÀ-ÿ]{3}", line):
                break
            parts.append(line)
            candidate = " ".join(parts).strip(" .:;,-")
            words = re.findall(r"[A-Za-zÀ-ÿ]{3,}", candidate)
            if not 3 <= len(words) <= 18 or not 12 <= len(candidate) <= 180:
                continue
            normalized_words = {
                "".join(char for char in unicodedata.normalize("NFKD", word.lower()) if not unicodedata.combining(char))
                for word in words
            }
            letters = [char for char in candidate if char.isalpha()]
            uppercase_ratio = sum(char.isupper() for char in letters) / max(1, len(letters))
            title_case_words = sum(word[:1].isupper() for word in words) / len(words)
            score = 4 * len(normalized_words & _TITLE_SIGNALS)
            score += 2 if uppercase_ratio >= 0.60 else 0
            score += 2 if title_case_words >= 0.60 else 0
            score -= 5 if candidate.count(",") >= 2 else 0
            if score > best[0]:
                best = (score, candidate)
    return best[1] if best[0] >= 5 else ""


def extract_reference_metadata(pages: list[dict]) -> dict[str, str]:
    """Extrai apenas pistas bibliográficas contidas nas primeiras páginas."""
    text = "\n".join(str(page.get("text", "")) for page in pages[:3]).replace(chr(0), "")
    citation = _CITATION.search(text)
    if citation:
        return {
            "reference_author": citation.group(1).strip(),
            "reference_year": citation.group(2),
            "reference_title": citation.group(3).strip().rstrip(". "),
        }
    chapter = _CHAPTER.search(text)
    if chapter:
        result = {"reference_title": chapter.group(2).strip().rstrip(". ")}
        if chapter.group(1):
            result["reference_section"] = f"Cap. {chapter.group(1)}"
        return result
    # Títulos de capa exigem validação adicional: PDFs frequentemente iniciam
    # com créditos, DOI ou ficha catalográfica. A proposta pode ser analisada
    # pela rotina de auditoria, mas nunca é gravada automaticamente.
    return {}
