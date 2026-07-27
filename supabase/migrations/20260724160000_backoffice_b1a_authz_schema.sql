-- B1a: Web-Backoffice-Fundament – Tenant/Authz-Schicht (additiv).
-- Fachplan: docs/WEB_BACKOFFICE_FOUNDATION.md, Entscheidungen E-023/E-024.
--
-- Diese Migration ist additiv und ändert kein bestehendes Zugriffsverhalten
-- rückwirkend: bestehende owner_id- und white_label-Zugriffe bleiben gültig.
-- Nicht-white_label-Grants aus partner_practices werden nach
-- practice_memberships migriert; danach berücksichtigt can_access_practice
-- partner_practices nur noch für white_label (kein Dual-Source, damit ein
-- Membership-Entzug den Zugriff wirklich entzieht).
--
-- Retention-/Anonymisierungs-Logik (retention/legal_hold/anonymized_at,
-- Anonymisierungs-RPC, Worker-Cron, Re-Identifizierungstest) folgt in B1b.

-- 1. Rollen-Enums ---------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'practice_member_role') then
    create type public.practice_member_role as enum ('practice_owner', 'practice_manager', 'assessor', 'viewer');
  end if;
  if not exists (select 1 from pg_type where typname = 'platform_staff_role') then
    create type public.platform_staff_role as enum ('platform_admin', 'security_consultant', 'support');
  end if;
end $$;

-- Grober RLS-Leserang der Praxis-Mitgliedsrollen. Ausschliesslich fuer die
-- additive Datenlesbarkeit; ersetzt keine Aktionsrechte (assessment.execute,
-- practice.manage, membership.manage, report.read) – die gehoeren
-- kapabilitaetsbasiert nach B2. Skala deckungsgleich mit partner_role_rank.
create or replace function public.practice_member_role_rank(p_role text)
returns integer
language sql
immutable
as $$
  select case p_role
    when 'viewer' then 10
    when 'assessor' then 20
    when 'practice_manager' then 30
    when 'practice_owner' then 40
    else null
  end;
$$;

-- 2. Neue Tabellen --------------------------------------------------------

create table if not exists public.platform_staff (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.platform_staff_role not null,
  status text not null default 'active' check (status in ('active', 'suspended')),
  mfa_required boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id)
);

create table if not exists public.practice_memberships (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.practice_member_role not null,
  status text not null default 'active' check (status in ('active', 'revoked')),
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz default now(),
  revoked_at timestamptz
);

-- Genau eine aktive Mitgliedschaft je Benutzer/Praxis.
create unique index if not exists practice_memberships_active_unique
  on public.practice_memberships (practice_id, user_id)
  where status = 'active';
create index if not exists practice_memberships_user_idx on public.practice_memberships (user_id);
create index if not exists practice_memberships_practice_idx on public.practice_memberships (practice_id);

create table if not exists public.staff_practice_assignments (
  id uuid primary key default gen_random_uuid(),
  staff_user_id uuid not null references auth.users(id) on delete cascade,
  practice_id uuid not null references public.practices(id) on delete cascade,
  assignment_purpose text,
  status text not null default 'active' check (status in ('active', 'revoked')),
  assigned_by uuid references auth.users(id) on delete set null,
  assigned_at timestamptz default now(),
  revoked_at timestamptz
);

create unique index if not exists staff_practice_assignments_active_unique
  on public.staff_practice_assignments (staff_user_id, practice_id)
  where status = 'active';
create index if not exists staff_practice_assignments_practice_idx on public.staff_practice_assignments (practice_id);

create table if not exists public.practice_invitations (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices(id) on delete cascade,
  target_email text not null,
  intended_role public.practice_member_role not null default 'practice_owner',
  delivery_channel text not null default 'in_person_code' check (delivery_channel in ('in_person_code', 'email_link')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'expired', 'revoked')),
  -- Nur Hash/Provider-Referenz eines Nachweises, niemals Klartexttoken/Einmalcode.
  proof_reference text,
  expires_at timestamptz not null,
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  accepted_at timestamptz
);

create index if not exists practice_invitations_practice_idx on public.practice_invitations (practice_id);
create index if not exists practice_invitations_email_idx on public.practice_invitations (target_email);

-- Append-only. B1a legt Tabelle, RLS und Append-only-Grants an; Retention-
-- Felder und Anonymisierung folgen in B1b.
create table if not exists public.backoffice_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id uuid,
  practice_id uuid references public.practices(id) on delete set null,
  result text not null default 'success' check (result in ('success', 'failure')),
  request_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists backoffice_audit_events_practice_created_idx on public.backoffice_audit_events (practice_id, created_at desc);
create index if not exists backoffice_audit_events_actor_created_idx on public.backoffice_audit_events (actor_user_id, created_at desc);

