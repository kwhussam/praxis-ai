-- B3.5: sichere Consultant-Auswahl und atomare Praxiszuweisung.
-- Nur platform_admin darf Staff-Verzeichnis und Zuweisungen verwalten.

create or replace function public.backoffice_list_consultants(p_actor uuid)
returns table(user_id uuid, email text, status text)
language sql
stable
security definer
set search_path = public, auth
as $$
  select s.user_id, lower(u.email), s.status
  from public.platform_staff s
  join auth.users u on u.id = s.user_id
  where public.backoffice_actor_can(p_actor, 'assignment.manage', null)
    and s.role = 'security_consultant'
  order by lower(u.email), s.user_id;
$$;

create or replace function public.backoffice_list_consultant_assignments(p_actor uuid, p_practice_id uuid)
returns table(id uuid, staff_user_id uuid, email text, assignment_purpose text, status text, assigned_at timestamptz, revoked_at timestamptz)
language sql
stable
security definer
set search_path = public, auth
as $$
  select a.id, a.staff_user_id, lower(u.email), a.assignment_purpose, a.status, a.assigned_at, a.revoked_at
  from public.staff_practice_assignments a
  join public.platform_staff s on s.user_id = a.staff_user_id and s.role = 'security_consultant'
  join auth.users u on u.id = a.staff_user_id
  where public.backoffice_actor_can(p_actor, 'assignment.manage', null)
    and a.practice_id = p_practice_id
  order by a.assigned_at desc
  limit 200;
$$;

