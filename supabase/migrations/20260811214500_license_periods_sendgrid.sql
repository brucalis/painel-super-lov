-- Permite ofertas curtas (teste de 30 minutos) sem arredondar para um dia.
ALTER TABLE public.license_product_mappings
  ADD COLUMN IF NOT EXISTS duration_minutes integer;

ALTER TABLE public.license_product_mappings
  ADD CONSTRAINT license_mapping_duration_positive
  CHECK (duration_minutes IS NULL OR duration_minutes > 0) NOT VALID;

COMMENT ON COLUMN public.license_product_mappings.duration_minutes IS
  'Duração exata para ofertas inferiores a um dia; tem prioridade sobre duration_days.';
