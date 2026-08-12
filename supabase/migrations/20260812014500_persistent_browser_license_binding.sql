ALTER TABLE public.license_devices
  ADD COLUMN IF NOT EXISTS installation_id text;

CREATE UNIQUE INDEX IF NOT EXISTS license_devices_installation_unique
  ON public.license_devices (license_id, installation_id)
  WHERE installation_id IS NOT NULL;

COMMENT ON COLUMN public.license_devices.installation_id IS
  'Identificador persistente do perfil do navegador, usado para reconhecer reinstalações sem consumir uma nova vaga.';
