ALTER TABLE public.licenses
  ADD COLUMN IF NOT EXISTS external_product_id text,
  ADD COLUMN IF NOT EXISTS external_subscription_id text;

CREATE INDEX IF NOT EXISTS licenses_external_product_idx
  ON public.licenses (external_product_id);
CREATE INDEX IF NOT EXISTS licenses_external_subscription_idx
  ON public.licenses (external_subscription_id, created_at DESC);

-- Produtos reais da Superlovable. O código-fonte/revenda não gera licença.
DO $$
DECLARE
  item record;
BEGIN
  FOR item IN SELECT * FROM (VALUES
    ('03c254c0-8ce0-4fe7-b378-ea8798e27be8', NULL::text, 'test_30m', 'Teste · 30 minutos', NULL::integer, 30::integer, false),
    ('e5f93c9a-015e-4e10-9c84-331290f21b2c', 'okfncdob1o', 'weekly', 'Semanal · 7 dias', 7, NULL, false),
    ('63428865-119f-4316-a9f1-7e24162ef258', 'fkt54kvcqq', 'monthly', 'Mensal · 30 dias', 30, NULL, false),
    ('6aad4d1b-a84e-4ab2-a819-521452ca1e54', 'swh4m14h19', 'annual', 'Anual · 12 meses', 365, NULL, false),
    ('b979f6cd-1a69-44d5-b20d-498a434823e2', NULL::text, 'lifetime', 'Vitalícia', NULL::integer, NULL::integer, true)
  ) AS values_table(product_id, offer_public_id, plan_code, plan_name, duration_days, duration_minutes, is_lifetime)
  LOOP
    UPDATE public.license_product_mappings
      SET ensinaflix_offer_public_id = item.offer_public_id,
          plan_code = item.plan_code,
          plan_name = item.plan_name,
          duration_days = item.duration_days,
          duration_minutes = item.duration_minutes,
          is_lifetime = item.is_lifetime,
          device_limit = 1,
          is_active = true,
          updated_at = now()
      WHERE provider = 'ensinaflix'
        AND ensinaflix_product_id = item.product_id;

    IF NOT FOUND THEN
      INSERT INTO public.license_product_mappings (
        provider, ensinaflix_product_id, ensinaflix_offer_public_id,
        plan_code, plan_name, duration_days, duration_minutes,
        is_lifetime, device_limit, is_active
      ) VALUES (
        'ensinaflix', item.product_id, item.offer_public_id,
        item.plan_code, item.plan_name, item.duration_days, item.duration_minutes,
        item.is_lifetime, 1, true
      );
    END IF;
  END LOOP;
END $$;

