-- Avaliação automática assíncrona: nunca bloqueia a resposta enviada ao estudante.

CREATE TABLE IF NOT EXISTS public.response_quality_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  request_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
  attempts SMALLINT NOT NULL DEFAULT 0,
  max_attempts SMALLINT NOT NULL DEFAULT 3,
  lease_expires_at TIMESTAMPTZ,
  score SMALLINT CHECK (score BETWEEN 0 AND 100),
  verdict TEXT CHECK (verdict IN ('correct', 'incomplete', 'incorrect', 'unverifiable')),
  grounding_score SMALLINT CHECK (grounding_score BETWEEN 0 AND 100),
  completeness_score SMALLINT CHECK (completeness_score BETWEEN 0 AND 100),
  relevance_score SMALLINT CHECK (relevance_score BETWEEN 0 AND 100),
  rationale TEXT,
  evaluator_model TEXT,
  source_count SMALLINT NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE (session_id, request_id)
);

CREATE INDEX IF NOT EXISTS response_quality_evaluations_status_idx
  ON public.response_quality_evaluations (status, created_at);

CREATE OR REPLACE FUNCTION public.enqueue_response_quality_evaluation(
  p_session_id TEXT,
  p_request_id UUID
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE evaluation_id UUID;
BEGIN
  INSERT INTO public.response_quality_evaluations (session_id, request_id)
  VALUES (p_session_id, p_request_id)
  ON CONFLICT (session_id, request_id) DO UPDATE SET updated_at = NOW()
  RETURNING id INTO evaluation_id;
  RETURN evaluation_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_response_quality_evaluation(
  p_worker_id TEXT,
  p_lease_seconds INTEGER DEFAULT 900
) RETURNS SETOF public.response_quality_evaluations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH candidate AS (
    SELECT id
    FROM public.response_quality_evaluations
    WHERE status = 'queued'
       OR (status = 'running' AND lease_expires_at < NOW())
    ORDER BY created_at
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  UPDATE public.response_quality_evaluations AS evaluation
  SET status = 'running',
      attempts = evaluation.attempts + 1,
      lease_expires_at = NOW() + make_interval(secs => p_lease_seconds),
      updated_at = NOW(),
      last_error = NULL
  FROM candidate
  WHERE evaluation.id = candidate.id
  RETURNING evaluation.*;
END;
$$;

ALTER TABLE public.response_quality_evaluations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_response_quality_evaluations"
  ON public.response_quality_evaluations;

CREATE POLICY "service_role_all_response_quality_evaluations"
  ON public.response_quality_evaluations
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
