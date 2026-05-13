-- =============================================================================
-- LabBuddy — Supabase schema (parent-scoped tables only)
--
-- Paste this entire file into the Supabase SQL Editor and run it once.
-- Idempotent (DROP IF EXISTS) so re-running wipes data — only do that in dev.
--
-- Scope: only the tables that parents touch via the dashboard. Kid-facing
-- tables (sessions, chat_messages, syllabi, diy_guides, gamification,
-- notebook) stay on the server's local SQLite database.
--
-- Conventions:
--   - parents live in auth.users (Supabase Auth).
--   - parent_id columns are uuid REFERENCES auth.users(id) ON DELETE CASCADE.
--   - child_id is text (uuid string) — either a child_profiles.id OR an
--     anonymous session id, so it is NOT FK-constrained.
--   - timestamps are bigint (ms since epoch) — matches the TS code.
--   - Service-role connections BYPASS RLS, so server-side code is unaffected.
-- =============================================================================

-- Parent profile extension. One row per auth user (auto-created via trigger).
-- The user's email lives in auth.users.email; name + subscription state here.
drop table if exists public.parent_profiles cascade;
create table public.parent_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  subscription_tier text not null default 'free',
  subscription_status text not null default 'trialing',
  stripe_customer_id text,
  stripe_subscription_id text,
  trial_ends_at bigint,
  created_at bigint not null
);

drop table if exists public.child_profiles cascade;
create table public.child_profiles (
  id text primary key,
  parent_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  age integer not null,
  grade_level integer,
  avatar text,
  interests text,
  created_at bigint not null
);
create index idx_child_profiles_parent on public.child_profiles(parent_id);

drop table if exists public.parental_controls cascade;
create table public.parental_controls (
  child_id text primary key,
  daily_screen_time_minutes integer,
  blocked_categories text not null default '[]',
  blocked_keywords text not null default '[]',
  require_approval_for_yellow integer not null default 0,
  notifications_enabled integer not null default 1,
  updated_at bigint not null
);

drop table if exists public.activity_log cascade;
create table public.activity_log (
  id text primary key,
  child_id text not null,
  type text not null,
  summary text not null,
  metadata text,
  created_at bigint not null
);
create index idx_activity_log_child on public.activity_log(child_id, created_at);

drop table if exists public.screen_time_usage cascade;
create table public.screen_time_usage (
  child_id text not null,
  date text not null,
  minutes_used integer not null default 0,
  sessions_count integer not null default 0,
  primary key (child_id, date)
);

drop table if exists public.notifications cascade;
create table public.notifications (
  id text primary key,
  recipient_id text not null,
  recipient_type text not null,
  type text not null,
  title text not null,
  message text not null,
  action_url text,
  read integer not null default 0,
  created_at bigint not null
);
create index idx_notifications_recipient on public.notifications(recipient_id, created_at);

-- =============================================================================
-- Auto-create parent_profiles row on signup via trigger.
-- =============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  trial_ms bigint := (extract(epoch from now()) * 1000)::bigint + (14 * 24 * 60 * 60 * 1000);
begin
  insert into public.parent_profiles (id, name, trial_ends_at, created_at)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', ''),
    trial_ms,
    (extract(epoch from now()) * 1000)::bigint
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =============================================================================
-- Row Level Security (defense-in-depth; server uses service_role and bypasses).
-- =============================================================================
alter table public.parent_profiles    enable row level security;
alter table public.child_profiles     enable row level security;
alter table public.parental_controls  enable row level security;
alter table public.activity_log       enable row level security;
alter table public.screen_time_usage  enable row level security;
alter table public.notifications      enable row level security;

create policy "self read"   on public.parent_profiles for select using (auth.uid() = id);
create policy "self update" on public.parent_profiles for update using (auth.uid() = id);

create policy "own children" on public.child_profiles
  for all using (auth.uid() = parent_id) with check (auth.uid() = parent_id);

create policy "own activity" on public.activity_log for select using (
  exists (select 1 from public.child_profiles cp where cp.id = activity_log.child_id and cp.parent_id = auth.uid())
);
create policy "own controls" on public.parental_controls for select using (
  exists (select 1 from public.child_profiles cp where cp.id = parental_controls.child_id and cp.parent_id = auth.uid())
);
create policy "own screen time" on public.screen_time_usage for select using (
  exists (select 1 from public.child_profiles cp where cp.id = screen_time_usage.child_id and cp.parent_id = auth.uid())
);
create policy "own notifications" on public.notifications for select using (recipient_id = auth.uid()::text);
