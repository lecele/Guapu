BEGIN;

-- Um arquivo grande não deve monopolizar a fila depois de uma falha ou
-- expiração de lease. O tamanho vem do inventário do Drive; valores ausentes
-- ficam por último para preservar a previsibilidade.
CREATE OR REPLACE FUNCTION public.claim_drive_sync_job(
    p_worker_id TEXT,
    p_lease_seconds INTEGER DEFAULT 1800
)
RETURNS SETOF public.drive_sync_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.drive_sync_jobs
    SET
        status = 'failed',
        worker_id = NULL,
        lease_expires_at = NULL,
        last_error = COALESCE(last_error || E'\n', '') ||
            'Limite de tentativas atingido após expiração do lease.',
        updated_at = now()
    WHERE status = 'running'
      AND lease_expires_at < now()
      AND attempts >= max_attempts;

    RETURN QUERY
    WITH candidate AS (
        SELECT id
        FROM public.drive_sync_jobs
        WHERE (
                status = 'queued'
                OR (status = 'running' AND lease_expires_at < now())
              )
          AND attempts < max_attempts
        ORDER BY
            CASE
                WHEN NULLIF(file_info->>'size', '') ~ '^[0-9]+$'
                    THEN (file_info->>'size')::BIGINT
                ELSE 9223372036854775807
            END,
            created_at,
            id
        FOR UPDATE SKIP LOCKED
        LIMIT 1
    ), claimed AS (
        UPDATE public.drive_sync_jobs AS job
        SET
            status = 'running',
            worker_id = p_worker_id,
            attempts = job.attempts + 1,
            started_at = now(),
            lease_expires_at = now() + make_interval(secs => p_lease_seconds),
            updated_at = now()
        FROM candidate
        WHERE job.id = candidate.id
        RETURNING job.*
    )
    SELECT * FROM claimed;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_drive_sync_job(TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_drive_sync_job(TEXT, INTEGER) TO service_role;

COMMIT;
