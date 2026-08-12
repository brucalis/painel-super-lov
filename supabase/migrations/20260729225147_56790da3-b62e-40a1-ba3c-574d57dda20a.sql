CREATE TABLE public.webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'ensinaflix',
  event_key text NOT NULL,
  event_type text,
  event_label text,
  order_id text,
  customer_email text,
  payload jsonb,
  is_test boolean NOT NULL DEFAULT false,
  environment text NOT NULL DEFAULT 'production',
  processing_status text NOT NULL DEFAULT 'received',
  processing_error text,
  http_status integer,
  duration_ms integer,
  license_id uuid REFERENCES public.licenses(id) ON DELETE SET NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX webhook_events_provider_event_key_idx ON public.webhook_events (provider, event_key);
CREATE INDEX webhook_events_received_at_idx ON public.webhook_events (received_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.webhook_events TO authenticated;
GRANT ALL ON public.webhook_events TO service_role;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage webhook events" ON public.webhook_events
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.license_product_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'ensinaflix',
  ensinaflix_product_id text,
  ensinaflix_offer_id text,
  ensinaflix_offer_public_id text,
  plan_code text NOT NULL,
  plan_name text NOT NULL,
  duration_days integer,
  is_lifetime boolean NOT NULL DEFAULT false,
  device_limit integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX license_product_mappings_lookup_idx
  ON public.license_product_mappings (provider, ensinaflix_product_id, ensinaflix_offer_public_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.license_product_mappings TO authenticated;
GRANT ALL ON public.license_product_mappings TO service_role;
ALTER TABLE public.license_product_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage product mappings" ON public.license_product_mappings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER webhook_events_touch BEFORE UPDATE ON public.webhook_events
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER license_product_mappings_touch BEFORE UPDATE ON public.license_product_mappings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();