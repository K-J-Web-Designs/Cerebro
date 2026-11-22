-- Cerebro Supabase Schema & Auth Sync Setup
-- Run in Supabase Dashboard -> SQL Editor

create extension if not exists vector;

create table if not exists public.users (
  id text primary key,
  name text not null,
  email text not null unique,
  password_hash text,
  image text,
  role text not null default 'member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.knowledge_items (
  id text primary key,
  user_id text not null references public.users(id) on delete cascade,
  type text not null default 'note',
  title text not null,
  content_md text not null default '',
  summary text not null default '',
  source_url text,
  metadata jsonb not null default '{}'::jsonb,
  embedding jsonb,
  version integer not null default 1,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_items_user_updated on public.knowledge_items (user_id, updated_at);
create index if not exists idx_items_user_type on public.knowledge_items (user_id, type);

create table if not exists public.highlights (
  id text primary key,
  item_id text not null references public.knowledge_items(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  quote_text text not null,
  prefix_context text not null default '',
  suffix_context text not null default '',
  annotation_md text not null default '',
  color text not null default 'amber',
  position_offset integer not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_highlights_item on public.highlights (item_id);
create index if not exists idx_highlights_user_updated on public.highlights (user_id, updated_at);

create table if not exists public.tags (
  id text primary key,
  user_id text not null references public.users(id) on delete cascade,
  name text not null,
  color text not null default '#c87d1a',
  category text not null default 'General',
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tags_user_name on public.tags (user_id, name);

create table if not exists public.item_tags (
  item_id text not null references public.knowledge_items(id) on delete cascade,
  tag_id text not null references public.tags(id) on delete cascade,
  updated_at timestamptz not null default now(),
  primary key (item_id, tag_id)
);

create table if not exists public.knowledge_edges (
  id text primary key,
  user_id text not null references public.users(id) on delete cascade,
  source_item_id text not null references public.knowledge_items(id) on delete cascade,
  target_item_id text not null references public.knowledge_items(id) on delete cascade,
  relation_type text not null default 'related_to',
  weight real not null default 1,
  ai_generated boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_edges_user on public.knowledge_edges (user_id);
create index if not exists idx_edges_source on public.knowledge_edges (source_item_id);
create index if not exists idx_edges_target on public.knowledge_edges (target_item_id);

-- Automatically sync Supabase Auth users into public.users
create or replace function public.handle_new_supabase_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, name, email, image)
  values (
    new.id::text,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do update set
    email = excluded.email,
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_supabase_user();
