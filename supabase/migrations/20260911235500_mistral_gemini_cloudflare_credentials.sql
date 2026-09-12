alter table public.github_license_ai_credentials
  drop constraint if exists github_license_ai_credentials_provider_check;

alter table public.github_license_ai_credentials
  add constraint github_license_ai_credentials_provider_check
  check (provider in ('mistral', 'gemini', 'cloudflare'));

-- OpenRouter deixa de fazer parte do stack comercial ativo.
delete from public.github_license_ai_credentials
where provider not in ('mistral', 'gemini', 'cloudflare');

comment on table public.github_license_ai_credentials is
  'Credenciais criptografadas por licença para o stack comercial Mistral, Gemini e Cloudflare.';
