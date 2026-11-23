-- RelayPost License Tables (safe to run alongside other apps in the same Supabase project)
-- Uses dedicated "relaypost_" table prefix + RLS enabled (no public anon access).

create table if not exists public.relaypost_licenses (
  id uuid primary key default gen_random_uuid(),
  license_key text unique not null,
  plan text not null default 'pro',
  status text not null default 'active', -- 'active' or 'revoked'
  max_devices integer not null default 2,
  customer_email text,
  note text,
  expires_at timestamptz,                -- null = lifetime
  created_at timestamptz not null default now()
);

-- Aman dijalankan ulang pada database yang sudah ada:
alter table public.relaypost_licenses
  add column if not exists note text;

create table if not exists public.relaypost_license_devices (
  id uuid primary key default gen_random_uuid(),
  license_id uuid not null references public.relaypost_licenses(id) on delete cascade,
  device_id text not null,
  last_seen_at timestamptz not null default now(),
  unique (license_id, device_id)
);

create index if not exists idx_relaypost_licenses_key
  on public.relaypost_licenses (license_key);

create index if not exists idx_relaypost_devices_license
  on public.relaypost_license_devices (license_id);

alter table public.relaypost_licenses enable row level security;
alter table public.relaypost_license_devices enable row level security;

-- Contoh insert kode lisensi PRO Bulanan (30 hari) & PRO Tahunan (365 hari):
insert into public.relaypost_licenses (license_key, plan, status, max_devices, customer_email, expires_at)
values
  ('RLY-PRO-BLN-DEMO', 'pro', 'active', 2, 'bulanan@example.com', now() + interval '30 days'),
  ('RLY-PRO-THN-DEMO', 'pro', 'active', 2, 'tahunan@example.com', now() + interval '365 days')
on conflict (license_key) do nothing;
