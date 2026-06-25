create extension if not exists "pgcrypto";

create table public.white_label_partners (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade,
  company_name text not null,
  logo_url text,
  primary_color text default '#00D1FF',
  accent_color text default '#2ED573',
  report_branding jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.practices (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete set null,
  name text not null,
  domain text,
  email text,
  plan text default 'free' check (plan in ('free', 'audit', 'monitoring', 'compliance')),
  white_label_partner_id uuid references public.white_label_partners(id) on delete set null,
  created_at timestamptz default now()
);

create table public.security_checks (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid references public.practices(id) on delete cascade,
  type text not null check (type in ('questionnaire', 'wlan', 'external', 'full')),
  score integer check (score between 0 and 100),
  results jsonb default '{}'::jsonb,
  encrypted_payload jsonb not null default '{}'::jsonb,
  payload_sha256 text,
  completed_at timestamptz default now()
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid references public.practices(id) on delete cascade,
  check_id uuid references public.security_checks(id) on delete set null,
  content jsonb default '{}'::jsonb,
  encrypted_content jsonb not null default '{}'::jsonb,
  payload_sha256 text,
  pdf_url text,
  created_at timestamptz default now()
);

create table public.monitoring_events (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid references public.practices(id) on delete cascade,
  type text check (type in ('ssl_expiry', 'dmarc_missing', 'leak_detected', 'port_open', 'domain_blacklisted', 'dns_changed', 'monitoring_run')),
  severity text check (severity in ('critical', 'warning', 'info')),
  title text not null default 'Monitoring-Ereignis',
  message text not null default '',
  details jsonb default '{}'::jsonb,
  resolved_at timestamptz,
  created_at timestamptz default now()
);

create table public.monitoring_snapshots (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid references public.practices(id) on delete cascade,
  source text not null check (source in ('scheduled', 'manual', 'demo')),
  score integer not null check (score between 0 and 100),
  category_scores jsonb not null default '{}'::jsonb,
  ssl jsonb not null default '{}'::jsonb,
  email_security jsonb not null default '{}'::jsonb,
  devices jsonb not null default '{}'::jsonb,
  checks jsonb not null default '{}'::jsonb,
  encrypted_checks jsonb not null default '{}'::jsonb,
  payload_sha256 text,
  checked_at timestamptz default now()
);

create table public.wlan_scans (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid references public.practices(id) on delete cascade,
  network_info jsonb default '{}'::jsonb,
  vulnerabilities jsonb default '[]'::jsonb,
  encrypted_payload jsonb not null default '{}'::jsonb,
  payload_sha256 text,
  devices_found integer default 0,
  risk_level text check (risk_level in ('low', 'medium', 'high', 'niedrig', 'mittel', 'hoch')),
  created_at timestamptz default now()
);

create table public.external_check_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  practice_id uuid references public.practices(id) on delete cascade,
  usage_date date not null default current_date,
  count integer not null default 0 check (count >= 0),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, practice_id, usage_date)
);

