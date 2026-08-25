from __future__ import annotations

import google.generativeai as genai
from langchain_core.embeddings import Embeddings
import structlog

logger = structlog.get_logger(__name__)

class Gemini2Embeddings(Embeddings):
    """
    Custom embeddings class to use models/gemini-embedding-2 with custom output_dimensionality.
    Bypasses text-embedding-004 404 errors.
    """
    def __init__(self, model: str = "models/gemini-embedding-2", output_dimensionality: int = 768, google_api_key: str | None = None):
        self.model = model
        self.output_dimensionality = output_dimensionality
        if google_api_key:
            genai.configure(api_key=google_api_key)

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        try:
            res = genai.embed_content(
                model=self.model,
                content=texts,
                output_dimensionality=self.output_dimensionality
            )
            return [item for item in res['embedding']]
        except Exception as e:
            logger.error("gemini_embedding_batch_error", error=str(e))
            # Fallback text by text
            results = []
            for text in texts:
                res = genai.embed_content(
                    model=self.model,
                    content=text,
                    output_dimensionality=self.output_dimensionality
                )
                results.append(res['embedding'])
            return results

    def embed_query(self, text: str) -> list[float]:
        res = genai.embed_content(
            model=self.model,
            content=text,
            output_dimensionality=self.output_dimensionality
        )
        return res['embedding']
