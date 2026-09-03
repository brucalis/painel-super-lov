create table if not exists public.github_license_ai_credentials (
  license_id uuid primary key references public.licenses(id) on delete cascade,
  provider text not null default 'openai' check (provider = 'openai'),
  encrypted_key text not null,
  encryption_iv text not null,
  encryption_tag text not null,
  key_hint text not null,
  model text not null default 'gpt-5-mini',
  validated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.github_license_ai_credentials enable row level security;

comment on table public.github_license_ai_credentials is
  'Credenciais OpenAI BYOK criptografadas por licença. Acesso exclusivo pelo servidor com service role.';
