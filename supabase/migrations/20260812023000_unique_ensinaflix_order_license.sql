-- Uma compra da Ensinaflix pode emitir vários eventos, mas representa uma só licença.
-- Preserva registros antigos duplicados como revogados e garante idempotência no banco.
WITH duplicates AS (
  SELECT id, order_id,
    row_number() OVER (PARTITION BY order_id ORDER BY created_at ASC, id ASC) AS position
  FROM public.licenses
  WHERE source = 'ensinaflix' AND order_id IS NOT NULL
)
UPDATE public.licenses AS license
SET status = 'revoked',
    order_id = license.order_id || ':duplicada:' || license.id::text
FROM duplicates
WHERE license.id = duplicates.id AND duplicates.position > 1;

CREATE UNIQUE INDEX IF NOT EXISTS licenses_ensinaflix_order_unique
  ON public.licenses (order_id)
  WHERE source = 'ensinaflix' AND order_id IS NOT NULL;
