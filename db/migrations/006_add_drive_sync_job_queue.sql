BEGIN;

CREATE TABLE IF NOT EXISTS public.drive_sync_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    drive_file_id TEXT NOT NULL UNIQUE,
    action TEXT NOT NULL CHECK (action IN ('new', 'changed', 'removed')),
    file_info JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 10),
    worker_id TEXT,
    lease_expires_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS drive_sync_jobs_claim_idx
    ON public.drive_sync_jobs (status, lease_expires_at, created_at);

ALTER TABLE public.drive_sync_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.drive_sync_jobs FROM anon, authenticated;
GRANT ALL ON TABLE public.drive_sync_jobs TO service_role;

CREATE OR REPLACE FUNCTION public.enqueue_drive_sync_job(
    p_drive_file_id TEXT,
    p_action TEXT,
    p_file_info JSONB
)
RETURNS public.drive_sync_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    queued_job public.drive_sync_jobs;
BEGIN
    INSERT INTO public.drive_sync_jobs (drive_file_id, action, file_info)
    VALUES (p_drive_file_id, p_action, p_file_info)
    ON CONFLICT (drive_file_id) DO UPDATE
    SET
        action = EXCLUDED.action,
        file_info = EXCLUDED.file_info,
        status = CASE
            WHEN public.drive_sync_jobs.status = 'running' THEN 'running'
            ELSE 'queued'
        END,
        last_error = CASE
            WHEN public.drive_sync_jobs.status = 'running' THEN public.drive_sync_jobs.last_error
            ELSE NULL
        END,
        updated_at = now()
    RETURNING * INTO queued_job;

    RETURN queued_job;
END;
$$;

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
    RETURN QUERY
    WITH candidate AS (
        SELECT id
        FROM public.drive_sync_jobs
        WHERE status = 'queued'
           OR (status = 'running' AND lease_expires_at < now())
        ORDER BY created_at
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

REVOKE ALL ON FUNCTION public.enqueue_drive_sync_job(TEXT, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_drive_sync_job(TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_drive_sync_job(TEXT, TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_drive_sync_job(TEXT, INTEGER) TO service_role;

COMMIT;
