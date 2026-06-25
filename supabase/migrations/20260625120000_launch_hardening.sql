create table if not exists public.consent_log (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid references public.practices(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  type text not null check (type in ('avv', 'privacy_policy', 'wlan_scan', 'ai_processing')),
  version text not null,
  accepted boolean not null,
  accepted_at timestamptz not null,
  ip_hash text,
  user_agent_hash text,
  withdrawn_at timestamptz,
  created_at timestamptz default now()
);

alter table public.consent_log enable row level security;

create policy "practice owners can read consent log"
on public.consent_log for select
using (exists (
  select 1 from public.practices
  where practices.id = consent_log.practice_id
  and practices.owner_id = auth.uid()
));

alter table public.practices
  add column if not exists deleted_at timestamptz;

alter table public.security_checks
  add column if not exists scoring_version text,
  add column if not exists anonymized_at timestamptz;

alter table public.reports
  add column if not exists format_version text,
  add column if not exists scoring_version text,
  add column if not exists input_hash text,
  add column if not exists anonymized_at timestamptz;

alter table public.deletion_requests
  add column if not exists requested_by uuid references auth.users(id) on delete set null,
  add column if not exists state text default 'requested' check (state in ('requested', 'anonymized', 'pending', 'completed')),
  add column if not exists report jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'partner_role') then
    create type public.partner_role as enum ('owner', 'manager', 'viewer', 'white_label');
  end if;
end $$;

create table if not exists public.partner_practices (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid references auth.users(id) on delete cascade,
  practice_id uuid references public.practices(id) on delete cascade,
  role public.partner_role not null,
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz default now(),
  unique (partner_id, practice_id)
);

create table if not exists public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  recipient text not null,
  template text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed')),
  created_at timestamptz default now(),
  sent_at timestamptz
);

alter table public.email_outbox enable row level security;

alter table public.partner_practices enable row level security;

create policy "partners can read own practice grants"
on public.partner_practices for select
using (partner_id = auth.uid());

create policy "practice owners can manage partner grants"
on public.partner_practices for all
using (exists (
  select 1 from public.practices
  where practices.id = partner_practices.practice_id
  and practices.owner_id = auth.uid()
))
with check (exists (
  select 1 from public.practices
  where practices.id = partner_practices.practice_id
  and practices.owner_id = auth.uid()
));

alter table public.white_label_partners
  add column if not exists support_email text,
  add column if not exists support_phone text,
  add column if not exists features jsonb not null default '{"show_praxisshield_branding": true, "allow_direct_signup": false}'::jsonb,
  add column if not exists pricing jsonb not null default '{"margin_percent": 0}'::jsonb;

create policy "partner access can read checks"
on public.security_checks for select
using (practice_id in (
  select practice_id from public.partner_practices
  where partner_id = auth.uid()
  and role in ('owner', 'manager', 'viewer', 'white_label')
));

create policy "partner access can read reports"
on public.reports for select
using (practice_id in (
  select practice_id from public.partner_practices
  where partner_id = auth.uid()
  and role in ('owner', 'manager', 'viewer', 'white_label')
));
