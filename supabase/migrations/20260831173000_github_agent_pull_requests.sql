alter table public.github_agent_runs
  add column if not exists working_branch text,
  add column if not exists pull_request_number integer,
  add column if not exists pull_request_url text,
  add column if not exists merge_commit_sha text,
  add column if not exists merged_at timestamptz;

create index if not exists github_agent_runs_pull_request_idx
  on public.github_agent_runs (repository_full_name, pull_request_number)
  where pull_request_number is not null;

