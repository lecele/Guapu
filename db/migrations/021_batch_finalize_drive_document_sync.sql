-- Finaliza arquivos grandes em lotes para não estourar o statement_timeout ao
-- transformar milhares de chunks staging em ativos e atualizar o índice vetorial.
-- A função só é chamada depois que o extrator terminou todos os chunks; portanto,
-- a ativação em lotes não expõe uma carga parcial ao RAG.

BEGIN;

CREATE OR REPLACE FUNCTION public.finalize_drive_document_sync(
    p_drive_file_id TEXT,
    p_current_ids UUID[]
)
RETURNS TABLE (activated_count INTEGER, removed_count INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '120s'
AS $$
DECLARE
    v_activated INTEGER := 0;
    v_removed INTEGER := 0;
    v_batch INTEGER;
BEGIN
    IF NULLIF(p_drive_file_id, '') IS NULL
       OR COALESCE(cardinality(p_current_ids), 0) = 0 THEN
        RAISE EXCEPTION 'A finalização exige drive_file_id e ao menos um chunk atual';
    END IF;

    -- A alteração do metadata ativa o registro no índice parcial do RAG. Em
    -- lotes de 500 reduzimos lock, memória e custo de atualização do HNSW.
    LOOP
        WITH batch AS MATERIALIZED (
            SELECT d.ctid
            FROM public.documents AS d
            WHERE d.metadata->>'drive_file_id' = p_drive_file_id
              AND d.id = ANY(p_current_ids)
              AND COALESCE(d.metadata->>'rag_status', 'active') <> 'active'
            LIMIT 500
        )
        UPDATE public.documents AS d
        SET metadata = jsonb_set(
            COALESCE(d.metadata, '{}'::jsonb),
            '{rag_status}',
            '"active"'::jsonb,
            true
        )
        FROM batch
        WHERE d.ctid = batch.ctid;

        GET DIAGNOSTICS v_batch = ROW_COUNT;
        v_activated := v_activated + v_batch;
        EXIT WHEN v_batch = 0;
    END LOOP;

    -- Remove versões antigas e sobras de tentativas anteriores sem carregar
    -- milhares de linhas em uma única operação.
    LOOP
        WITH batch AS MATERIALIZED (
            SELECT d.ctid
            FROM public.documents AS d
            WHERE d.metadata->>'drive_file_id' = p_drive_file_id
              AND NOT (d.id = ANY(p_current_ids))
            LIMIT 500
        )
        DELETE FROM public.documents AS d
        USING batch
        WHERE d.ctid = batch.ctid;

        GET DIAGNOSTICS v_batch = ROW_COUNT;
        v_removed := v_removed + v_batch;
        EXIT WHEN v_batch = 0;
    END LOOP;

    RETURN QUERY SELECT v_activated, v_removed;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_drive_document_sync(TEXT, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_drive_document_sync(TEXT, UUID[]) TO service_role;

COMMIT;
