create or replace function public.current_user_owns_practice(p_practice_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.practices
    where id = p_practice_id
      and owner_id = auth.uid()
  );
$$;

create or replace function public.partner_role_rank(p_role text)
returns integer
language sql
immutable
as $$
  select case p_role
    when 'viewer' then 10
    when 'white_label' then 20
    when 'manager' then 30
    when 'owner' then 40
    else null
  end;
$$;

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
        from public.partner_practices
        where practice_id = p_practice_id
          and partner_id = p_user_id
          and public.partner_role_rank(role::text) >= public.partner_role_rank(coalesce(p_required_role, 'viewer'))
      )
    );
$$;

create or replace function public.current_user_can_access_practice(p_practice_id uuid, p_required_role text default 'viewer')
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_access_practice(auth.uid(), p_practice_id, p_required_role);
$$;

create or replace function public.current_user_can_access_partner_profile(p_partner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.white_label_partners
    where id = p_partner_id
      and owner_id = auth.uid()
  );
$$;

create or replace function public.audit_partner_practice_access(
  p_user_id uuid,
  p_practice_id uuid,
  p_action text,
  p_resource text,
  p_metadata jsonb default '{}'::jsonb,
  p_ip_hash text default null,
  p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_partner_role text;
begin
  select partner_practices.role::text
  into v_partner_role
  from public.partner_practices
  where partner_practices.practice_id = p_practice_id
    and partner_practices.partner_id = p_user_id
  limit 1;

  if v_partner_role is null then
    return;
  end if;

  if exists (
    select 1
    from public.practices
    where practices.id = p_practice_id
      and practices.owner_id = p_user_id
  ) then
    return;
  end if;

  insert into public.practice_access_audit (practice_id, user_id, action, resource, metadata, ip_hash, user_agent)
  values (
    p_practice_id,
    p_user_id,
    p_action,
    p_resource,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('partner_role', v_partner_role),
    p_ip_hash,
    p_user_agent
  );
end;
$$;

create or replace function public.report_check_belongs_to_practice(p_check_id uuid, p_practice_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_check_id is null
    or exists (
      select 1
      from public.security_checks
      where id = p_check_id
        and practice_id = p_practice_id
    );
$$;

alter table public.white_label_partners force row level security;
alter table public.practices force row level security;
alter table public.security_checks force row level security;
alter table public.reports force row level security;
alter table public.monitoring_events force row level security;
alter table public.monitoring_snapshots force row level security;
alter table public.wlan_scans force row level security;
alter table public.external_check_usage force row level security;
alter table public.practice_access_audit force row level security;
alter table public.data_processing_agreements force row level security;
alter table public.deletion_requests force row level security;
alter table public.partner_plan_pricing force row level security;
alter table public.consent_log force row level security;
alter table public.partner_practices force row level security;
alter table public.email_outbox force row level security;

drop policy if exists "tenant guard: white label owner" on public.white_label_partners;
create policy "tenant guard: white label owner"
on public.white_label_partners
as restrictive
for all
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "partner access can read checks" on public.security_checks;
create policy "partner access can read checks"
on public.security_checks for select
using (public.current_user_can_access_practice(practice_id, 'viewer'));

drop policy if exists "partner access can read reports" on public.reports;
create policy "partner access can read reports"
on public.reports for select
using (public.current_user_can_access_practice(practice_id, 'viewer'));

drop policy if exists "partner access can read monitoring snapshots" on public.monitoring_snapshots;
create policy "partner access can read monitoring snapshots"
on public.monitoring_snapshots for select
using (public.current_user_can_access_practice(practice_id, 'viewer'));

drop policy if exists "tenant guard: practices" on public.practices;
create policy "tenant guard: practices"
on public.practices
as restrictive
for all
using (public.current_user_can_access_practice(id, 'viewer'))
with check (
  owner_id = auth.uid()
  and (
    white_label_partner_id is null
    or public.current_user_can_access_partner_profile(white_label_partner_id)
  )
);

drop policy if exists "tenant guard: security checks practice" on public.security_checks;
create policy "tenant guard: security checks practice"
on public.security_checks
as restrictive
for all
using (public.current_user_can_access_practice(practice_id, 'viewer'))
with check (public.current_user_can_access_practice(practice_id, 'manager'));

drop policy if exists "tenant guard: reports practice and check" on public.reports;
create policy "tenant guard: reports practice and check"
on public.reports
as restrictive
for all
using (
  public.current_user_can_access_practice(practice_id, 'viewer')
  and public.report_check_belongs_to_practice(check_id, practice_id)
)
with check (
  public.current_user_can_access_practice(practice_id, 'manager')
  and public.report_check_belongs_to_practice(check_id, practice_id)
);

drop policy if exists "tenant guard: monitoring events practice" on public.monitoring_events;
create policy "tenant guard: monitoring events practice"
on public.monitoring_events
as restrictive
for all
using (public.current_user_can_access_practice(practice_id, 'viewer'))
with check (public.current_user_can_access_practice(practice_id, 'manager'));

drop policy if exists "tenant guard: monitoring snapshots practice" on public.monitoring_snapshots;
create policy "tenant guard: monitoring snapshots practice"
on public.monitoring_snapshots
as restrictive
for all
using (public.current_user_can_access_practice(practice_id, 'viewer'))
with check (public.current_user_can_access_practice(practice_id, 'manager'));

drop policy if exists "tenant guard: wlan scans practice" on public.wlan_scans;
create policy "tenant guard: wlan scans practice"
on public.wlan_scans
as restrictive
for all
using (public.current_user_can_access_practice(practice_id, 'viewer'))
with check (public.current_user_can_access_practice(practice_id, 'manager'));

drop policy if exists "tenant guard: external usage practice and user" on public.external_check_usage;
create policy "tenant guard: external usage practice and user"
on public.external_check_usage
as restrictive
for all
using (user_id = auth.uid() and public.current_user_can_access_practice(practice_id, 'viewer'))
with check (user_id = auth.uid() and public.current_user_can_access_practice(practice_id, 'manager'));

drop policy if exists "tenant guard: practice audit practice and user" on public.practice_access_audit;
create policy "tenant guard: practice audit practice and user"
on public.practice_access_audit
as restrictive
for all
using (
  user_id = auth.uid()
  and (practice_id is null or public.current_user_can_access_practice(practice_id, 'viewer'))
)
with check (
  user_id = auth.uid()
  and (practice_id is null or public.current_user_can_access_practice(practice_id, 'manager'))
);

drop policy if exists "tenant guard: avv practice and user" on public.data_processing_agreements;
create policy "tenant guard: avv practice and user"
on public.data_processing_agreements
as restrictive
for all
using (user_id = auth.uid() and public.current_user_can_access_practice(practice_id, 'viewer'))
with check (user_id = auth.uid() and public.current_user_can_access_practice(practice_id, 'manager'));

drop policy if exists "tenant guard: deletion requests user and practice" on public.deletion_requests;
create policy "tenant guard: deletion requests user and practice"
on public.deletion_requests
as restrictive
for all
using (
  user_id = auth.uid()
  and (practice_id is null or public.current_user_can_access_practice(practice_id, 'viewer'))
)
with check (
  user_id = auth.uid()
  and (practice_id is null or public.current_user_can_access_practice(practice_id, 'manager'))
);

drop policy if exists "tenant guard: partner pricing owner" on public.partner_plan_pricing;
create policy "tenant guard: partner pricing owner"
on public.partner_plan_pricing
as restrictive
for all
using (public.current_user_can_access_partner_profile(partner_id))
with check (public.current_user_can_access_partner_profile(partner_id));

drop policy if exists "tenant guard: consent log practice" on public.consent_log;
create policy "tenant guard: consent log practice"
on public.consent_log
as restrictive
for all
using (public.current_user_can_access_practice(practice_id, 'viewer'))
with check (public.current_user_can_access_practice(practice_id, 'manager'));

drop policy if exists "tenant guard: partner practice grant" on public.partner_practices;
create policy "tenant guard: partner practice grant"
on public.partner_practices
as restrictive
for all
using (partner_id = auth.uid() or public.current_user_can_access_practice(practice_id, 'owner'))
with check (public.current_user_can_access_practice(practice_id, 'owner'));

revoke execute on function public.consume_external_check_quota(uuid, uuid, date, integer) from public;
revoke execute on function public.audit_partner_practice_access(uuid, uuid, text, text, jsonb, text, text) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on function public.consume_external_check_quota(uuid, uuid, date, integer) from anon';
    execute 'revoke execute on function public.audit_partner_practice_access(uuid, uuid, text, text, jsonb, text, text) from anon';
  end if;

  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke execute on function public.consume_external_check_quota(uuid, uuid, date, integer) from authenticated';
    execute 'revoke execute on function public.audit_partner_practice_access(uuid, uuid, text, text, jsonb, text, text) from authenticated';
  end if;

  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.consume_external_check_quota(uuid, uuid, date, integer) to service_role';
    execute 'grant execute on function public.audit_partner_practice_access(uuid, uuid, text, text, jsonb, text, text) to service_role';
  end if;
end $$;
