create table if not exists public.github_license_ai_credentials (
  license_id uuid not null references public.licenses(id) on delete cascade,
  provider text not null,
  encrypted_key text not null,
  encryption_iv text not null,
  encryption_tag text not null,
  key_hint text not null,
  model text not null,
  validated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.github_license_ai_credentials
  drop constraint if exists github_license_ai_credentials_provider_check;

alter table public.github_license_ai_credentials
  drop constraint if exists github_license_ai_credentials_pkey;

delete from public.github_license_ai_credentials
where provider not in ('groq', 'gemini');

alter table public.github_license_ai_credentials
  alter column provider drop default,
  alter column model drop default;

alter table public.github_license_ai_credentials
  add constraint github_license_ai_credentials_provider_check
  check (provider in ('groq', 'gemini'));

alter table public.github_license_ai_credentials
  add primary key (license_id, provider);

alter table public.github_license_ai_credentials enable row level security;

comment on table public.github_license_ai_credentials is
  'Credenciais de inteligência artificial criptografadas por licença. Acesso exclusivo pelo servidor.';
