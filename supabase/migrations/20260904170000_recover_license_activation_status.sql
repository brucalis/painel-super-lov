-- Recupera o instante real de ativacao sem alterar prazo, situacao ou dispositivos.
-- Eventos de sucesso sao a fonte principal; o primeiro dispositivo e o fallback.
WITH first_activation_event AS (
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
    COALESCE(e.activated_at, d.activated_at, l.last_validated_at) AS activated_at
  FROM public.licenses l
  LEFT JOIN first_activation_event e ON e.license_id = l.id
  LEFT JOIN first_device d ON d.license_id = l.id
  WHERE l.activation_started_at IS NULL
)
UPDATE public.licenses AS l
SET activation_started_at = r.activated_at
FROM recovered r
WHERE l.id = r.id
  AND r.activated_at IS NOT NULL;

NOTIFY pgrst, 'reload schema';
