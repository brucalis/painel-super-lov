-- Recupera a primeira ativacao das licencas criadas antes de
-- activation_started_at existir. O evento e a fonte principal; o primeiro
-- dispositivo registrado e usado apenas como fallback.
-- A repeticao defensiva garante a atualizacao mesmo se a migration anterior
-- ainda nao tiver sido aplicada no ambiente publicado.
ALTER TABLE public.licenses
  ADD COLUMN IF NOT EXISTS activation_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS duration_minutes integer;

WITH inferred_duration AS (
  SELECT
    l.id,
    COALESCE(
      l.duration_minutes,
      CASE
        WHEN lower(COALESCE(l.plan, '')) IN ('test', 'test_30m')
          OR lower(COALESCE(l.plan_name, '')) LIKE '%30 minuto%' THEN 30
        WHEN lower(COALESCE(l.plan, '')) IN ('weekly', 'week', '7_days')
          OR lower(COALESCE(l.plan_name, '')) LIKE '%7 dia%' THEN 7 * 1440
        WHEN lower(COALESCE(l.plan, '')) IN ('monthly', 'month', '30_days')
          OR lower(COALESCE(l.plan_name, '')) LIKE '%30 dia%'
          OR lower(COALESCE(l.plan_name, '')) LIKE '%mensal%' THEN 30 * 1440
        WHEN lower(COALESCE(l.plan, '')) IN ('annual', 'yearly', '12_months')
          OR lower(COALESCE(l.plan_name, '')) LIKE '%12 mes%'
          OR lower(COALESCE(l.plan_name, '')) LIKE '%anual%' THEN 365 * 1440
        ELSE NULL
      END
    ) AS duration_minutes
  FROM public.licenses l
  WHERE NOT COALESCE(l.is_lifetime, false)
    AND lower(COALESCE(l.plan, '')) NOT LIKE '%lifetime%'
    AND lower(COALESCE(l.plan, '')) NOT LIKE '%vital%'
    AND lower(COALESCE(l.plan, '')) NOT LIKE '%admin%'
    AND lower(COALESCE(l.plan, '')) NOT LIKE '%revend%'
),
first_activation_event AS (
  SELECT license_id, MIN(created_at) AS activated_at
  FROM public.license_events
  WHERE license_id IS NOT NULL
    AND (
      type = 'activation.success'
      OR lower(COALESCE(message, '')) LIKE 'dispositivo ativado%'
    )
  GROUP BY license_id
),
first_device AS (
  SELECT license_id, MIN(first_seen_at) AS activated_at
  FROM public.license_devices
  GROUP BY license_id
),
recovered AS (
  SELECT
    l.id,
    d.duration_minutes,
    COALESCE(l.activation_started_at, e.activated_at, dv.activated_at) AS activated_at
  FROM public.licenses l
  JOIN inferred_duration d ON d.id = l.id
  LEFT JOIN first_activation_event e ON e.license_id = l.id
  LEFT JOIN first_device dv ON dv.license_id = l.id
  WHERE d.duration_minutes IS NOT NULL
)
UPDATE public.licenses AS l
SET
  duration_minutes = r.duration_minutes,
  activation_started_at = r.activated_at,
  expires_at = r.activated_at + (r.duration_minutes * interval '1 minute')
FROM recovered r
WHERE l.id = r.id
  AND r.activated_at IS NOT NULL;

NOTIFY pgrst, 'reload schema';