-- 3. Additive Praxis-Stammdaten + Statusmaschine --------------------------
-- Pflichtfelder werden fuer neu im Backoffice angelegte Praxen im Worker (B2)
-- erzwungen; auf DB-Ebene bleiben sie nullable, damit die Migration bestehende
-- Zeilen nicht bricht. Bestehende Praxen bleiben onboarding_status = 'active'.

alter table public.practices
  add column if not exists practice_kind text check (practice_kind in ('general', 'health')),
  add column if not exists legal_name text,
  add column if not exists display_name text,
  add column if not exists contact_first_name text,
  add column if not exists contact_last_name text,
  add column if not exists contact_email text,
  add column if not exists contact_phone text,
  add column if not exists street text,
  add column if not exists postal_code text,
  add column if not exists city text,
  add column if not exists country_code text,
  add column if not exists onboarding_status text not null default 'active'
    check (onboarding_status in ('draft', 'invited', 'active', 'suspended', 'archived')),
  add column if not exists created_by_staff_id uuid references auth.users(id) on delete set null,
  add column if not exists updated_at timestamptz default now();

-- 4. Backfill nach practice_memberships (rein additiv) --------------------
-- Je owner_id eine aktive practice_owner-Mitgliedschaft.
insert into public.practice_memberships (practice_id, user_id, role, status, granted_by, granted_at)
select p.id, p.owner_id, 'practice_owner', 'active', p.owner_id, now()
from public.practices p
where p.owner_id is not null
on conflict (practice_id, user_id) where status = 'active' do nothing;

-- Nicht-white_label-Grants aus partner_practices uebernehmen (Rang erhalten).
insert into public.practice_memberships (practice_id, user_id, role, status, granted_by, granted_at)
select
  pp.practice_id,
  pp.partner_id,
  case pp.role
    when 'owner' then 'practice_owner'::public.practice_member_role
    when 'manager' then 'practice_manager'::public.practice_member_role
    when 'viewer' then 'viewer'::public.practice_member_role
  end,
  'active',
  pp.granted_by,
  coalesce(pp.granted_at, now())
from public.partner_practices pp
where pp.role <> 'white_label'
on conflict (practice_id, user_id) where status = 'active' do nothing;

-- 5. Backfill-Verifikation VOR dem Cutover --------------------------------
-- Schlaegt die Migration fehl (Rollback), falls ein bestehender Zugriff nicht
-- vollstaendig als Mitgliedschaft abgebildet wurde. Erst danach schaltet der
-- Funktions-Cutover partner_practices auf white_label um.
do $$
begin
  if exists (
    select 1
    from public.practices p
    where p.owner_id is not null
      and not exists (
        select 1 from public.practice_memberships m
        where m.practice_id = p.id
          and m.user_id = p.owner_id
          and m.status = 'active'
          and m.role = 'practice_owner'
      )
  ) then
    raise exception 'B1a backfill incomplete: practice owner without active practice_owner membership';
  end if;

  if exists (
    select 1
    from public.partner_practices pp
    where pp.role <> 'white_label'
      and not exists (
        select 1 from public.practice_memberships m
        where m.practice_id = pp.practice_id
          and m.user_id = pp.partner_id
          and m.status = 'active'
          and public.practice_member_role_rank(m.role::text) >= public.partner_role_rank(pp.role::text)
      )
  ) then
    raise exception 'B1a backfill incomplete: non-white_label partner grant without equivalent membership';
  end if;
end $$;

-- 6. Autorisierungs-Cutover ------------------------------------------------
-- can_access_practice wertet jetzt owner_id + aktive practice_memberships und
-- partner_practices NUR noch fuer white_label. Alle Tenant-Guards nutzen diese
-- Funktion, daher wirkt der Cutover projektweit ohne Policy-Aenderungen.
create or replace function public.can_access_practice(p_user_id uuid, p_practice_id uuid, p_required_role text default 'viewer')
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_user_id is not null
    and p_practice_id is not null
    and public.partner_role_rank(coalesce(p_required_role, 'viewer')) is not null
    and (
      exists (
        select 1
        from public.practices
        where id = p_practice_id
          and owner_id = p_user_id
      )
      or exists (
        select 1
        from public.practice_memberships
        where practice_id = p_practice_id
          and user_id = p_user_id
          and status = 'active'
          and public.practice_member_role_rank(role::text) >= public.partner_role_rank(coalesce(p_required_role, 'viewer'))
      )
      or exists (
        select 1
        from public.partner_practices
        where practice_id = p_practice_id
          and partner_id = p_user_id
          and role = 'white_label'
          and public.partner_role_rank(role::text) >= public.partner_role_rank(coalesce(p_required_role, 'viewer'))
      )
    );
$$;

-- 7. Owner-Wechsel atomar + Schutz des letzten aktiven Eigentuemers -------

