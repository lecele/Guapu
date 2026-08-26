-- Torna cada avaliação de satisfação rastreável à resposta que o estudante viu.
ALTER TABLE public.feedback_ratings
  ADD COLUMN IF NOT EXISTS request_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS feedback_ratings_session_request_unique
  ON public.feedback_ratings (session_id, request_id)
  WHERE request_id IS NOT NULL;
