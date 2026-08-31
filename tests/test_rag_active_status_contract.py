from pathlib import Path


MIGRATION = (
    Path(__file__).resolve().parents[1]
    / "db"
    / "migrations"
    / "041_repair_legacy_managed_rag_status_and_retrieval.sql"
)


def test_legacy_managed_chunks_remain_compatible_without_mass_rewrite() -> None:
    sql = MIGRATION.read_text(encoding="utf-8")

    assert "não altera embeddings, conteúdo ou metadados em massa" in sql
    assert "WHEN document_metadata ? 'drive_file_id'" in sql
    assert "NULLIF(document_metadata->>'drive_file_id', '') IS NOT NULL" in sql
    assert "UPDATE public.documents" not in sql


def test_retrieval_contract_accepts_managed_null_status_but_excludes_unmanaged_rows() -> None:
    sql = MIGRATION.read_text(encoding="utf-8")

    assert "CREATE OR REPLACE FUNCTION public.rag_document_is_active" in sql
    assert "WHEN document_metadata ? 'drive_file_id'" in sql
    assert "THEN 'active'" in sql
    assert "ELSE 'quarantined'" in sql
    assert "CREATE OR REPLACE FUNCTION public.match_documents(" in sql
    assert "CREATE OR REPLACE FUNCTION public.match_documents_filtered(" in sql
    assert sql.count("public.rag_document_is_active(d.metadata)") == 2
    assert "lower(d.source) = lower(source_pattern)" in sql
