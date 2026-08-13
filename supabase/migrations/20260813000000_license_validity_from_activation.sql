ALTER TABLE public.licenses
  ADD COLUMN IF NOT EXISTS activation_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS duration_minutes integer;

ALTER TABLE public.licenses
  DROP CONSTRAINT IF EXISTS licenses_duration_minutes_positive;

ALTER TABLE public.licenses
  ADD CONSTRAINT licenses_duration_minutes_positive
  CHECK (duration_minutes IS NULL OR duration_minutes > 0) NOT VALID;

COMMENT ON COLUMN public.licenses.activation_started_at IS
  'Primeira ativação que iniciou a contagem da validade da licença.';

COMMENT ON COLUMN public.licenses.duration_minutes IS
  'Duração contratada em minutos; expires_at é definido na primeira ativação.';

-- Faz o PostgREST reconhecer imediatamente as novas colunas. Sem isso, uma
-- publicacao pode exibir "column ... not found in the schema cache" por alguns
-- minutos mesmo depois da migration terminar.
NOTIFY pgrst, 'reload schema';
