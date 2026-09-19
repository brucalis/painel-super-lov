-- Ativa SMTP/Brevo como único provedor transacional.
-- A senha SMTP permanece exclusivamente nos Secrets/Environment Variables.
insert into public.app_settings (key, value, updated_at)
values
  ('email_provider', 'smtp', now()),
  ('email_enabled', 'true', now())
on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at;

insert into public.app_settings (key, value, updated_at)
select 'email_reply_to', value, now() from public.app_settings where key = 'sendgrid_reply_to'
on conflict (key) do nothing;
insert into public.app_settings (key, value, updated_at)
select 'email_subject_template', value, now() from public.app_settings where key = 'sendgrid_subject_template'
on conflict (key) do nothing;
insert into public.app_settings (key, value, updated_at)
select 'email_body_template', value, now() from public.app_settings where key = 'sendgrid_body_template'
on conflict (key) do nothing;
insert into public.app_settings (key, value, updated_at)
select 'email_download_url', value, now() from public.app_settings where key = 'sendgrid_download_url'
on conflict (key) do nothing;

insert into public.app_settings (key, value, updated_at)
values ('sendgrid_enabled', 'false', now())
on conflict (key) do update set value = 'false', updated_at = now();

delete from public.app_settings where key = 'sendgrid_api_key';
