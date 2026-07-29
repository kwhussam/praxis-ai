-- B5b: admin-initiated password reset backend security boundary.
-- No OTP, recovery token/link, email address, IP address, password or free-form
-- metadata may be stored here.

-- Make the sensitive capability explicit even though platform_admin otherwise
-- has every capability. Non-admin roles fail before assignment scoping.
create or replace function public.backoffice_actor_can(
  p_actor uuid,
  p_capability text,
  p_practice_id uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
  v_scoped boolean;
begin
  if p_actor is null or p_capability is null then return false; end if;
  select role::text into v_role from public.platform_staff
  where user_id = p_actor and status = 'active' limit 1;
  if v_role is null then return false; end if;
  if p_capability = 'user.password_reset.initiate' then
    return v_role = 'platform_admin';
  end if;
  if v_role = 'platform_admin' then return true; end if;
  v_scoped := p_practice_id is null or exists (
    select 1 from public.staff_practice_assignments a
    where a.staff_user_id = p_actor and a.practice_id = p_practice_id and a.status = 'active'
  );
  if v_role = 'security_consultant' then
    return case p_capability
      when 'practice.create' then true
      when 'practice.read' then v_scoped
      when 'practice.manage' then v_scoped
      when 'invitation.manage' then v_scoped
      when 'membership.manage' then v_scoped
      when 'audit.read' then v_scoped
      else false
    end;
  end if;
  if v_role = 'support' then return p_capability = 'practice.read' and v_scoped; end if;
  return false;
end $$;

create table public.password_reset_rate_limit (
  dimension text not null check (dimension in ('target', 'ip')),
  subject_hash text not null check (subject_hash ~ '^[0-9a-f]{64}$'),
  window_start timestamptz not null,
  count integer not null default 0 check (count >= 0),
  updated_at timestamptz not null default now(),
  primary key (dimension, subject_hash, window_start)
);
alter table public.password_reset_rate_limit enable row level security;
alter table public.password_reset_rate_limit force row level security;
create index password_reset_rate_limit_cleanup_idx on public.password_reset_rate_limit (updated_at);

create table public.password_reset_audit_events (
  id uuid primary key default gen_random_uuid(),
  reset_request_id uuid not null unique,
  actor_user_id uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  practice_id uuid references public.practices(id) on delete set null,
  identity_verification text check (identity_verification in ('in_person', 'phone_verified')),
  result text not null check (result in ('success', 'failure')),
  error_code text,
  request_id text check (request_id is null or length(request_id) <= 200),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  retention_until timestamptz not null default (now() + interval '183 days'),
  legal_hold_until timestamptz,
  legal_hold_reason text,
  legal_hold_set_at timestamptz,
  legal_hold_set_by uuid references auth.users(id) on delete set null,
  anonymized_at timestamptz,
  constraint password_reset_audit_legal_hold_documented check (
    legal_hold_until is null or (
      legal_hold_reason is not null and length(btrim(legal_hold_reason)) > 0
      and legal_hold_set_at is not null
    )
  )
);
alter table public.password_reset_audit_events enable row level security;
alter table public.password_reset_audit_events force row level security;
create index password_reset_audit_retention_idx on public.password_reset_audit_events (retention_until, created_at)
where anonymized_at is null;

create policy "password reset audit admin read"
on public.password_reset_audit_events for select
using (public.current_user_platform_role() = 'platform_admin');

grant select on public.password_reset_audit_events to authenticated;
grant select, insert on public.password_reset_audit_events to service_role;

create or replace function public.password_reset_consume_rate_limit(
  p_dimension text, p_subject_hash text, p_window_minutes integer, p_limit integer
) returns boolean
language plpgsql security definer set search_path = public
as $$
declare v_bucket timestamptz; v_count integer;
begin
  if p_dimension not in ('target', 'ip') or p_subject_hash !~ '^[0-9a-f]{64}$'
     or p_window_minutes is null or p_window_minutes <= 0 or p_limit is null or p_limit < 0 then
    return false;
  end if;
  v_bucket := to_timestamp(floor(extract(epoch from now()) / (p_window_minutes * 60)) * (p_window_minutes * 60));
  insert into public.password_reset_rate_limit (dimension, subject_hash, window_start, count)
  values (p_dimension, p_subject_hash, v_bucket, 0) on conflict do nothing;
  select count into v_count from public.password_reset_rate_limit
  where dimension = p_dimension and subject_hash = p_subject_hash and window_start = v_bucket for update;
  if v_count >= p_limit then return false; end if;
  update public.password_reset_rate_limit set count = count + 1, updated_at = now()
  where dimension = p_dimension and subject_hash = p_subject_hash and window_start = v_bucket;
  return true;
end $$;

-- Finalize the already-reserved generic idempotency row and write exactly one
-- specialized success audit in the same transaction. The result contains no OTP.
create or replace function public.password_reset_finalize(
  p_actor uuid, p_key text, p_reset_request_id uuid, p_target_user_id uuid,
  p_practice_id uuid, p_identity_verification text, p_request_id text, p_expires_at timestamptz
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_result jsonb;
begin
  if not public.backoffice_actor_can(p_actor, 'user.password_reset.initiate', p_practice_id) then
    raise exception 'forbidden';
  end if;
  v_result := jsonb_build_object('ok', true, 'reset_request_id', p_reset_request_id, 'expires_at', p_expires_at);
  update public.backoffice_idempotency_keys set result = v_result
  where actor_user_id = p_actor and action = 'user.password_reset.initiate' and key = p_key and result = '{}'::jsonb;
  if not found then raise exception 'idempotency_not_reserved'; end if;
  insert into public.password_reset_audit_events
    (reset_request_id, actor_user_id, target_user_id, practice_id, identity_verification, result, request_id, expires_at)
  values
    (p_reset_request_id, p_actor, p_target_user_id, p_practice_id, p_identity_verification, 'success', left(p_request_id, 200), p_expires_at);
  return v_result;
end $$;

create or replace function public.password_reset_release_with_failure(
  p_actor uuid, p_key text, p_reset_request_id uuid, p_target_user_id uuid,
  p_practice_id uuid, p_identity_verification text, p_request_id text, p_error_code text
) returns void
language plpgsql security definer set search_path = public
as $$
begin
  delete from public.backoffice_idempotency_keys
  where actor_user_id = p_actor and action = 'user.password_reset.initiate' and key = p_key;
  insert into public.password_reset_audit_events
    (reset_request_id, actor_user_id, target_user_id, practice_id, identity_verification, result, error_code, request_id)
  values
    (p_reset_request_id, p_actor, p_target_user_id, p_practice_id, p_identity_verification,
     'failure', left(p_error_code, 80), left(p_request_id, 200));
end $$;

create or replace function public.anonymize_password_reset_audit_events(
  retention_days integer default 183, batch_size integer default 500
) returns integer
language plpgsql security definer set search_path = public
as $$
declare v_count integer;
begin
  if retention_days < 183 or retention_days > 3650 then raise exception 'invalid retention_days'; end if;
  if batch_size < 1 or batch_size > 5000 then raise exception 'invalid batch_size'; end if;
  with eligible as (
    select id from public.password_reset_audit_events
    where anonymized_at is null and retention_until <= now()
      and created_at < now() - make_interval(days => retention_days)
      and (legal_hold_until is null or legal_hold_until <= now())
    order by retention_until, id for update skip locked limit batch_size
  )
  update public.password_reset_audit_events e set
    actor_user_id = null, target_user_id = null, practice_id = null,
    identity_verification = null, error_code = null, request_id = null,
    expires_at = null, reset_request_id = gen_random_uuid(),
    created_at = date_trunc('day', e.created_at),
    retention_until = date_trunc('day', e.created_at) + interval '183 days',
    legal_hold_until = null, legal_hold_reason = null, legal_hold_set_at = null,
    legal_hold_set_by = null, anonymized_at = now()
  from eligible where e.id = eligible.id;
  get diagnostics v_count = row_count;
  -- Hashed IP/target limiter subjects are pseudonymous operational data, not
  -- audit evidence. Keep them only long enough to cover the longest 1h window.
  delete from public.password_reset_rate_limit where updated_at < now() - interval '24 hours';
  return v_count;
end $$;

revoke all on table public.password_reset_rate_limit from public, anon, authenticated;
revoke all on function public.password_reset_consume_rate_limit(text,text,integer,integer) from public, anon, authenticated;
revoke all on function public.password_reset_finalize(uuid,text,uuid,uuid,uuid,text,text,timestamptz) from public, anon, authenticated;
revoke all on function public.password_reset_release_with_failure(uuid,text,uuid,uuid,uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.anonymize_password_reset_audit_events(integer,integer) from public, anon, authenticated;
grant execute on function public.password_reset_consume_rate_limit(text,text,integer,integer) to service_role;
grant execute on function public.password_reset_finalize(uuid,text,uuid,uuid,uuid,text,text,timestamptz) to service_role;
grant execute on function public.password_reset_release_with_failure(uuid,text,uuid,uuid,uuid,text,text,text) to service_role;
grant execute on function public.anonymize_password_reset_audit_events(integer,integer) to service_role;
