create table if not exists public.email_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subject text not null,
  body text not null,
  audience_status text not null default 'all',
  audience_plan text,
  status text not null default 'queued' check (status in ('draft','queued','sending','completed','failed','cancelled')),
  recipients_total integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  skipped_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.email_campaign_deliveries (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.email_campaigns(id) on delete cascade,
  license_id uuid references public.licenses(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  recipient_email text not null,
  recipient_name text,
  purpose text not null default 'campaign',
  step_key text,
  dedupe_key text not null unique,
  subject text not null,
  body text not null,
  status text not null default 'queued' check (status in ('queued','processing','sent','failed','skipped','cancelled')),
  scheduled_for timestamptz not null default now(),
  accepted_at timestamptz,
  error text,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.email_suppressions (
  email text primary key,
  reason text not null default 'unsubscribe',
  created_at timestamptz not null default now()
);

create index if not exists email_deliveries_queue_idx
  on public.email_campaign_deliveries (status, scheduled_for);
create index if not exists email_deliveries_campaign_idx
  on public.email_campaign_deliveries (campaign_id, created_at desc);
create index if not exists email_deliveries_license_idx
  on public.email_campaign_deliveries (license_id, created_at desc);

grant select, insert, update, delete on public.email_campaigns to authenticated;
grant select, insert, update, delete on public.email_campaign_deliveries to authenticated;
grant select, insert, delete on public.email_suppressions to authenticated;
grant all on public.email_campaigns to service_role;
grant all on public.email_campaign_deliveries to service_role;
grant all on public.email_suppressions to service_role;

alter table public.email_campaigns enable row level security;
alter table public.email_campaign_deliveries enable row level security;
alter table public.email_suppressions enable row level security;

create policy "email_campaigns_admin_all" on public.email_campaigns for all to authenticated
  using (private.has_role(auth.uid(), 'admin'::public.app_role))
  with check (private.has_role(auth.uid(), 'admin'::public.app_role));
create policy "email_deliveries_admin_all" on public.email_campaign_deliveries for all to authenticated
  using (private.has_role(auth.uid(), 'admin'::public.app_role))
  with check (private.has_role(auth.uid(), 'admin'::public.app_role));
create policy "email_suppressions_admin_all" on public.email_suppressions for all to authenticated
  using (private.has_role(auth.uid(), 'admin'::public.app_role))
  with check (private.has_role(auth.uid(), 'admin'::public.app_role));

insert into public.app_settings (key, value)
values (
  'email_activation_automation',
  '{"enabled":false,"steps":[{"hours":3,"subject":"Seu acesso à Superlovable já está disponível","body":"Olá, {{nome}}! Percebemos que sua licença ainda não foi ativada. Sua chave é {{licenca}}. Acesse {{link_acesso}} para instalar e começar."},{"hours":6,"subject":"Precisa de ajuda para ativar a Superlovable?","body":"Olá, {{nome}}! Seu acesso continua aguardando ativação. Use a chave {{licenca}} em {{link_acesso}}. Se tiver dificuldade, responda a este e-mail."},{"hours":12,"subject":"Lembrete: sua licença Superlovable está pronta","body":"Olá, {{nome}}! Sua licença {{licenca}} ainda não foi ativada. O prazo só começa na primeira ativação. Acesse {{link_acesso}} e conclua quando puder."},{"hours":24,"subject":"Último lembrete sobre seu acesso à Superlovable","body":"Olá, {{nome}}! Este é o último lembrete automático. Sua licença {{licenca}} permanece disponível em {{link_acesso}}. Se precisar, responda a este e-mail para receber ajuda."}]}'
)
on conflict (key) do nothing;

insert into public.app_settings (key, value)
values ('email_campaign_cron_secret', encode(gen_random_bytes(32), 'hex'))
on conflict (key) do nothing;

insert into public.app_settings (key, value)
values ('email_campaign_scheduler_status', 'pending')
on conflict (key) do update set value = excluded.value, updated_at = now();

do $$
begin
  create extension if not exists pg_cron with schema extensions;
  create extension if not exists pg_net with schema extensions;
  if exists (select 1 from cron.job where jobname = 'superlovable-email-campaigns') then
    perform cron.unschedule('superlovable-email-campaigns');
  end if;
  perform cron.schedule(
    'superlovable-email-campaigns',
    '*/15 * * * *',
    $job$
      select net.http_post(
        url := 'https://painel-super-lov.lovable.app/api/internal/email-automation',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (select value from public.app_settings where key = 'email_campaign_cron_secret')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 50000
      );
    $job$
  );
  update public.app_settings set value = 'active', updated_at = now()
  where key = 'email_campaign_scheduler_status';
exception when others then
  update public.app_settings set value = 'manual', updated_at = now()
  where key = 'email_campaign_scheduler_status';
  raise notice 'Agendamento automático será configurado posteriormente: %', sqlerrm;
end $$;