create or replace function public.guard_last_practice_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.role = 'practice_owner'
     and old.status = 'active'
     and (tg_op = 'DELETE' or new.status <> 'active' or new.role <> 'practice_owner')
     and not exists (
       select 1 from public.practice_memberships
       where practice_id = old.practice_id
         and role = 'practice_owner'
         and status = 'active'
         and id <> old.id
     )
  then
    raise exception 'cannot remove or demote the last active practice_owner for practice %', old.practice_id;
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists practice_memberships_guard_last_owner on public.practice_memberships;
create trigger practice_memberships_guard_last_owner
before update or delete on public.practice_memberships
for each row execute function public.guard_last_practice_owner();

-- Setzt owner_id und die practice_owner-Mitgliedschaft in einer Transaktion.
create or replace function public.transfer_practice_ownership(
  p_practice_id uuid,
  p_new_owner uuid,
  p_actor uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_practice_id is null or p_new_owner is null then
    raise exception 'practice and new owner are required';
  end if;

  insert into public.practice_memberships (practice_id, user_id, role, status, granted_by, granted_at)
  values (p_practice_id, p_new_owner, 'practice_owner', 'active', p_actor, now())
  on conflict (practice_id, user_id) where status = 'active'
  do update set role = 'practice_owner';

  update public.practices
  set owner_id = p_new_owner,
      updated_at = now()
  where id = p_practice_id;
end $$;

-- 8. RLS ------------------------------------------------------------------

alter table public.platform_staff enable row level security;
alter table public.platform_staff force row level security;
alter table public.practice_memberships enable row level security;
alter table public.practice_memberships force row level security;
alter table public.staff_practice_assignments enable row level security;
alter table public.staff_practice_assignments force row level security;
alter table public.practice_invitations enable row level security;
alter table public.practice_invitations force row level security;
alter table public.backoffice_audit_events enable row level security;
alter table public.backoffice_audit_events force row level security;

-- Aktive Plattformrolle des aktuellen Benutzers (security definer, umgeht RLS).
create or replace function public.current_user_platform_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role::text
  from public.platform_staff
  where user_id = auth.uid()
    and status = 'active'
  limit 1;
$$;

-- platform_staff: Benutzer sieht nur die eigene Zeile; Verwaltung serverseitig.
drop policy if exists "platform staff can read own record" on public.platform_staff;
create policy "platform staff can read own record"
on public.platform_staff for select
using (user_id = auth.uid());

-- practice_memberships: eigene Mitgliedschaften lesbar; Manager der Praxis
-- sehen alle; Schreiben nur fuer Owner (bzw. serverseitig via service_role).
drop policy if exists "tenant guard: practice memberships" on public.practice_memberships;
create policy "tenant guard: practice memberships"
on public.practice_memberships
as restrictive
for all
using (user_id = auth.uid() or public.current_user_can_access_practice(practice_id, 'manager'))
with check (public.current_user_can_access_practice(practice_id, 'owner'));

-- staff_practice_assignments: Mitarbeitende sehen eigene Zuweisungen.
drop policy if exists "staff can read own assignments" on public.staff_practice_assignments;
create policy "staff can read own assignments"
on public.staff_practice_assignments for select
using (staff_user_id = auth.uid());

-- practice_invitations: Manager+ der Zielpraxis lesen; Schreiben serverseitig.
drop policy if exists "tenant guard: practice invitations" on public.practice_invitations;
create policy "tenant guard: practice invitations"
on public.practice_invitations for select
using (public.current_user_can_access_practice(practice_id, 'manager'));

-- backoffice_audit_events: Lesen nur fuer platform_admin/security_consultant.
-- Kein UPDATE/DELETE-Grant (append-only); Schreiben serverseitig via service_role.
drop policy if exists "backoffice audit readable by platform staff" on public.backoffice_audit_events;
create policy "backoffice audit readable by platform staff"
on public.backoffice_audit_events for select
using (public.current_user_platform_role() in ('platform_admin', 'security_consultant'));

-- 9. Grants ---------------------------------------------------------------

grant usage on schema public to authenticated;
grant select on public.platform_staff to authenticated;
grant select on public.practice_memberships to authenticated;
grant select on public.staff_practice_assignments to authenticated;
grant select on public.practice_invitations to authenticated;
grant select on public.backoffice_audit_events to authenticated;

grant usage on schema public to service_role;
grant select, insert, update, delete on public.platform_staff to service_role;
grant select, insert, update, delete on public.practice_memberships to service_role;
grant select, insert, update, delete on public.staff_practice_assignments to service_role;
grant select, insert, update, delete on public.practice_invitations to service_role;
-- Append-only: bewusst nur select + insert, kein update/delete.
grant select, insert on public.backoffice_audit_events to service_role;

-- Owner-Transfer-RPC ausschliesslich serverseitig aufrufbar.
revoke execute on function public.transfer_practice_ownership(uuid, uuid, uuid) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on function public.transfer_practice_ownership(uuid, uuid, uuid) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke execute on function public.transfer_practice_ownership(uuid, uuid, uuid) from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.transfer_practice_ownership(uuid, uuid, uuid) to service_role';
  end if;
end $$;
