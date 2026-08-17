create table public.github_license_connections (
  id uuid primary key default gen_random_uuid(),
  license_id uuid not null unique references public.licenses(id) on delete cascade,
  github_user_id bigint,
  github_login text,
  github_avatar_url text,
  installation_id bigint,
  repository_id bigint,
  repository_full_name text,
  repository_url text,
  branch text not null default 'main',
  status text not null default 'pending',
  connected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.github_license_oauth_states (
  state text primary key,
  license_id uuid not null references public.licenses(id) on delete cascade,
  used boolean not null default false,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.github_agent_runs (
  id uuid primary key default gen_random_uuid(),
  license_id uuid not null references public.licenses(id) on delete cascade,
  repository_full_name text not null,
  branch text not null,
  prompt text not null,
  provider text,
  model text,
  status text not null default 'planning',
  summary text,
  commit_message text,
  proposed_files jsonb not null default '[]'::jsonb,
  base_sha text,
  commit_sha text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant all on public.github_license_connections to service_role;
grant all on public.github_license_oauth_states to service_role;
grant all on public.github_agent_runs to service_role;
alter table public.github_license_connections enable row level security;
alter table public.github_license_oauth_states enable row level security;
alter table public.github_agent_runs enable row level security;
create index github_agent_runs_license_created_idx on public.github_agent_runs (license_id, created_at desc);

