alter table public.email_campaigns
  add column if not exists audience_statuses text[] not null default array['all']::text[],
  add column if not exists body_format text not null default 'text',
  add column if not exists scheduled_for timestamptz not null default now();

alter table public.email_campaign_deliveries
  add column if not exists body_format text not null default 'text';

alter table public.email_campaign_deliveries
  drop constraint if exists email_campaign_deliveries_body_format_check;

alter table public.email_campaign_deliveries
  add constraint email_campaign_deliveries_body_format_check
  check (body_format in ('text','html'));

alter table public.email_campaigns
  drop constraint if exists email_campaigns_status_check;

alter table public.email_campaigns
  add constraint email_campaigns_status_check
  check (status in ('draft','scheduled','queued','sending','completed','failed','cancelled'));

alter table public.email_campaigns
  drop constraint if exists email_campaigns_body_format_check;

alter table public.email_campaigns
  add constraint email_campaigns_body_format_check
  check (body_format in ('text','html'));

update public.email_campaigns
set audience_statuses = string_to_array(audience_status, ',')
where audience_statuses = array['all']::text[] and audience_status <> 'all';
