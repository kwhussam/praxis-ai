create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices(id) on delete cascade,
  type text not null check (type in ('device', 'network', 'domain', 'subdomain', 'email', 'provider', 'critical_system')),
  name text not null,
  detail text,
  owner text,
  criticality text not null check (criticality in ('critical', 'high', 'medium', 'low')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory_known_devices (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices(id) on delete cascade,
  mac_address text not null,
  hostname text not null default '',
  device_type text not null check (device_type in ('router', 'workstation', 'server', 'printer', 'phone', 'tablet', 'medical', 'iot', 'unknown')),
  location text not null default '',
  owner text not null default '',
  criticality text not null check (criticality in ('critical', 'high', 'medium', 'low')),
  last_confirmed_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (practice_id, mac_address)
);

create table if not exists public.inventory_access_points (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices(id) on delete cascade,
  ssid text not null,
  bssid text not null,
  location text not null default '',
  vendor text not null default '',
  channel text not null default '',
  expected_encryption text not null check (expected_encryption in ('WPA2_AES', 'WPA2_WPA3_MIXED', 'WPA3', 'OPEN', 'UNKNOWN')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (practice_id, bssid)
);

create table if not exists public.router_wifi_configurations (
  practice_id uuid primary key references public.practices(id) on delete cascade,
  wpa2_aes boolean not null default true,
  wpa2_wpa3_mixed_mode boolean not null default false,
  wpa3 boolean not null default false,
  tkip boolean not null default false,
  open_wifi boolean not null default false,
  wps boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.router_firewall_rules (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices(id) on delete cascade,
  name text not null,
  source_view text not null check (source_view in ('external', 'internal')),
  direction text not null check (direction in ('wan_to_lan', 'lan_to_wan', 'lan_to_lan', 'vpn_to_lan')),
  protocol text not null check (protocol in ('tcp', 'udp', 'icmp', 'any')),
  ports text not null default 'any',
  source text not null default 'any',
  destination text not null default 'any',
  action text not null check (action in ('allow', 'deny')),
  purpose text not null default '',
  owner text not null default '',
  enabled boolean not null default true,
  last_reviewed_at timestamptz,
  imported_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.monitoring_targets (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices(id) on delete cascade,
  target_type text not null check (target_type in ('domain', 'subdomain', 'email')),
  value text not null,
  value_normalized text generated always as (lower(btrim(value))) stored,
  enabled boolean not null default true,
  leak_scan_allowed boolean not null default false,
  consent_accepted_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (target_type = 'email' or leak_scan_allowed = false),
  check (leak_scan_allowed = false or consent_accepted_at is not null),
  unique (practice_id, target_type, value_normalized)
);

create index if not exists inventory_items_practice_type_idx on public.inventory_items(practice_id, type);
create index if not exists inventory_known_devices_practice_idx on public.inventory_known_devices(practice_id);
create index if not exists inventory_access_points_practice_idx on public.inventory_access_points(practice_id);
create index if not exists router_firewall_rules_practice_idx on public.router_firewall_rules(practice_id);
create index if not exists monitoring_targets_practice_type_idx on public.monitoring_targets(practice_id, target_type);

drop trigger if exists set_inventory_items_updated_at on public.inventory_items;
create trigger set_inventory_items_updated_at
before update on public.inventory_items
for each row execute function public.set_updated_at();

drop trigger if exists set_inventory_known_devices_updated_at on public.inventory_known_devices;
create trigger set_inventory_known_devices_updated_at
before update on public.inventory_known_devices
for each row execute function public.set_updated_at();

drop trigger if exists set_inventory_access_points_updated_at on public.inventory_access_points;
create trigger set_inventory_access_points_updated_at
before update on public.inventory_access_points
for each row execute function public.set_updated_at();

drop trigger if exists set_router_wifi_configurations_updated_at on public.router_wifi_configurations;
create trigger set_router_wifi_configurations_updated_at
before update on public.router_wifi_configurations
for each row execute function public.set_updated_at();

drop trigger if exists set_router_firewall_rules_updated_at on public.router_firewall_rules;
create trigger set_router_firewall_rules_updated_at
before update on public.router_firewall_rules
for each row execute function public.set_updated_at();

drop trigger if exists set_monitoring_targets_updated_at on public.monitoring_targets;
create trigger set_monitoring_targets_updated_at
before update on public.monitoring_targets
for each row execute function public.set_updated_at();

alter table public.inventory_items enable row level security;
alter table public.inventory_known_devices enable row level security;
alter table public.inventory_access_points enable row level security;
alter table public.router_wifi_configurations enable row level security;
alter table public.router_firewall_rules enable row level security;
alter table public.monitoring_targets enable row level security;

alter table public.inventory_items force row level security;
alter table public.inventory_known_devices force row level security;
alter table public.inventory_access_points force row level security;
alter table public.router_wifi_configurations force row level security;
alter table public.router_firewall_rules force row level security;
alter table public.monitoring_targets force row level security;

grant select, insert, update, delete on public.inventory_items to authenticated;
grant select, insert, update, delete on public.inventory_known_devices to authenticated;
grant select, insert, update, delete on public.inventory_access_points to authenticated;
grant select, insert, update, delete on public.router_wifi_configurations to authenticated;
grant select, insert, update, delete on public.router_firewall_rules to authenticated;
grant select, insert, update, delete on public.monitoring_targets to authenticated;

drop policy if exists "tenant guard: inventory items read" on public.inventory_items;
create policy "tenant guard: inventory items read"
on public.inventory_items for select
using (public.current_user_can_access_practice(practice_id, 'viewer'));

drop policy if exists "tenant guard: inventory items write" on public.inventory_items;
create policy "tenant guard: inventory items write"
on public.inventory_items for all
using (public.current_user_can_access_practice(practice_id, 'manager'))
with check (public.current_user_can_access_practice(practice_id, 'manager'));

drop policy if exists "tenant guard: known devices read" on public.inventory_known_devices;
create policy "tenant guard: known devices read"
on public.inventory_known_devices for select
using (public.current_user_can_access_practice(practice_id, 'viewer'));

drop policy if exists "tenant guard: known devices write" on public.inventory_known_devices;
create policy "tenant guard: known devices write"
on public.inventory_known_devices for all
using (public.current_user_can_access_practice(practice_id, 'manager'))
with check (public.current_user_can_access_practice(practice_id, 'manager'));

drop policy if exists "tenant guard: access points read" on public.inventory_access_points;
create policy "tenant guard: access points read"
on public.inventory_access_points for select
using (public.current_user_can_access_practice(practice_id, 'viewer'));

drop policy if exists "tenant guard: access points write" on public.inventory_access_points;
create policy "tenant guard: access points write"
on public.inventory_access_points for all
using (public.current_user_can_access_practice(practice_id, 'manager'))
with check (public.current_user_can_access_practice(practice_id, 'manager'));

drop policy if exists "tenant guard: router wifi read" on public.router_wifi_configurations;
create policy "tenant guard: router wifi read"
on public.router_wifi_configurations for select
using (public.current_user_can_access_practice(practice_id, 'viewer'));

drop policy if exists "tenant guard: router wifi write" on public.router_wifi_configurations;
create policy "tenant guard: router wifi write"
on public.router_wifi_configurations for all
using (public.current_user_can_access_practice(practice_id, 'manager'))
with check (public.current_user_can_access_practice(practice_id, 'manager'));

drop policy if exists "tenant guard: firewall rules read" on public.router_firewall_rules;
create policy "tenant guard: firewall rules read"
on public.router_firewall_rules for select
using (public.current_user_can_access_practice(practice_id, 'viewer'));

drop policy if exists "tenant guard: firewall rules write" on public.router_firewall_rules;
create policy "tenant guard: firewall rules write"
on public.router_firewall_rules for all
using (public.current_user_can_access_practice(practice_id, 'manager'))
with check (public.current_user_can_access_practice(practice_id, 'manager'));

drop policy if exists "tenant guard: monitoring targets read" on public.monitoring_targets;
create policy "tenant guard: monitoring targets read"
on public.monitoring_targets for select
using (public.current_user_can_access_practice(practice_id, 'viewer'));

drop policy if exists "tenant guard: monitoring targets write" on public.monitoring_targets;
create policy "tenant guard: monitoring targets write"
on public.monitoring_targets for all
using (public.current_user_can_access_practice(practice_id, 'manager'))
with check (public.current_user_can_access_practice(practice_id, 'manager'));
