import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from services.embeddings_service import Gemini2Embeddings


class FakeModels:
    def __init__(self, vectors):
        self.vectors = vectors
        self.calls = []

    def embed_content(self, **kwargs):
        self.calls.append(kwargs)
        return SimpleNamespace(
            embeddings=[SimpleNamespace(values=vector) for vector in self.vectors]
        )


class Gemini2EmbeddingsTests(unittest.TestCase):
    def test_document_batch_preserves_order_and_uses_document_task(self):
        models = FakeModels([[0.1, 0.2], [0.3, 0.4]])
        embeddings = Gemini2Embeddings(
            output_dimensionality=2,
            client=SimpleNamespace(models=models),
        )

        result = embeddings.embed_documents(["primeiro", "segundo"])

        self.assertEqual(result, [[0.1, 0.2], [0.3, 0.4]])
        self.assertEqual(len(models.calls), 1)
        sent_contents = models.calls[0]["contents"]
        self.assertEqual(len(sent_contents), 2)
        self.assertEqual(sent_contents[0].parts[0].text, "primeiro")
        self.assertEqual(sent_contents[1].parts[0].text, "segundo")
        self.assertEqual(models.calls[0]["config"].task_type, "RETRIEVAL_DOCUMENT")

    def test_query_uses_query_task(self):
        models = FakeModels([[0.1, 0.2]])
        embeddings = Gemini2Embeddings(
            output_dimensionality=2,
            client=SimpleNamespace(models=models),
        )

        self.assertEqual(embeddings.embed_query("pergunta"), [0.1, 0.2])
        self.assertEqual(models.calls[0]["config"].task_type, "RETRIEVAL_QUERY")

    def test_incomplete_batch_fails_without_per_text_fallback(self):
        models = FakeModels([[0.1, 0.2]])
        embeddings = Gemini2Embeddings(
            output_dimensionality=2,
            client=SimpleNamespace(models=models),
        )

        with self.assertRaisesRegex(RuntimeError, "EMBEDDING_COUNT_MISMATCH"):
            embeddings.embed_documents(["primeiro", "segundo"])

        self.assertEqual(len(models.calls), 1)


if __name__ == "__main__":
    unittest.main()
