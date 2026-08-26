-- Registro compacto das verificações automáticas de disponibilidade.
-- Não armazena mensagens de estudantes, documentos ou credenciais.

CREATE TABLE IF NOT EXISTS public.system_health_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  component text NOT NULL CHECK (component IN ('supabase', 'drive_sync', 'quality_worker')),
  status text NOT NULL CHECK (status IN ('healthy', 'warning', 'critical')),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  checked_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS system_health_checks_component_checked_at_idx
  ON public.system_health_checks (component, checked_at DESC);

ALTER TABLE public.system_health_checks ENABLE ROW LEVEL SECURITY;
