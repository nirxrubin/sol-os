-- HostaPosta Database Schema
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/thdsvxxqfqhucsjhyqki/sql

-- ─── Workspaces ───────────────────────────────────────────────────────────────
-- One workspace per builder account
create table if not exists workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_email text not null unique,
  created_at timestamptz default now()
);
alter table workspaces enable row level security;

-- ─── Projects ─────────────────────────────────────────────────────────────────
-- One project per uploaded zip
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade,
  name text not null,
  slug text not null,
  status text not null default 'analyzing', -- analyzing | ready | deployed | error
  framework text,                            -- static | react-vite | next | unknown
  serve_path text,                           -- local path to serve from
  project_root text,                         -- local path to source files
  manifest jsonb,                            -- full analysis output
  build_success boolean,
  build_error text,
  live_url text,                             -- populated after deploy
  deploy_bundle text,                        -- starter | pro | scale | custom
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table projects enable row level security;
create index if not exists projects_workspace_id_idx on projects(workspace_id);

-- ─── Content Types ────────────────────────────────────────────────────────────
-- CMS collections detected or created per project
create table if not exists content_types (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  name text not null,                        -- "Blog Posts", "Team Members", etc.
  slug text not null,                        -- "blog-posts", "team-members"
  source_file text,                          -- relative path to source file
  source_var text,                           -- variable name in source file
  fields jsonb not null default '[]',        -- field definitions
  items jsonb not null default '[]',         -- current content items
  cms_mode text default 'native',            -- native | wrap | coexist | replace
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table content_types enable row level security;
create index if not exists content_types_project_id_idx on content_types(project_id);

-- ─── Deploy Records ───────────────────────────────────────────────────────────
-- Immutable log of every deploy
create table if not exists deploy_records (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  bundle text not null,
  live_url text,
  vercel_project_id text,
  cloudflare_zone_id text,
  status text not null default 'pending',   -- pending | success | failed
  error text,
  deployed_at timestamptz default now()
);
alter table deploy_records enable row level security;
create index if not exists deploy_records_project_id_idx on deploy_records(project_id);

-- ─── Client Invites ───────────────────────────────────────────────────────────
-- Clients invited by builders to access a project
create table if not exists client_invites (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  email text not null,
  token text not null unique default encode(gen_random_bytes(32), 'hex'),
  accepted boolean default false,
  created_at timestamptz default now()
);
alter table client_invites enable row level security;

-- ─── Updated_at trigger ───────────────────────────────────────────────────────
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger projects_updated_at
  before update on projects
  for each row execute function update_updated_at();

create trigger content_types_updated_at
  before update on content_types
  for each row execute function update_updated_at();
