-- OG-BOT Offline AI Studio — backend schema.
-- Single-tenant to start: one "primary" license + usage row for this device.
-- Structured so multiple customers can be added later (drop the id default,
-- add an owner/auth column, tighten RLS).

create extension if not exists "pgcrypto";

-- ── Licenses ────────────────────────────────────────────────────────────────
create table if not exists public.licenses (
  id              text primary key default 'primary',
  customer        text not null default 'Workstation Owner',
  tier            text not null default 'pro' check (tier in ('starter','pro','enterprise')),
  expires         date not null default '2027-11-01',
  overrides       jsonb not null default '{}'::jsonb,   -- per-feature grant/revoke
  slots           jsonb not null default '[]'::jsonb,   -- bound device slots
  device_key      text not null default 'OGB-7F3A-91C2-XQ8D',
  mac             text not null default 'C8:7F:54:1A:22:9E',
  usb_serial      text not null default 'USB\OGB_SENTINEL\0x4A91F0C2',
  plugged         boolean not null default true,
  activated       boolean not null default true,
  grace_days_left integer not null default 30,
  updated_at      timestamptz not null default now()
);

-- ── Usage ledger ────────────────────────────────────────────────────────────
create table if not exists public.usage_ledger (
  id       text primary key default 'primary',
  prompts  integer not null default 0,
  edits    integer not null default 0,
  images   integer not null default 0,
  music    integer not null default 0,
  builds   integer not null default 0,
  since    date not null default current_date,
  updated_at timestamptz not null default now()
);

-- keep updated_at fresh
create or replace function public.touch_updated_at()
returns trigger language plpgsql
set search_path = ''
as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists licenses_touch on public.licenses;
create trigger licenses_touch before update on public.licenses
  for each row execute function public.touch_updated_at();

drop trigger if exists usage_touch on public.usage_ledger;
create trigger usage_touch before update on public.usage_ledger
  for each row execute function public.touch_updated_at();

-- ── Row Level Security ──────────────────────────────────────────────────────
-- NOTE: this deployment has no end-user auth yet, so anon (the browser's
-- publishable key) is granted full access to the single-tenant rows. Add
-- Supabase Auth and restrict these policies to the owner before onboarding
-- real customers.
alter table public.licenses enable row level security;
alter table public.usage_ledger enable row level security;

drop policy if exists licenses_anon_all on public.licenses;
create policy licenses_anon_all on public.licenses
  for all to anon using (true) with check (true);

drop policy if exists usage_anon_all on public.usage_ledger;
create policy usage_anon_all on public.usage_ledger
  for all to anon using (true) with check (true);

-- ── Seed the primary rows ───────────────────────────────────────────────────
insert into public.licenses (id, slots) values (
  'primary',
  '[{"slot":1,"label":"Primary Rig (RTX 5080)","mac":"C8:7F:54:1A:22:9E"},
    {"slot":2,"label":"Laptop","mac":null},
    {"slot":3,"label":"Spare / Testing","mac":null}]'::jsonb
) on conflict (id) do nothing;

insert into public.usage_ledger (id) values ('primary') on conflict (id) do nothing;
