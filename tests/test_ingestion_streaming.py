from __future__ import annotations

from types import SimpleNamespace

from rag import ingestion


def test_iter_pdf_chunks_keeps_continuous_indexes_with_isolated_windows(monkeypatch):
    pages = [
        {"page_number": 1, "text": "página um"},
        {"page_number": 2, "text": "página dois"},
        {"page_number": 3, "text": "página três"},
        {"page_number": 4, "text": "página quatro"},
    ]
    monkeypatch.setattr(ingestion, "_isolated_pdf_page_count", lambda _path: 4)
    monkeypatch.setattr(
        ingestion,
        "_iter_isolated_pdf_pages",
        lambda _path, _total, _window: iter(pages),
    )
    result = ingestion.IngestionResult(file_name="livro.pdf", file_id="drive-id")

    chunks = list(
        ingestion.iter_pdf_chunks(
            b"pdf",
            "livro.pdf",
            result,
            chunk_size=100,
            chunk_overlap=0,
        )
    )

    assert result.total_pages == 4
    assert [chunk["chunk_index"] for chunk in chunks] == [0, 1, 2, 3]
    assert [chunk["page_number"] for chunk in chunks] == [1, 2, 3, 4]


class _Table:
    def __init__(self):
        self.records = []

    def upsert(self, records, **_kwargs):
        self.records.extend(records)
        return self

    def execute(self):
        return SimpleNamespace(data=self.records[-3:])


class _Client:
    def __init__(self):
        self.target = _Table()
        self.rpc_calls = []

    def table(self, _name):
        return self.target

    def rpc(self, name, payload):
        self.rpc_calls.append((name, payload))
        return SimpleNamespace(execute=lambda: SimpleNamespace(data=[{"activated_count": 7, "removed_count": 2}]))


def test_stream_upsert_processes_bounded_batches(monkeypatch):
    client = _Client()
    batch_sizes = []
    monkeypatch.setattr(ingestion, "get_settings", lambda: SimpleNamespace(rag_table_name="documents"))
    monkeypatch.setattr(ingestion, "get_supabase_client", lambda: client)
    monkeypatch.setattr(ingestion, "_get_embeddings", lambda: object())
    monkeypatch.setattr(ingestion, "_document_rows_for_file", lambda _file_id: [])

    def embed(texts, _model):
        batch_sizes.append(len(texts))
        return [[0.1, 0.2] for _ in texts]

    monkeypatch.setattr(ingestion, "_embed_batch", embed)

    def chunks():
        for index in range(7):
            yield {
                "content": f"conteúdo {index}",
                "content_hash": f"hash-{index}",
                "source": "livro.pdf",
                "page_number": index + 1,
                "chunk_index": index,
                "reference_metadata": {},
            }

    inserted, current_ids, total = ingestion.upsert_chunk_stream_to_supabase(
        chunks(),
        file_id="drive-id",
        batch_size=3,
    )

    assert batch_sizes == [3, 3, 1]
    assert total == 7
    assert len(current_ids) == 7
    assert len(client.target.records) == 7
    assert inserted > 0
    assert {record["metadata"]["rag_status"] for record in client.target.records} == {"staging"}

    removed = ingestion._finalize_document_sync("drive-id", current_ids)
    assert removed == 2
    assert client.rpc_calls[0][0] == "finalize_drive_document_sync"
    assert set(client.rpc_calls[0][1]["p_current_ids"]) == current_ids


def test_stream_upsert_binds_catalog_reference_to_the_same_drive_file(monkeypatch):
    client = _Client()
    file_id = "drive-catalogado"
    monkeypatch.setattr(ingestion, "get_settings", lambda: SimpleNamespace(rag_table_name="documents"))
    monkeypatch.setattr(ingestion, "get_supabase_client", lambda: client)
    monkeypatch.setattr(ingestion, "_get_embeddings", lambda: object())
    monkeypatch.setattr(ingestion, "_document_rows_for_file", lambda _file_id: [])
    monkeypatch.setattr(ingestion, "_embed_batch", lambda texts, _model: [[0.1, 0.2] for _ in texts])
    monkeypatch.setattr(
        ingestion,
        "_load_catalog_reference",
        lambda requested_file_id: {
            "reference_title": "Obra conferida no documento",
            "reference_author": "Autoria conferida",
            "reference_year": "2026",
            "reference_source": "catalog",
            "reference_verified": True,
            "reference_key": requested_file_id,
        },
    )

    inserted, _, total = ingestion.upsert_chunk_stream_to_supabase(
        iter([{
            "content": "Trecho clínico cuja página não repete a folha de rosto.",
            "content_hash": "hash-catalogado",
            "source": "nome-tecnico-que-nao-e-referencia.pdf",
            "page_number": 12,
            "chunk_index": 4,
            "reference_metadata": {"reference_title": "Título extraído não verificado"},
        }]),
        file_id=file_id,
        batch_size=1,
    )

    assert inserted == 1
    assert total == 1
    metadata = client.target.records[0]["metadata"]
    assert metadata["drive_file_id"] == file_id
    assert metadata["reference_key"] == metadata["drive_file_id"]
    assert metadata["reference_source"] == "catalog"
    assert metadata["reference_verified"] is True
    assert metadata["reference_title"] == "Obra conferida no documento"