create or replace function public.backoffice_assign_consultant(
  p_actor uuid, p_request_id text, p_idempotency_key text,
  p_practice_id uuid, p_consultant_user_id uuid, p_purpose text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action constant text := 'assignment.grant';
  v_guard text;
  v_hash text;
  v_reserve jsonb;
  v_assignment_id uuid;
  v_result jsonb;
  v_fail_reason text := 'mutation_failed';
begin
  v_guard := public.backoffice_guard_ids(p_idempotency_key, p_request_id);
  if v_guard is not null then
    return public.backoffice_fail(p_actor, v_action, 'staff_practice_assignment', null, p_practice_id, p_request_id, v_guard);
  end if;
  if not public.backoffice_actor_can(p_actor, 'assignment.manage', null) then
    return public.backoffice_fail(p_actor, v_action, 'staff_practice_assignment', null, p_practice_id, p_request_id, 'forbidden');
  end if;
  if coalesce(length(p_purpose), 0) > 500 then
    return public.backoffice_fail(p_actor, v_action, 'staff_practice_assignment', null, p_practice_id, p_request_id, 'invalid_assignment');
  end if;

  v_hash := public.backoffice_hash(jsonb_build_object('practice_id', p_practice_id, 'consultant_user_id', p_consultant_user_id, 'purpose', nullif(btrim(p_purpose), '')));
  v_reserve := public.backoffice_reserve(p_actor, v_action, p_idempotency_key, v_hash);
  if v_reserve ? 'conflict' then
    return public.backoffice_fail(p_actor, v_action, 'staff_practice_assignment', null, p_practice_id, p_request_id, 'idempotency_conflict');
  elsif v_reserve ? 'in_progress' then
    return public.backoffice_fail(p_actor, v_action, 'staff_practice_assignment', null, p_practice_id, p_request_id, 'idempotency_in_progress');
  elsif v_reserve ? 'replay' then
    return v_reserve->'result';
  end if;

  begin
    if not exists (select 1 from public.practices where id = p_practice_id) then
      v_fail_reason := 'not_found'; raise exception 'abort';
    end if;
    if not exists (select 1 from public.platform_staff where user_id = p_consultant_user_id and role = 'security_consultant' and status = 'active') then
      v_fail_reason := 'invalid_consultant'; raise exception 'abort';
    end if;
    if exists (select 1 from public.staff_practice_assignments where staff_user_id = p_consultant_user_id and practice_id = p_practice_id and status = 'active') then
      v_fail_reason := 'invalid_state'; raise exception 'abort';
    end if;

    insert into public.staff_practice_assignments (staff_user_id, practice_id, assignment_purpose, status, assigned_by, assigned_at)
    values (p_consultant_user_id, p_practice_id, nullif(btrim(p_purpose), ''), 'active', p_actor, now())
    returning id into v_assignment_id;
    insert into public.backoffice_audit_events (actor_user_id, action, target_type, target_id, practice_id, result, request_id, metadata)
    values (p_actor, v_action, 'staff_practice_assignment', v_assignment_id, p_practice_id, 'success', left(p_request_id, 200), jsonb_build_object('consultant_user_id', p_consultant_user_id));
  exception when others then
    perform public.backoffice_reserve_release(p_actor, v_action, p_idempotency_key);
    return public.backoffice_fail(p_actor, v_action, 'staff_practice_assignment', null, p_practice_id, p_request_id, v_fail_reason);
  end;
  v_result := jsonb_build_object('ok', true, 'assignment_id', v_assignment_id, 'status', 'active');
  perform public.backoffice_reserve_commit(p_actor, v_action, p_idempotency_key, v_result);
  return v_result;
end $$;

create or replace function public.backoffice_revoke_consultant_assignment(
  p_actor uuid, p_request_id text, p_idempotency_key text, p_assignment_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action constant text := 'assignment.revoke';
  v_guard text;
  v_hash text;
  v_reserve jsonb;
  v_practice_id uuid;
  v_result jsonb;
  v_fail_reason text := 'mutation_failed';
begin
  v_guard := public.backoffice_guard_ids(p_idempotency_key, p_request_id);
  if v_guard is not null then return public.backoffice_fail(p_actor, v_action, 'staff_practice_assignment', p_assignment_id, null, p_request_id, v_guard); end if;
  if not public.backoffice_actor_can(p_actor, 'assignment.manage', null) then
    return public.backoffice_fail(p_actor, v_action, 'staff_practice_assignment', p_assignment_id, null, p_request_id, 'forbidden');
  end if;
  v_hash := public.backoffice_hash(jsonb_build_object('assignment_id', p_assignment_id));
  v_reserve := public.backoffice_reserve(p_actor, v_action, p_idempotency_key, v_hash);
  if v_reserve ? 'conflict' then return public.backoffice_fail(p_actor, v_action, 'staff_practice_assignment', p_assignment_id, null, p_request_id, 'idempotency_conflict');
  elsif v_reserve ? 'in_progress' then return public.backoffice_fail(p_actor, v_action, 'staff_practice_assignment', p_assignment_id, null, p_request_id, 'idempotency_in_progress');
  elsif v_reserve ? 'replay' then return v_reserve->'result'; end if;

  begin
    select practice_id into v_practice_id from public.staff_practice_assignments where id = p_assignment_id and status = 'active' for update;
    if not found then v_fail_reason := 'not_found'; raise exception 'abort'; end if;
    update public.staff_practice_assignments set status = 'revoked', revoked_at = now() where id = p_assignment_id;
    insert into public.backoffice_audit_events (actor_user_id, action, target_type, target_id, practice_id, result, request_id)
    values (p_actor, v_action, 'staff_practice_assignment', p_assignment_id, v_practice_id, 'success', left(p_request_id, 200));
  exception when others then
    perform public.backoffice_reserve_release(p_actor, v_action, p_idempotency_key);
    return public.backoffice_fail(p_actor, v_action, 'staff_practice_assignment', p_assignment_id, v_practice_id, p_request_id, v_fail_reason);
  end;
  v_result := jsonb_build_object('ok', true, 'assignment_id', p_assignment_id, 'status', 'revoked');
  perform public.backoffice_reserve_commit(p_actor, v_action, p_idempotency_key, v_result);
  return v_result;
end $$;

-- assignment.manage bleibt exklusiv beim platform_admin, weil dessen bestehender
-- Capability-Bypass true liefert; andere Rollen erhalten fuer unbekannte
-- Capabilities false.
revoke execute on function public.backoffice_list_consultants(uuid) from public, anon, authenticated;
revoke execute on function public.backoffice_list_consultant_assignments(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.backoffice_assign_consultant(uuid, text, text, uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.backoffice_revoke_consultant_assignment(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.backoffice_list_consultants(uuid) to service_role;
grant execute on function public.backoffice_list_consultant_assignments(uuid, uuid) to service_role;
grant execute on function public.backoffice_assign_consultant(uuid, text, text, uuid, uuid, text) to service_role;
grant execute on function public.backoffice_revoke_consultant_assignment(uuid, text, text, uuid) to service_role;
