from rag.ingestion import chunk_text, sanitize_text_for_storage


def test_sanitize_text_for_storage_removes_nul_character():
    assert sanitize_text_for_storage("hemo" + chr(0) + "stasia") == "hemostasia"


def test_chunk_text_never_emits_nul_character():
    chunks = chunk_text(
        [{"page_number": 1, "text": "hemo" + chr(0) + "stasia"}],
        "fonte" + chr(0) + ".pdf",
        chunk_size=100,
        chunk_overlap=0,
    )

    assert chunks[0]["content"] == "hemostasia"
    assert chunks[0]["source"] == "fonte.pdf"
