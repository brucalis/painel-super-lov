alter table public.github_agent_runs
  add column if not exists risk_level text,
  add column if not exists validation_report jsonb not null default '{}'::jsonb,
  add column if not exists requires_review boolean not null default false;

alter table public.github_agent_runs
  drop constraint if exists github_agent_runs_risk_level_check;

alter table public.github_agent_runs
  add constraint github_agent_runs_risk_level_check
  check (risk_level is null or risk_level in ('low', 'medium', 'high', 'blocked'));

create index if not exists github_agent_runs_risk_level_idx
  on public.github_agent_runs (risk_level, created_at desc);
