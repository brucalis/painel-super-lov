CREATE TABLE public.watermark_removal_requests (
  id uuid primary key default gen_random_uuid(),
  license_id uuid references public.licenses(id) on delete set null,
  device_id text not null,
  project_id text not null,
  result_code text not null,
  ok boolean not null default false,
  mechanism text,
  error text,
  created_at timestamptz not null default now()
);
CREATE INDEX idx_wm_requests_license_created ON public.watermark_removal_requests (license_id, created_at desc);
CREATE INDEX idx_wm_requests_project ON public.watermark_removal_requests (project_id, created_at desc);
GRANT ALL ON public.watermark_removal_requests TO service_role;
ALTER TABLE public.watermark_removal_requests ENABLE ROW LEVEL SECURITY;