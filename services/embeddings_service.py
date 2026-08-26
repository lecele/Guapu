from __future__ import annotations

from typing import Any

from google import genai
from google.genai import types
from langchain_core.embeddings import Embeddings
import structlog

logger = structlog.get_logger(__name__)

class Gemini2Embeddings(Embeddings):
    """
    Adaptador LangChain para Gemini Embedding 2.

    A ingestão e a consulta devem usar a mesma dimensão. Não há fallback para
    uma chamada por texto: quando um lote falha, o chamador aplica retry ao
    lote inteiro e preserva a consistência do documento.
    """
    def __init__(
        self,
        model: str = "gemini-embedding-2",
        output_dimensionality: int = 768,
        google_api_key: str | None = None,
        client: Any | None = None,
    ):
        self.model = model
        self.output_dimensionality = output_dimensionality
        self.client = client or genai.Client(api_key=google_api_key)

    def _embed(self, texts: list[str], task_type: str) -> list[list[float]]:
        if not texts:
            return []

        response = self.client.models.embed_content(
            model=self.model,
            # Strings são interpretadas pelo SDK como um único Content em
            # algumas versões. Content explícito preserva um embedding por
            # trecho e evita associar o vetor de um chunk ao texto errado.
            contents=[
                types.Content(parts=[types.Part.from_text(text=text)])
                for text in texts
            ],
            config=types.EmbedContentConfig(
                taskType=task_type,
                outputDimensionality=self.output_dimensionality,
            ),
        )
        vectors = [list(embedding.values or []) for embedding in response.embeddings or []]

        if len(vectors) != len(texts):
            raise RuntimeError(
                f"EMBEDDING_COUNT_MISMATCH: esperados={len(texts)} recebidos={len(vectors)}"
            )
        if any(len(vector) != self.output_dimensionality for vector in vectors):
            raise RuntimeError(
                "EMBEDDING_DIMENSION_MISMATCH: "
                f"esperada={self.output_dimensionality} "
                f"recebidas={[len(vector) for vector in vectors]}"
            )
        return vectors

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        try:
            return self._embed(texts, task_type="RETRIEVAL_DOCUMENT")
        except Exception as error:
            logger.error("gemini_embedding_batch_error", size=len(texts), error=str(error))
            raise

    def embed_query(self, text: str) -> list[float]:
        return self._embed([text], task_type="RETRIEVAL_QUERY")[0]
