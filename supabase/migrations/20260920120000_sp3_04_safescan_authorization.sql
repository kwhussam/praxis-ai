-- SP3-04: SafeScan authorization lifecycle. This migration intentionally does
-- not create scan jobs or active probes.

create table public.scan_authorizations (
  id uuid primary key,
  practice_id uuid not null references public.practices(id) on delete cascade,
  schema_version text not null,
  policy_version text not null,
  site_ref text not null,
  actor_user_id uuid not null,
  actor_role text not null,
  authorized_at timestamptz not null,
  valid_from timestamptz not null,
  valid_until timestamptz not null,
  max_safety_class smallint not null,
  target_count integer not null,
  exclusion_count integer not null,
  scope_sha256 text not null,
  encrypted_scope jsonb not null,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  constraint scan_authorizations_id_practice_unique unique (id, practice_id),
  constraint scan_authorizations_idempotency_unique unique (practice_id, idempotency_key),
  constraint scan_authorizations_schema_check check (schema_version = '1.0.0'),
  constraint scan_authorizations_policy_check check (policy_version = 'de-health-safescan-1.0.0'),
  constraint scan_authorizations_site_check check (site_ref ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  constraint scan_authorizations_actor_role_check check (actor_role in ('practice_owner', 'practice_manager')),
  constraint scan_authorizations_time_check check (
    authorized_at <= valid_from and valid_until > valid_from
    and valid_until <= valid_from + interval '31 days'
  ),
  constraint scan_authorizations_safety_check check (max_safety_class between 0 and 2),
  constraint scan_authorizations_count_check check (target_count > 0 and exclusion_count >= 0 and exclusion_count <= target_count),
  constraint scan_authorizations_hash_check check (scope_sha256 ~ '^[0-9a-f]{64}$'),
  constraint scan_authorizations_envelope_check check (
    jsonb_typeof(encrypted_scope) = 'object'
    and encrypted_scope ?& array['envelope_version', 'alg', 'key_version', 'iv', 'ciphertext', 'aad_sha256']
    and encrypted_scope - array['envelope_version', 'alg', 'key_version', 'iv', 'ciphertext', 'aad_sha256'] = '{}'::jsonb
    and encrypted_scope ->> 'envelope_version' = '2'
    and encrypted_scope ->> 'alg' = 'AES-256-GCM'
    and encrypted_scope ->> 'aad_sha256' ~ '^[0-9a-f]{64}$'
  ),
  constraint scan_authorizations_idempotency_check check (length(idempotency_key) between 1 and 128)
);

create index scan_authorizations_practice_validity_idx
on public.scan_authorizations (practice_id, valid_until desc);

create table public.scan_authorization_events (
  id uuid primary key default gen_random_uuid(),
  authorization_id uuid not null,
  practice_id uuid not null,
  event_type text not null,
  actor_user_id uuid not null,
  reason_code text not null,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint scan_authorization_events_authorization_fkey
    foreign key (authorization_id, practice_id)
    references public.scan_authorizations(id, practice_id)
    on delete cascade,
  constraint scan_authorization_events_type_check check (event_type in ('granted', 'revoked')),
  constraint scan_authorization_events_reason_check check (reason_code ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$')
);

create index scan_authorization_events_latest_idx
on public.scan_authorization_events (authorization_id, occurred_at desc, created_at desc, id desc);

create table public.scan_kill_switch_events (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices(id) on delete cascade,
  enabled boolean not null,
  actor_user_id uuid not null,
  reason_code text not null,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint scan_kill_switch_events_reason_check check (reason_code ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$')
);

create index scan_kill_switch_events_latest_idx
on public.scan_kill_switch_events (practice_id, occurred_at desc, created_at desc, id desc);

alter table public.scan_authorizations enable row level security;
alter table public.scan_authorizations force row level security;
alter table public.scan_authorization_events enable row level security;
alter table public.scan_authorization_events force row level security;
alter table public.scan_kill_switch_events enable row level security;
alter table public.scan_kill_switch_events force row level security;

create policy "scan authorizations are manager readable"
on public.scan_authorizations for select
using (public.current_user_can_access_practice(practice_id, 'manager'));

create policy "scan authorization events are manager readable"
on public.scan_authorization_events for select
using (public.current_user_can_access_practice(practice_id, 'manager'));

create policy "scan kill switch events are manager readable"
on public.scan_kill_switch_events for select
using (public.current_user_can_access_practice(practice_id, 'manager'));

revoke all on public.scan_authorizations from public, anon, authenticated, service_role;
revoke all on public.scan_authorization_events from public, anon, authenticated, service_role;
revoke all on public.scan_kill_switch_events from public, anon, authenticated, service_role;

grant select (
  id, practice_id, schema_version, policy_version, site_ref, actor_user_id, actor_role,
  authorized_at, valid_from, valid_until, max_safety_class, target_count, exclusion_count,
  scope_sha256, created_at
) on public.scan_authorizations to authenticated;
grant select on public.scan_authorizations to service_role;
grant select on public.scan_authorization_events to authenticated, service_role;
grant select on public.scan_kill_switch_events to authenticated, service_role;

create or replace function public.reject_scan_safety_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'SafeScan authorization evidence is immutable' using errcode = '42501';
end;
$$;

revoke execute on function public.reject_scan_safety_mutation() from public, anon, authenticated, service_role;

create trigger scan_authorizations_immutable
before update on public.scan_authorizations
for each row execute function public.reject_scan_safety_mutation();

create trigger scan_authorization_events_immutable
before update on public.scan_authorization_events
for each row execute function public.reject_scan_safety_mutation();

create trigger scan_kill_switch_events_immutable
before update on public.scan_kill_switch_events
for each row execute function public.reject_scan_safety_mutation();

create or replace function public.persist_scan_authorization(
  p_authorization jsonb,
  p_encrypted_scope jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_authorization_id uuid;
  v_practice_id uuid;
  v_actor_user_id uuid;
  v_actor_role text;
  v_scope_sha256 text;
  v_target_count integer;
  v_exclusion_count integer;
  v_target jsonb;
  v_exclusion jsonb;
  v_window jsonb;
  v_existing public.scan_authorizations%rowtype;
begin
  if jsonb_typeof(p_authorization) <> 'object'
     or not (p_authorization ?& array[
       'schema_version', 'authorization_id', 'practice_id', 'site_ref', 'policy_version',
       'actor', 'valid_from', 'valid_until', 'max_safety_class', 'maintenance_windows',
       'scope', 'stop_conditions', 'integrity'
     ])
     or p_authorization - array[
       'schema_version', 'authorization_id', 'practice_id', 'site_ref', 'policy_version',
       'actor', 'valid_from', 'valid_until', 'max_safety_class', 'maintenance_windows',
       'scope', 'stop_conditions', 'integrity'
     ] <> '{}'::jsonb
  then
    raise exception 'scan_authorization_invalid_contract' using errcode = '22023';
  end if;

  begin
    v_authorization_id := (p_authorization ->> 'authorization_id')::uuid;
    v_practice_id := (p_authorization ->> 'practice_id')::uuid;
    v_actor_user_id := (p_authorization #>> '{actor,user_id}')::uuid;
  exception when invalid_text_representation then
    raise exception 'scan_authorization_invalid_identity' using errcode = '22023';
  end;

  -- Never trust the actor role claimed by the caller. Only direct active
  -- practice ownership/membership can authorize scanning; white-label access
  -- is deliberately insufficient.
  if exists (
    select 1 from public.practices
    where id = v_practice_id and owner_id = v_actor_user_id
  ) or exists (
    select 1 from public.practice_memberships
    where practice_id = v_practice_id and user_id = v_actor_user_id
      and role = 'practice_owner' and status = 'active'
  ) then
    v_actor_role := 'practice_owner';
  elsif exists (
    select 1 from public.practice_memberships
    where practice_id = v_practice_id and user_id = v_actor_user_id
      and role = 'practice_manager' and status = 'active'
  ) then
    v_actor_role := 'practice_manager';
  else
    raise exception 'scan_authorization_actor_forbidden' using errcode = '42501';
  end if;

  if p_authorization #>> '{actor,role}' <> v_actor_role then
    raise exception 'scan_authorization_actor_role_mismatch' using errcode = '22023';
  end if;

  if jsonb_typeof(p_authorization -> 'maintenance_windows') <> 'array'
     or jsonb_typeof(p_authorization #> '{scope,targets}') <> 'array'
     or jsonb_typeof(p_authorization #> '{scope,exclusions}') <> 'array'
     or jsonb_typeof(p_authorization -> 'stop_conditions') <> 'array'
     or (p_authorization -> 'actor') - array['user_id', 'role', 'authorized_at'] <> '{}'::jsonb
     or (p_authorization -> 'scope') - array['targets', 'exclusions'] <> '{}'::jsonb
     or (p_authorization -> 'integrity') - array['scope_sha256'] <> '{}'::jsonb
  then
    raise exception 'scan_authorization_invalid_contract' using errcode = '22023';
  end if;

  v_target_count := jsonb_array_length(p_authorization #> '{scope,targets}');
  v_exclusion_count := jsonb_array_length(p_authorization #> '{scope,exclusions}');
  v_scope_sha256 := p_authorization #>> '{integrity,scope_sha256}';

  if p_authorization ->> 'schema_version' <> '1.0.0'
     or p_authorization ->> 'policy_version' <> 'de-health-safescan-1.0.0'
     or p_authorization ->> 'site_ref' !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
     or (p_authorization #>> '{actor,authorized_at}')::timestamptz > (p_authorization ->> 'valid_from')::timestamptz
     or (p_authorization #>> '{actor,authorized_at}')::timestamptz > clock_timestamp()
     or (p_authorization ->> 'valid_until')::timestamptz <= (p_authorization ->> 'valid_from')::timestamptz
     or (p_authorization ->> 'valid_until')::timestamptz > (p_authorization ->> 'valid_from')::timestamptz + interval '31 days'
     or (p_authorization ->> 'max_safety_class')::integer not between 0 and 2
     or v_target_count < 1
     or v_exclusion_count > v_target_count
     or (select count(distinct value ->> 'id') from jsonb_array_elements(p_authorization #> '{scope,targets}')) <> v_target_count
     or (select count(distinct value ->> 'target_id') from jsonb_array_elements(p_authorization #> '{scope,exclusions}')) <> v_exclusion_count
     or v_scope_sha256 !~ '^[0-9a-f]{64}$'
     or p_idempotency_key is null or length(p_idempotency_key) not between 1 and 128
     or jsonb_typeof(p_encrypted_scope) <> 'object'
     or not (p_encrypted_scope ?& array['envelope_version', 'alg', 'key_version', 'iv', 'ciphertext', 'aad_sha256'])
     or p_encrypted_scope - array['envelope_version', 'alg', 'key_version', 'iv', 'ciphertext', 'aad_sha256'] <> '{}'::jsonb
     or p_encrypted_scope ->> 'envelope_version' <> '2'
     or p_encrypted_scope ->> 'alg' <> 'AES-256-GCM'
     or p_encrypted_scope ->> 'aad_sha256' !~ '^[0-9a-f]{64}$'
     or not (p_authorization -> 'stop_conditions' @> '["kill_switch","clinical_impact_reported","connectivity_degradation","unexpected_medical_device","error_threshold_exceeded","authorization_changed"]'::jsonb)
     or jsonb_array_length(p_authorization -> 'stop_conditions') <> 6
     or exists (
       select 1 from jsonb_array_elements_text(p_authorization -> 'stop_conditions') as stop_condition(value)
       where value not in (
         'kill_switch', 'clinical_impact_reported', 'connectivity_degradation',
         'unexpected_medical_device', 'error_threshold_exceeded', 'authorization_changed'
       )
     )
  then
    raise exception 'scan_authorization_invalid_contract' using errcode = '22023';
  end if;

  for v_window in select value from jsonb_array_elements(p_authorization -> 'maintenance_windows')
  loop
    if jsonb_typeof(v_window) <> 'object'
       or not (v_window ?& array['id', 'starts_at', 'ends_at'])
       or v_window - array['id', 'starts_at', 'ends_at'] <> '{}'::jsonb
       or (v_window ->> 'ends_at')::timestamptz <= (v_window ->> 'starts_at')::timestamptz
       or (v_window ->> 'starts_at')::timestamptz < (p_authorization ->> 'valid_from')::timestamptz
       or (v_window ->> 'ends_at')::timestamptz > (p_authorization ->> 'valid_until')::timestamptz
    then raise exception 'scan_authorization_invalid_window' using errcode = '22023'; end if;
  end loop;

  for v_target in select value from jsonb_array_elements(p_authorization #> '{scope,targets}')
  loop
    if jsonb_typeof(v_target) <> 'object'
       or not (v_target ?& array['id', 'kind', 'locator', 'asset_class', 'max_safety_class', 'elevated_approval'])
       or v_target - array['id', 'kind', 'locator', 'asset_class', 'max_safety_class', 'elevated_approval'] <> '{}'::jsonb
       or v_target ->> 'kind' not in ('cidr', 'host', 'asset')
       or v_target ->> 'asset_class' not in ('standard', 'medical_device', 'unknown')
       or (v_target ->> 'max_safety_class')::integer not between 0 and 2
       or (v_target ->> 'max_safety_class')::integer > (p_authorization ->> 'max_safety_class')::integer
       or (
         v_target ->> 'asset_class' in ('medical_device', 'unknown')
         and (v_target ->> 'max_safety_class')::integer > 1
         and (
           jsonb_typeof(v_target -> 'elevated_approval') <> 'object'
           or not (v_target -> 'elevated_approval' ?& array[
             'approved_by_user_id', 'approved_at', 'expires_at', 'reason_code', 'clinical_owner_approved'
           ])
           or (v_target -> 'elevated_approval') - array[
             'approved_by_user_id', 'approved_at', 'expires_at', 'reason_code', 'clinical_owner_approved'
           ] <> '{}'::jsonb
           or v_target #>> '{elevated_approval,clinical_owner_approved}' <> 'true'
           or (v_target #>> '{elevated_approval,approved_at}')::timestamptz > (p_authorization ->> 'valid_from')::timestamptz
           or (v_target #>> '{elevated_approval,approved_at}')::timestamptz > clock_timestamp()
           or (v_target #>> '{elevated_approval,expires_at}')::timestamptz <= (v_target #>> '{elevated_approval,approved_at}')::timestamptz
           or (v_target #>> '{elevated_approval,expires_at}')::timestamptz > (p_authorization ->> 'valid_until')::timestamptz
           or not (
             exists (
               select 1 from public.practices
               where id = v_practice_id
                 and owner_id = (v_target #>> '{elevated_approval,approved_by_user_id}')::uuid
             )
             or exists (
               select 1 from public.practice_memberships
               where practice_id = v_practice_id
                 and user_id = (v_target #>> '{elevated_approval,approved_by_user_id}')::uuid
                 and role = 'practice_owner' and status = 'active'
             )
           )
         )
       )
    then raise exception 'scan_authorization_invalid_target' using errcode = '22023'; end if;
  end loop;

  for v_exclusion in select value from jsonb_array_elements(p_authorization #> '{scope,exclusions}')
  loop
    if jsonb_typeof(v_exclusion) <> 'object'
       or not (v_exclusion ?& array['target_id', 'reason_code'])
       or v_exclusion - array['target_id', 'reason_code'] <> '{}'::jsonb
       or v_exclusion ->> 'target_id' !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
       or v_exclusion ->> 'reason_code' !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
       or not exists (
         select 1 from jsonb_array_elements(p_authorization #> '{scope,targets}') as target(value)
         where target.value ->> 'id' = v_exclusion ->> 'target_id'
       )
    then raise exception 'scan_authorization_invalid_exclusion' using errcode = '22023'; end if;
  end loop;

  perform pg_advisory_xact_lock(hashtextextended(v_practice_id::text || ':' || p_idempotency_key, 0));
  select * into v_existing from public.scan_authorizations
  where practice_id = v_practice_id and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.scope_sha256 <> v_scope_sha256 or v_existing.id <> v_authorization_id then
      raise exception 'scan_authorization_idempotency_conflict' using errcode = '23505';
    end if;
    return jsonb_build_object('authorization_id', v_existing.id, 'scope_sha256', v_existing.scope_sha256);
  end if;

  insert into public.scan_authorizations (
    id, practice_id, schema_version, policy_version, site_ref, actor_user_id, actor_role,
    authorized_at, valid_from, valid_until, max_safety_class, target_count, exclusion_count,
    scope_sha256, encrypted_scope, idempotency_key
  ) values (
    v_authorization_id, v_practice_id, p_authorization ->> 'schema_version',
    p_authorization ->> 'policy_version', p_authorization ->> 'site_ref', v_actor_user_id,
    v_actor_role, (p_authorization #>> '{actor,authorized_at}')::timestamptz,
    (p_authorization ->> 'valid_from')::timestamptz, (p_authorization ->> 'valid_until')::timestamptz,
    (p_authorization ->> 'max_safety_class')::smallint, v_target_count, v_exclusion_count,
    v_scope_sha256, p_encrypted_scope, p_idempotency_key
  );

  insert into public.scan_authorization_events (
    authorization_id, practice_id, event_type, actor_user_id, reason_code, occurred_at
  ) values (
    v_authorization_id, v_practice_id, 'granted', v_actor_user_id, 'authorization_created',
    clock_timestamp()
  );

  return jsonb_build_object('authorization_id', v_authorization_id, 'scope_sha256', v_scope_sha256);
exception
  when invalid_text_representation or datetime_field_overflow or numeric_value_out_of_range then
    raise exception 'scan_authorization_invalid_contract' using errcode = '22023';
end;
$$;

create or replace function public.revoke_scan_authorization(
  p_authorization_id uuid,
  p_practice_id uuid,
  p_actor_user_id uuid,
  p_reason_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_latest text;
begin
  if p_reason_code !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' then
    raise exception 'scan_authorization_invalid_reason' using errcode = '22023';
  end if;
  if not (
    exists (select 1 from public.practices where id = p_practice_id and owner_id = p_actor_user_id)
    or exists (
      select 1 from public.practice_memberships where practice_id = p_practice_id
      and user_id = p_actor_user_id and role in ('practice_owner', 'practice_manager') and status = 'active'
    )
  ) then raise exception 'scan_authorization_actor_forbidden' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.scan_authorizations where id = p_authorization_id and practice_id = p_practice_id
  ) then raise exception 'scan_authorization_not_found' using errcode = 'P0002'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_practice_id::text || ':' || p_authorization_id::text, 0));
  select event_type into v_latest from public.scan_authorization_events
  where authorization_id = p_authorization_id and practice_id = p_practice_id
  order by occurred_at desc, created_at desc, id desc limit 1;
  if v_latest = 'revoked' then
    return jsonb_build_object('authorization_id', p_authorization_id, 'state', 'revoked');
  end if;
  insert into public.scan_authorization_events (
    authorization_id, practice_id, event_type, actor_user_id, reason_code, occurred_at
  ) values (p_authorization_id, p_practice_id, 'revoked', p_actor_user_id, p_reason_code, clock_timestamp());
  return jsonb_build_object('authorization_id', p_authorization_id, 'state', 'revoked');
end;
$$;

create or replace function public.set_scan_kill_switch(
  p_practice_id uuid,
  p_actor_user_id uuid,
  p_enabled boolean,
  p_reason_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_current boolean;
begin
  if p_reason_code !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$' then
    raise exception 'scan_kill_switch_invalid_reason' using errcode = '22023';
  end if;
  if not (
    exists (select 1 from public.practices where id = p_practice_id and owner_id = p_actor_user_id)
    or exists (
      select 1 from public.practice_memberships where practice_id = p_practice_id
      and user_id = p_actor_user_id and role in ('practice_owner', 'practice_manager') and status = 'active'
    )
  ) then raise exception 'scan_authorization_actor_forbidden' using errcode = '42501'; end if;

  perform pg_advisory_xact_lock(hashtextextended('scan-kill-switch:' || p_practice_id::text, 0));
  select enabled into v_current from public.scan_kill_switch_events
  where practice_id = p_practice_id
  order by occurred_at desc, created_at desc, id desc limit 1;
  if found and v_current = p_enabled then
    return jsonb_build_object('practice_id', p_practice_id, 'enabled', v_current);
  end if;
  insert into public.scan_kill_switch_events (
    practice_id, enabled, actor_user_id, reason_code, occurred_at
  ) values (p_practice_id, p_enabled, p_actor_user_id, p_reason_code, clock_timestamp());
  return jsonb_build_object('practice_id', p_practice_id, 'enabled', p_enabled);
end;
$$;

create or replace function public.check_scan_authorization_lifecycle(
  p_authorization_id uuid,
  p_practice_id uuid,
  p_policy_version text,
  p_requested_safety_class smallint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_authorization public.scan_authorizations%rowtype;
  v_latest_event text;
  v_kill_switch boolean := false;
  v_now timestamptz := clock_timestamp();
begin
  select * into v_authorization from public.scan_authorizations
  where id = p_authorization_id and practice_id = p_practice_id;
  if not found then return jsonb_build_object('allowed', false, 'reason_code', 'authorization_not_found'); end if;
  if p_policy_version <> v_authorization.policy_version then return jsonb_build_object('allowed', false, 'reason_code', 'policy_version_mismatch'); end if;
  if p_requested_safety_class not between 0 and 2 then return jsonb_build_object('allowed', false, 'reason_code', 'safety_class_prohibited'); end if;
  if p_requested_safety_class > v_authorization.max_safety_class then return jsonb_build_object('allowed', false, 'reason_code', 'safety_class_exceeds_authorization'); end if;
  if v_now < v_authorization.valid_from then return jsonb_build_object('allowed', false, 'reason_code', 'authorization_not_yet_valid'); end if;
  if v_now >= v_authorization.valid_until then return jsonb_build_object('allowed', false, 'reason_code', 'authorization_expired'); end if;

  select event_type into v_latest_event from public.scan_authorization_events
  where authorization_id = p_authorization_id and practice_id = p_practice_id
  order by occurred_at desc, created_at desc, id desc limit 1;
  if v_latest_event <> 'granted' then return jsonb_build_object('allowed', false, 'reason_code', 'authorization_revoked'); end if;

  select enabled into v_kill_switch from public.scan_kill_switch_events
  where practice_id = p_practice_id
  order by occurred_at desc, created_at desc, id desc limit 1;
  if coalesce(v_kill_switch, false) then return jsonb_build_object('allowed', false, 'reason_code', 'kill_switch_active'); end if;

  return jsonb_build_object(
    'allowed', true, 'authorization_id', v_authorization.id,
    'practice_id', v_authorization.practice_id, 'scope_sha256', v_authorization.scope_sha256,
    'policy_version', v_authorization.policy_version, 'max_safety_class', v_authorization.max_safety_class
  );
end;
$$;

revoke execute on function public.persist_scan_authorization(jsonb, jsonb, text) from public, anon, authenticated;
revoke execute on function public.revoke_scan_authorization(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.set_scan_kill_switch(uuid, uuid, boolean, text) from public, anon, authenticated;
revoke execute on function public.check_scan_authorization_lifecycle(uuid, uuid, text, smallint) from public, anon, authenticated;
grant execute on function public.persist_scan_authorization(jsonb, jsonb, text) to service_role;
grant execute on function public.revoke_scan_authorization(uuid, uuid, uuid, text) to service_role;
grant execute on function public.set_scan_kill_switch(uuid, uuid, boolean, text) to service_role;
grant execute on function public.check_scan_authorization_lifecycle(uuid, uuid, text, smallint) to service_role;

-- Extend erasure atomically. SafeScan scope is D2 and is never retained.
create or replace function public.complete_privacy_deletion(
  p_practice_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deletion_id uuid := gen_random_uuid();
  v_now timestamptz := now();
  v_legal_retention_until timestamptz := v_now + interval '6 years';
  v_monitoring_retention_until timestamptz := v_now + interval '1 year';
  v_report jsonb;
begin
  delete from public.inventory_items where practice_id = p_practice_id;
  delete from public.inventory_known_devices where practice_id = p_practice_id;
  delete from public.inventory_access_points where practice_id = p_practice_id;
  delete from public.router_wifi_configurations where practice_id = p_practice_id;
  delete from public.router_firewall_rules where practice_id = p_practice_id;
  delete from public.monitoring_targets where practice_id = p_practice_id;
  delete from public.wlan_scans where practice_id = p_practice_id;
  delete from public.scan_authorizations where practice_id = p_practice_id;
  delete from public.scan_kill_switch_events where practice_id = p_practice_id;
  delete from public.assessment_snapshots where practice_id = p_practice_id;
  delete from public.assessment_manifests where practice_id = p_practice_id;

  update public.practices
  set name = '[GELOESCHT]', domain = null, email = null, deleted_at = v_now
  where id = p_practice_id;

  update public.security_checks
  set results = jsonb_build_object('anonymized', true), encrypted_payload = '{}'::jsonb, anonymized_at = v_now
  where practice_id = p_practice_id;

  update public.reports
  set content = jsonb_build_object('anonymized', true), encrypted_content = '{}'::jsonb,
      report_manifest = null, report_manifest_sha256 = null, anonymized_at = v_now
  where practice_id = p_practice_id;

  update public.monitoring_events
  set title = '[GELOESCHT]', message = '', details = '{}'::jsonb, anonymized_at = v_now
  where practice_id = p_practice_id and anonymized_at is null;

  update public.monitoring_snapshots
  set ssl = '{}'::jsonb, email_security = '{}'::jsonb, devices = '{}'::jsonb,
      checks = '{}'::jsonb, encrypted_checks = '{}'::jsonb, payload_sha256 = null, anonymized_at = v_now
  where practice_id = p_practice_id and anonymized_at is null;

  v_report := jsonb_build_object(
    'deletion_id', v_deletion_id, 'practice_id', p_practice_id, 'requested_at', v_now, 'state', 'completed',
    'immediate_deletions', jsonb_build_array(
      'personal_data', 'wlan_scans', 'scan_authorizations', 'scan_authorization_events',
      'scan_kill_switch_events', 'assessment_snapshots', 'assessment_manifests', 'inventory_items',
      'inventory_known_devices', 'inventory_access_points', 'router_wifi_configurations',
      'router_firewall_rules', 'monitoring_targets'
    ),
    'anonymizations', jsonb_build_array('security_checks', 'reports', 'monitoring_events', 'monitoring_snapshots'),
    'retained_for_legal', jsonb_build_array('practice_access_audit', 'deletion_requests', 'consent_log', 'data_processing_agreements'),
    'retention_until', v_legal_retention_until, 'monitoring_retention_until', v_monitoring_retention_until,
    'completed_by', 'system'
  );

  insert into public.deletion_requests (
    id, practice_id, user_id, requested_by, status, state, requested_at, completed_at, report, metadata
  ) values (
    v_deletion_id, p_practice_id, p_user_id, p_user_id, 'completed', 'completed', v_now, v_now, v_report,
    jsonb_build_object('reason', 'user_requested_erasure')
  );
  return v_report;
end;
$$;

revoke execute on function public.complete_privacy_deletion(uuid, uuid) from public, anon, authenticated;
grant execute on function public.complete_privacy_deletion(uuid, uuid) to service_role;