create table public.practice_access_audit (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid references public.practices(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  resource text not null,
  metadata jsonb not null default '{}'::jsonb,
  ip_hash text,
  user_agent text,
  created_at timestamptz default now()
);

create table public.data_processing_agreements (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid references public.practices(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  version text not null default '2026-06-24',
  status text not null default 'accepted' check (status in ('accepted', 'revoked')),
  accepted_at timestamptz default now(),
  document_url text,
  metadata jsonb not null default '{}'::jsonb,
  unique (practice_id, version)
);

create table public.deletion_requests (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid,
  user_id uuid references auth.users(id) on delete set null,
  status text not null default 'completed' check (status in ('requested', 'completed', 'failed')),
  requested_at timestamptz default now(),
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create table public.partner_plan_pricing (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid references public.white_label_partners(id) on delete cascade,
  plan text not null check (plan in ('free', 'audit', 'monitoring', 'compliance')),
  price_cents integer not null check (price_cents >= 0),
  billing text check (billing in ('einmalig', 'monatlich')),
  margin_cents integer not null default 0,
  active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (partner_id, plan)
);

create index practices_owner_id_idx on public.practices(owner_id);
create index white_label_partners_owner_id_idx on public.white_label_partners(owner_id);
create index security_checks_practice_id_idx on public.security_checks(practice_id);
create index reports_practice_id_idx on public.reports(practice_id);
create index monitoring_events_practice_created_idx on public.monitoring_events(practice_id, created_at desc);
create index monitoring_snapshots_practice_checked_idx on public.monitoring_snapshots(practice_id, checked_at desc);
create index wlan_scans_practice_created_idx on public.wlan_scans(practice_id, created_at desc);
create index external_check_usage_user_date_idx on public.external_check_usage(user_id, usage_date desc);
create index practice_access_audit_practice_created_idx on public.practice_access_audit(practice_id, created_at desc);
create index data_processing_agreements_practice_idx on public.data_processing_agreements(practice_id);
create index deletion_requests_user_idx on public.deletion_requests(user_id, requested_at desc);

alter table public.white_label_partners enable row level security;
alter table public.practices enable row level security;
alter table public.security_checks enable row level security;
alter table public.reports enable row level security;
alter table public.monitoring_events enable row level security;
alter table public.monitoring_snapshots enable row level security;
alter table public.wlan_scans enable row level security;
alter table public.external_check_usage enable row level security;
alter table public.practice_access_audit enable row level security;
alter table public.data_processing_agreements enable row level security;
alter table public.deletion_requests enable row level security;
alter table public.partner_plan_pricing enable row level security;

alter publication supabase_realtime add table public.monitoring_events;
alter publication supabase_realtime add table public.monitoring_snapshots;

create policy "partner owners can manage white label"
on public.white_label_partners for all
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

create policy "practice owners can read practices"
on public.practices for select
using (auth.uid() = owner_id);

create policy "practice owners can insert practices"
on public.practices for insert
with check (auth.uid() = owner_id);

create policy "practice owners can update practices"
on public.practices for update
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

create policy "practice owners can read checks"
on public.security_checks for select
using (exists (
  select 1 from public.practices
  where practices.id = security_checks.practice_id
  and practices.owner_id = auth.uid()
));

create policy "practice owners can write checks"
on public.security_checks for insert
with check (exists (
  select 1 from public.practices
  where practices.id = security_checks.practice_id
  and practices.owner_id = auth.uid()
));

create policy "practice owners can update checks"
on public.security_checks for update
using (exists (
  select 1 from public.practices
  where practices.id = security_checks.practice_id
  and practices.owner_id = auth.uid()
))
with check (exists (
  select 1 from public.practices
  where practices.id = security_checks.practice_id
  and practices.owner_id = auth.uid()
));

create policy "practice owners can read reports"
on public.reports for select
using (exists (
  select 1 from public.practices
  where practices.id = reports.practice_id
  and practices.owner_id = auth.uid()
));

create policy "practice owners can write reports"
on public.reports for insert
with check (exists (
  select 1 from public.practices
  where practices.id = reports.practice_id
  and practices.owner_id = auth.uid()
));

create policy "practice owners can read monitoring"
on public.monitoring_events for select
using (exists (
  select 1 from public.practices
  where practices.id = monitoring_events.practice_id
  and practices.owner_id = auth.uid()
));

create policy "practice owners can read monitoring snapshots"
on public.monitoring_snapshots for select
using (exists (
  select 1 from public.practices
  where practices.id = monitoring_snapshots.practice_id
  and practices.owner_id = auth.uid()
));

create policy "practice owners can read wlan scans"
on public.wlan_scans for select
using (exists (
  select 1 from public.practices
  where practices.id = wlan_scans.practice_id
  and practices.owner_id = auth.uid()
));

create policy "practice owners can write wlan scans"
on public.wlan_scans for insert
with check (exists (
  select 1 from public.practices
  where practices.id = wlan_scans.practice_id
  and practices.owner_id = auth.uid()
));

create policy "practice owners can read usage"
on public.external_check_usage for select
using (auth.uid() = user_id);

create policy "practice owners can read audit"
on public.practice_access_audit for select
using (auth.uid() = user_id);

create policy "practice owners can read avv"
on public.data_processing_agreements for select
using (auth.uid() = user_id);

create policy "practice owners can read deletion requests"
on public.deletion_requests for select
using (auth.uid() = user_id);

create policy "partner owners can manage custom pricing"
on public.partner_plan_pricing for all
using (exists (
  select 1 from public.white_label_partners
  where white_label_partners.id = partner_plan_pricing.partner_id
  and white_label_partners.owner_id = auth.uid()
))
with check (exists (
  select 1 from public.white_label_partners
  where white_label_partners.id = partner_plan_pricing.partner_id
  and white_label_partners.owner_id = auth.uid()
));

create or replace function public.consume_external_check_quota(
  p_user_id uuid,
  p_practice_id uuid,
  p_usage_date date,
  p_limit integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_count integer;
begin
  insert into public.external_check_usage (user_id, practice_id, usage_date, count)
  values (p_user_id, p_practice_id, p_usage_date, 0)
  on conflict (user_id, practice_id, usage_date) do nothing;

  select count into current_count
  from public.external_check_usage
  where user_id = p_user_id
    and practice_id = p_practice_id
    and usage_date = p_usage_date
  for update;

  if current_count >= p_limit then
    return false;
  end if;

  update public.external_check_usage
  set count = count + 1,
      updated_at = now()
  where user_id = p_user_id
    and practice_id = p_practice_id
    and usage_date = p_usage_date;

  return true;
end;
$$;

create or replace function public.create_default_avv()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.owner_id is not null then
    insert into public.data_processing_agreements (practice_id, user_id, metadata)
    values (
      new.id,
      new.owner_id,
      jsonb_build_object(
        'legal_basis', 'DSGVO Art. 28',
        'data_region', 'EU / Frankfurt',
        'generated_automatically', true
      )
    )
    on conflict (practice_id, version) do nothing;
  end if;

  return new;
end;
$$;

create trigger practices_create_default_avv
after insert on public.practices
for each row execute function public.create_default_avv();
