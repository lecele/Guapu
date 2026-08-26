-- Revisão clínica/pedagógica interna. Nunca é exposta no chatbot do estudante.

CREATE TABLE IF NOT EXISTS public.admin_response_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL UNIQUE REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  verdict TEXT NOT NULL CHECK (verdict IN ('correct', 'incomplete', 'incorrect')),
  notes TEXT NOT NULL DEFAULT '',
  reviewer TEXT NOT NULL DEFAULT 'admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS admin_response_reviews_session_idx
  ON public.admin_response_reviews (session_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS admin_response_reviews_verdict_idx
  ON public.admin_response_reviews (verdict, updated_at DESC);

ALTER TABLE public.admin_response_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_admin_response_reviews"
  ON public.admin_response_reviews;

CREATE POLICY "service_role_all_admin_response_reviews"
  ON public.admin_response_reviews
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
