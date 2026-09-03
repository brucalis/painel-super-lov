alter table public.github_license_ai_credentials
  drop constraint if exists github_license_ai_credentials_provider_check;

alter table public.github_license_ai_credentials
  drop constraint if exists github_license_ai_credentials_pkey;

delete from public.github_license_ai_credentials where provider = 'openai';

alter table public.github_license_ai_credentials
  add constraint github_license_ai_credentials_provider_check
  check (provider in ('groq', 'gemini'));

alter table public.github_license_ai_credentials
  add primary key (license_id, provider);

alter table public.github_license_ai_credentials
  alter column model drop default;

comment on table public.github_license_ai_credentials is
  'Credenciais BYOK Groq e Gemini criptografadas por licença. Acesso exclusivo pelo servidor.';
