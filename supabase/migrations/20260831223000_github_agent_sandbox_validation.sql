alter table public.github_agent_runs
  add column if not exists sandbox_status text,
  add column if not exists sandbox_report jsonb not null default '{}'::jsonb;

alter table public.github_agent_runs
  drop constraint if exists github_agent_runs_sandbox_status_check;

alter table public.github_agent_runs
  add constraint github_agent_runs_sandbox_status_check
  check (
    sandbox_status is null
    or sandbox_status in ('passed', 'failed', 'skipped', 'unavailable')
  );

create index if not exists github_agent_runs_sandbox_status_idx
  on public.github_agent_runs (sandbox_status, created_at desc);
