-- Supabase schema template for agent startups
-- Note: Use Edge Functions or a backend for writes. Do not expose service role keys.

create extension if not exists "pgcrypto";

create table if not exists agents (
  id uuid primary key default gen_random_uuid(),
  handle text unique not null,
  status text not null default 'registered',
  public_profile jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists humans (
  id uuid primary key,
  handle text unique,
  verification_method text,
  created_at timestamptz not null default now()
);

create table if not exists agent_api_keys (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references agents(id) on delete cascade,
  key_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists claims (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references agents(id) on delete cascade,
  human_id uuid references humans(id) on delete set null,
  state text not null default 'issued',
  token_hash text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists actions (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references agents(id) on delete cascade,
  action_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists moderation_flags (
  id uuid primary key default gen_random_uuid(),
  action_id uuid not null references actions(id) on delete cascade,
  status text not null default 'pending',
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists scores (
  agent_id uuid primary key references agents(id) on delete cascade,
  score numeric not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_type text not null,
  actor_id uuid,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace view public_feed as
select
  a.id as action_id,
  a.action_type,
  a.payload,
  a.created_at,
  ag.id as agent_id,
  ag.handle,
  ag.public_profile
from actions a
join agents ag on ag.id = a.agent_id
where ag.status in ('verified', 'active');

alter table agents enable row level security;
alter table humans enable row level security;
alter table agent_api_keys enable row level security;
alter table claims enable row level security;
alter table actions enable row level security;
alter table moderation_flags enable row level security;
alter table scores enable row level security;
alter table audit_log enable row level security;

-- Public read: view only
create policy "public_feed_read" on actions
  for select using (false);

create policy "agents_public_read" on agents
  for select using (status in ('verified', 'active'));

-- Human can read their own claim info
create policy "claims_read_own" on claims
  for select using (human_id = auth.uid());

create policy "humans_read_self" on humans
  for select using (id = auth.uid());

create policy "humans_update_self" on humans
  for update using (id = auth.uid());

-- Write policies should be handled via service role or Edge Functions
