-- B4a: atomarer Redeem/Accept einer Praxis-Einladung.
-- Der eingeladene Nutzer löst seinen Einmalcode ein; die Klartext-/Proof-Prüfung
-- geschieht ausschließlich im Worker (HMAC-Secret bleibt dort). Diese RPC ist die
-- atomare Autorität: sie bindet an die Auth-E-Mail des Einlösenden, erzeugt genau
-- eine aktive Mitgliedschaft, aktiviert die Praxis (Owner-Redeem setzt zusätzlich
-- owner_id) und schreibt genau ein Success- oder Failure-Audit. Nur service_role
-- darf sie aufrufen, damit die Proof-Prüfung im Worker nicht umgangen werden kann.

create or replace function public.redeem_practice_invitation(
  p_user uuid,
  p_request_id text,
  p_idempotency_key text,
  p_invitation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_action constant text := 'invitation.redeem';
  v_guard text;
  v_hash text;
  v_reserve jsonb;
  v_practice_id uuid;
  v_role public.practice_member_role;
  v_target_email text;
  v_expires timestamptz;
  v_status text;
  v_user_email text;
  v_membership_id uuid;
  v_result jsonb;
  v_fail_reason text := 'mutation_failed';
begin
  v_guard := public.backoffice_guard_ids(p_idempotency_key, p_request_id);
  if v_guard is not null then
    return public.backoffice_fail(p_user, v_action, 'practice_invitation', p_invitation_id, null, p_request_id, v_guard);
  end if;
  if p_user is null then
    return public.backoffice_fail(p_user, v_action, 'practice_invitation', p_invitation_id, null, p_request_id, 'forbidden');
  end if;

  -- Ziel sperren; Praxis, Rolle, Ziel-E-Mail, Ablauf und Status auflösen.
  select practice_id, intended_role, lower(target_email), expires_at, status
    into v_practice_id, v_role, v_target_email, v_expires, v_status
  from public.practice_invitations where id = p_invitation_id for update;
  if not found then
    return public.backoffice_fail(p_user, v_action, 'practice_invitation', p_invitation_id, null, p_request_id, 'not_found');
  end if;

  -- E-Mail des einlösenden Nutzers binden: eine Einladung gilt nur für genau die
  -- adressierte Person, unabhängig davon, welche invitation_id der Worker übergibt.
  select lower(email) into v_user_email from auth.users where id = p_user;
  if v_user_email is null or v_user_email is distinct from v_target_email then
    return public.backoffice_fail(p_user, v_action, 'practice_invitation', p_invitation_id, v_practice_id, p_request_id, 'forbidden');
  end if;

  v_hash := public.backoffice_hash(jsonb_build_object('invitation_id', p_invitation_id, 'user_id', p_user));
  v_reserve := public.backoffice_reserve(p_user, v_action, p_idempotency_key, v_hash);
  if v_reserve ? 'conflict' then
    return public.backoffice_fail(p_user, v_action, 'practice_invitation', p_invitation_id, v_practice_id, p_request_id, 'idempotency_conflict');
  elsif v_reserve ? 'in_progress' then
    return public.backoffice_fail(p_user, v_action, 'practice_invitation', p_invitation_id, v_practice_id, p_request_id, 'idempotency_in_progress');
  elsif v_reserve ? 'replay' then
    return v_reserve->'result';
  end if;

  -- Kein No-op-Redeem: nur eine offene, nicht abgelaufene Einladung wird eingelöst.
  if v_status <> 'pending' then
    perform public.backoffice_reserve_release(p_user, v_action, p_idempotency_key);
    return public.backoffice_fail(p_user, v_action, 'practice_invitation', p_invitation_id, v_practice_id, p_request_id, 'invalid_state');
  end if;
  if v_expires <= now() then
    perform public.backoffice_reserve_release(p_user, v_action, p_idempotency_key);
    return public.backoffice_fail(p_user, v_action, 'practice_invitation', p_invitation_id, v_practice_id, p_request_id, 'expired');
  end if;
  if exists (select 1 from public.practice_memberships where practice_id = v_practice_id and user_id = p_user and status = 'active') then
    perform public.backoffice_reserve_release(p_user, v_action, p_idempotency_key);
    return public.backoffice_fail(p_user, v_action, 'practice_invitation', p_invitation_id, v_practice_id, p_request_id, 'invalid_state');
  end if;

  begin
    if v_role = 'practice_owner' then
      -- Owner-Redeem ist der aktivierende Akt: die Praxis darf noch keinen Owner
      -- haben und muss im Onboarding stehen.
      update public.practices
        set owner_id = p_user, onboarding_status = 'active', updated_at = now()
        where id = v_practice_id and owner_id is null and onboarding_status in ('draft', 'invited');
      if not found then
        v_fail_reason := 'invalid_state'; raise exception 'abort';
      end if;
    else
      -- Nicht-Owner treten nur einer bereits vom Owner aktivierten Praxis bei.
      if not exists (select 1 from public.practices where id = v_practice_id and onboarding_status = 'active') then
        v_fail_reason := 'invalid_state'; raise exception 'abort';
      end if;
    end if;

    insert into public.practice_memberships (practice_id, user_id, role, status, granted_by, granted_at)
    values (v_practice_id, p_user, v_role, 'active', p_user, now())
    returning id into v_membership_id;

    update public.practice_invitations set status = 'accepted', accepted_at = now() where id = p_invitation_id;

    insert into public.backoffice_audit_events (actor_user_id, action, target_type, target_id, practice_id, result, request_id, metadata)
    values (p_user, v_action, 'practice_invitation', p_invitation_id, v_practice_id, 'success', left(p_request_id, 200),
            jsonb_build_object('role', v_role::text, 'membership_id', v_membership_id));
  exception when others then
    perform public.backoffice_reserve_release(p_user, v_action, p_idempotency_key);
    return public.backoffice_fail(p_user, v_action, 'practice_invitation', p_invitation_id, v_practice_id, p_request_id, v_fail_reason);
  end;

  v_result := jsonb_build_object('ok', true, 'practice_id', v_practice_id, 'membership_id', v_membership_id, 'role', v_role::text, 'status', 'active');
  perform public.backoffice_reserve_commit(p_user, v_action, p_idempotency_key, v_result);
  return v_result;
end $$;

-- Nur der Worker (service_role) ruft die RPC, nachdem er den Klartextcode gegen
-- proof_reference geprüft hat. Ein direkter authenticated-Aufruf würde die
-- Proof-Prüfung umgehen, deshalb ist execute für alle anderen Rollen entzogen.
revoke execute on function public.redeem_practice_invitation(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.redeem_practice_invitation(uuid, text, text, uuid) to service_role;
