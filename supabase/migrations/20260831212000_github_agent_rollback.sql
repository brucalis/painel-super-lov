alter table public.github_agent_runs
  add column if not exists rollback_status text,
  add column if not exists rollback_branch text,
  add column if not exists rollback_commit_sha text,
  add column if not exists rollback_pull_request_number integer,
  add column if not exists rollback_pull_request_url text,
  add column if not exists rolled_back_at timestamptz;

alter table public.github_agent_runs
  drop constraint if exists github_agent_runs_rollback_status_check;

alter table public.github_agent_runs
  add constraint github_agent_runs_rollback_status_check
  check (
    rollback_status is null
    or rollback_status in ('awaiting_confirmation', 'merged')
  );
