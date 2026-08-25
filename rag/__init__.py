"""
rag/__init__.py — Exportações públicas do módulo RAG.
"""

from .graph import build_crag_graph, GraphState
from .ingestion import ingest_pdf_from_bytes, ingest_all_from_drive, IngestionResult

__all__ = [
    "build_crag_graph",
    "GraphState",
    "ingest_pdf_from_bytes",
    "ingest_all_from_drive",
    "IngestionResult",
]
