-- B4c / E-039 Slice 2: Eine Plattform-Admin-Freigabe ueberfuehrt genau eine
-- gebundene Kontoanfrage idempotent in eine eingeladene Praxis. Der Worker
-- erzeugt danach den nicht persistierten Klartext-Einladungscode und legt die
-- HMAC-Referenz ueber backoffice_create_invitation an.

create or replace function public.backoffice_approve_practice_request(
  p_actor uuid,
  p_request_id text,
  p_idempotency_key text,
  p_activation_request_id uuid,
  p_proof_reference text,
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action constant text := 'practice.activation_request.approve';
  v_guard text;
  v_hash text;
  v_reserve jsonb;
  v_request public.practice_activation_requests%rowtype;
  v_practice_id uuid;
  v_invitation_id uuid;
  v_result jsonb;
begin
  v_guard := public.backoffice_guard_ids(p_idempotency_key, p_request_id);
  if v_guard is not null then
    return public.backoffice_fail(p_actor, v_action, 'practice_activation_request', p_activation_request_id, null, p_request_id, v_guard);
  end if;
  if not exists (
    select 1 from public.platform_staff
    where user_id = p_actor and role = 'platform_admin' and status = 'active'
  ) then
    return public.backoffice_fail(p_actor, v_action, 'practice_activation_request', p_activation_request_id, null, p_request_id, 'forbidden');
  end if;

  if p_proof_reference is null or p_proof_reference !~ '^hmac:v1:[0-9a-f]{64}$'
     or p_expires_at is null or p_expires_at <= now() or p_expires_at > now() + interval '7 days' then
    return public.backoffice_fail(p_actor, v_action, 'practice_activation_request', p_activation_request_id, null, p_request_id, 'invalid_invitation');
  end if;

  v_hash := public.backoffice_hash(jsonb_build_object(
    'activation_request_id', p_activation_request_id,
    'proof', p_proof_reference, 'expires', p_expires_at
  ));
  v_reserve := public.backoffice_reserve(p_actor, v_action, p_idempotency_key, v_hash);
  if v_reserve ? 'conflict' then
    return public.backoffice_fail(p_actor, v_action, 'practice_activation_request', p_activation_request_id, null, p_request_id, 'idempotency_conflict');
  elsif v_reserve ? 'in_progress' then
    return public.backoffice_fail(p_actor, v_action, 'practice_activation_request', p_activation_request_id, null, p_request_id, 'idempotency_in_progress');
  elsif v_reserve ? 'replay' then
    return v_reserve->'result';
  end if;

  select * into v_request
  from public.practice_activation_requests
  where id = p_activation_request_id
  for update;

  if not found then
    perform public.backoffice_reserve_release(p_actor, v_action, p_idempotency_key);
    return public.backoffice_fail(p_actor, v_action, 'practice_activation_request', p_activation_request_id, null, p_request_id, 'not_found');
  end if;
  if v_request.status <> 'pending' then
    perform public.backoffice_reserve_release(p_actor, v_action, p_idempotency_key);
    return public.backoffice_fail(p_actor, v_action, 'practice_activation_request', p_activation_request_id, v_request.practice_id, p_request_id, 'invalid_state');
  end if;

  -- Die Anfrage-ID ist zugleich die Praxis-ID. Damit kennt der Worker die
  -- Bindungs-ID bereits vor der Transaktion und kann die HMAC erzeugen, ohne
  -- dass Klartextcode oder HMAC-Secret jemals PostgreSQL erreichen.
  v_practice_id := p_activation_request_id;
  insert into public.practices (
    id, owner_id, name, domain, practice_kind, legal_name, display_name,
    contact_first_name, contact_last_name, contact_email, contact_phone,
    street, postal_code, city, country_code, onboarding_status,
    created_by_staff_id, updated_at
  ) values (
    v_practice_id, null, v_request.display_name, v_request.domain, v_request.practice_kind,
    v_request.legal_name, v_request.display_name, v_request.contact_first_name,
    v_request.contact_last_name, lower(v_request.contact_email),
    v_request.contact_phone, v_request.street, v_request.postal_code,
    v_request.city, v_request.country_code, 'invited', p_actor, now()
  );

  insert into public.practice_invitations (
    practice_id, target_email, intended_role, delivery_channel, status,
    proof_reference, expires_at, invited_by
  ) values (
    v_practice_id, lower(v_request.contact_email), 'practice_owner',
    'in_person_code', 'pending', p_proof_reference, p_expires_at, p_actor
  ) returning id into v_invitation_id;

  update public.practice_activation_requests
  set status = 'approved', practice_id = v_practice_id, reviewed_by = p_actor,
      reviewed_at = now(), updated_at = now()
  where id = p_activation_request_id;

  insert into public.backoffice_audit_events (
    actor_user_id, action, target_type, target_id, practice_id, result,
    request_id, metadata
  ) values (
    p_actor, v_action, 'practice_activation_request', p_activation_request_id,
    v_practice_id, 'success', left(p_request_id, 200),
    jsonb_build_object('requester_user_id', v_request.requester_user_id,
                       'bound_email', lower(v_request.contact_email))
  );

  v_result := jsonb_build_object(
    'ok', true, 'request_id', p_activation_request_id,
    'practice_id', v_practice_id, 'invitation_id', v_invitation_id,
    'contact_email', lower(v_request.contact_email),
    'expires_at', p_expires_at, 'onboarding_status', 'invited'
  );
  perform public.backoffice_reserve_commit(p_actor, v_action, p_idempotency_key, v_result);
  return v_result;
exception when others then
  perform public.backoffice_reserve_release(p_actor, v_action, p_idempotency_key);
  return public.backoffice_fail(p_actor, v_action, 'practice_activation_request', p_activation_request_id, null, p_request_id, 'mutation_failed');
end $$;

revoke all on function public.backoffice_approve_practice_request(uuid, text, text, uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.backoffice_approve_practice_request(uuid, text, text, uuid, text, timestamptz) to service_role;
