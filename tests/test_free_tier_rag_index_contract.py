from pathlib import Path


MIGRATION = (
    Path(__file__).resolve().parents[1]
    / "db"
    / "migrations"
    / "042_compact_free_tier_rag_indexes.sql"
)


def test_free_tier_migration_replaces_full_size_indexes() -> None:
    sql = MIGRATION.read_text(encoding="utf-8")

    assert "DROP INDEX IF EXISTS public.idx_documents_content_fts_simple" in sql
    assert "DROP INDEX IF EXISTS public.documents_active_embedding_hnsw_idx" in sql
    assert "idx_documents_active_content_fts_simple_gist" in sql
    assert "documents_active_embedding_half_ivfflat_idx" in sql
    assert "embedding::halfvec(768)" in sql
    assert "halfvec_cosine_ops" in sql


def test_halfvec_candidates_are_reranked_with_original_vectors() -> None:
    sql = MIGRATION.read_text(encoding="utf-8")

    assert sql.count("query_embedding::halfvec(768)") == 2
    assert sql.count("1 - (c.embedding <=> query_embedding)") >= 3
    assert "SET ivfflat.probes = 128" in sql
    assert "public.rag_document_is_active(d.metadata)" in sql
