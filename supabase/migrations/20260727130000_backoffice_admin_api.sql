-- B2 (Slice 1): DB-Sicherheitskern der Admin-API.
-- Fachplan docs/WEB_BACKOFFICE_FOUNDATION.md, Freigabe E-027.
--
-- Verbindlicher gehaerteter Vertrag (inkl. Codex-Gegenpruefung 2026-07-27):
--  * Jede mutierende RPC prueft ZUERST die Capability, dann Idempotenz; Mutation
--    und GENAU EIN Audit-Ereignis (success ODER failure) liegen in derselben
--    Transaktion. Abgelehnte/fehlgeschlagene Mutationen liefern einen
--    strukturierten Fehlervertrag {ok:false,error} UND ein failure-Audit; nur
--    ein reiner Idempotenz-Replay auditiert nicht erneut.
--  * Idempotenz ist an (actor, action, key) gebunden und traegt einen
--    Request-Fingerprint; gleicher Schluessel mit abweichendem Payload -> Konflikt.
--    Schluessel sind Pflicht und nicht leer.
--  * Capabilities explizit; consultant nur im aktiven Assignment-Scope; support
--    nur Lesen; ownership.transfer nur admin.
--  * Membership-RPCs fassen NIEMALS eine aktive practice_owner-Rolle an; Owner
--    entsteht/wechselt nur ueber transfer_ownership (Admin + Step-up) bzw. B4-Redeem.
--  * Einmalcodes erreichen die DB nur als striktes HMAC-Format
--    'hmac:v<N>:<64 hex>'; Klartext/Secret bleiben im Worker.
--  * Nur service_role darf die RPCs ausfuehren.

-- 1. Idempotenz-Speicher (gescopt + Fingerprint) ---------------------------
create table if not exists public.backoffice_idempotency_keys (
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  key text not null,
  request_hash text not null,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (actor_user_id, action, key)
);

alter table public.backoffice_idempotency_keys enable row level security;
alter table public.backoffice_idempotency_keys force row level security;
-- Keine Policy: deny-by-default. Zugriff nur ueber die security-definer-RPCs.

-- 2. Capability-Modell -----------------------------------------------------
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
  if p_actor is null or p_capability is null then
    return false;
  end if;

  select role::text into v_role
  from public.platform_staff
  where user_id = p_actor and status = 'active'
  limit 1;

  if v_role is null then
    return false;
  end if;

  if v_role = 'platform_admin' then
    return true;
  end if;

  v_scoped := p_practice_id is null or exists (
    select 1 from public.staff_practice_assignments a
    where a.staff_user_id = p_actor
      and a.practice_id = p_practice_id
      and a.status = 'active'
  );

  if v_role = 'security_consultant' then
    return case p_capability
      when 'practice.create' then true
      when 'practice.read' then v_scoped
      when 'practice.manage' then v_scoped
      when 'invitation.manage' then v_scoped
      when 'membership.manage' then v_scoped
      when 'audit.read' then v_scoped
      else false  -- insbesondere kein ownership.transfer
    end;
  end if;

  if v_role = 'support' then
    return p_capability = 'practice.read' and v_scoped;
  end if;

  return false;
end $$;

-- 3. Statusmaschine der Praxis --------------------------------------------
create or replace function public.backoffice_valid_practice_transition(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('draft', 'invited'),
    ('draft', 'archived'),
    ('invited', 'active'),
    ('invited', 'archived'),
    ('active', 'suspended'),
    ('active', 'archived'),
    ('suspended', 'active'),
    ('suspended', 'archived')
  );
$$;

-- 4. Gemeinsame Helfer -----------------------------------------------------

-- Genau ein failure-Audit + strukturierter Fehlervertrag. Keine sensitiven
-- Eingaben/Details ins Audit.
create or replace function public.backoffice_fail(
  p_actor uuid, p_action text, p_target_type text, p_target_id uuid,
  p_practice_id uuid, p_request_id text, p_error text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.backoffice_audit_events (actor_user_id, action, target_type, target_id, practice_id, result, request_id, metadata)
  values (p_actor, p_action, p_target_type, p_target_id, p_practice_id, 'failure', p_request_id, jsonb_build_object('error', p_error));
  return jsonb_build_object('ok', false, 'error', p_error);
end $$;

-- Idempotenz-Lookup: null (neu) | {replay,result} | {conflict}
create or replace function public.backoffice_idempotency_lookup(
  p_actor uuid, p_action text, p_key text, p_hash text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_hash text;
  v_result jsonb;
begin
  select request_hash, result into v_hash, v_result
  from public.backoffice_idempotency_keys
  where actor_user_id = p_actor and action = p_action and key = p_key;

  if not found then
    return null;
  end if;
  if v_hash = p_hash then
    return jsonb_build_object('replay', true, 'result', v_result);
  end if;
  return jsonb_build_object('conflict', true);
end $$;

-- 5. Mutations-RPCs --------------------------------------------------------

create or replace function public.backoffice_create_practice(
  p_actor uuid,
  p_request_id text,
  p_idempotency_key text,
  p_practice_kind text,
  p_legal_name text,
  p_display_name text,
  p_contact_first_name text,
  p_contact_last_name text,
  p_contact_email text,
  p_contact_phone text,
  p_street text,
  p_postal_code text,
  p_city text,
  p_country_code text,
  p_domain text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action constant text := 'practice.create';
  v_email text := lower(btrim(coalesce(p_contact_email, '')));
  v_country text := upper(btrim(coalesce(p_country_code, '')));
  v_hash text;
  v_lookup jsonb;
  v_practice_id uuid;
  v_result jsonb;
  v_role text;
begin
  if coalesce(btrim(p_idempotency_key), '') = '' then
    return public.backoffice_fail(p_actor, v_action, 'practice', null, null, p_request_id, 'idempotency_key_required');
  end if;
  if not public.backoffice_actor_can(p_actor, 'practice.create', null) then
    return public.backoffice_fail(p_actor, v_action, 'practice', null, null, p_request_id, 'forbidden');
  end if;

  v_hash := md5(concat_ws('|', p_practice_kind, p_legal_name, p_display_name, p_contact_first_name,
    p_contact_last_name, v_email, p_contact_phone, p_street, p_postal_code, p_city, v_country, p_domain));
  v_lookup := public.backoffice_idempotency_lookup(p_actor, v_action, p_idempotency_key, v_hash);
  if v_lookup ? 'conflict' then
    return public.backoffice_fail(p_actor, v_action, 'practice', null, null, p_request_id, 'idempotency_conflict');
  elsif v_lookup ? 'replay' then
    return v_lookup->'result';
  end if;

  -- Vollstaendige Pflicht-Stammdaten (B0/B1), Domain optional.
  if p_practice_kind not in ('general', 'health')
     or coalesce(btrim(p_legal_name), '') = ''
     or coalesce(btrim(p_display_name), '') = ''
     or coalesce(btrim(p_contact_first_name), '') = ''
     or coalesce(btrim(p_contact_last_name), '') = ''
     or v_email = '' or position('@' in v_email) = 0
     or coalesce(btrim(p_contact_phone), '') = ''
     or coalesce(btrim(p_street), '') = ''
     or coalesce(btrim(p_postal_code), '') = ''
     or coalesce(btrim(p_city), '') = ''
     or v_country !~ '^[A-Z]{2}$' then
    return public.backoffice_fail(p_actor, v_action, 'practice', null, null, p_request_id, 'invalid_master_data');
  end if;

  begin
    insert into public.practices (
      owner_id, name, domain, practice_kind, legal_name, display_name,
      contact_first_name, contact_last_name, contact_email, contact_phone,
      street, postal_code, city, country_code, onboarding_status,
      created_by_staff_id, updated_at
    )
    values (
      null, btrim(p_display_name), p_domain, p_practice_kind, btrim(p_legal_name), btrim(p_display_name),
      btrim(p_contact_first_name), btrim(p_contact_last_name), v_email, btrim(p_contact_phone),
      btrim(p_street), btrim(p_postal_code), btrim(p_city), v_country, 'draft',
      p_actor, now()
    )
    returning id into v_practice_id;

    -- Bestaetigte Regel: der erstellende Consultant erhaelt automatisch ein
    -- aktives Assignment auf genau diese neue Praxis (Admin nicht).
    select role::text into v_role from public.platform_staff where user_id = p_actor and status = 'active' limit 1;
    if v_role = 'security_consultant' then
      insert into public.staff_practice_assignments (staff_user_id, practice_id, status, assigned_by)
      values (p_actor, v_practice_id, 'active', p_actor)
      on conflict (staff_user_id, practice_id) where status = 'active' do nothing;
    end if;

    insert into public.backoffice_audit_events (actor_user_id, action, target_type, target_id, practice_id, result, request_id, metadata)
    values (p_actor, v_action, 'practice', v_practice_id, v_practice_id, 'success', p_request_id,
            jsonb_build_object('onboarding_status', 'draft', 'auto_assigned', v_role = 'security_consultant'));
  exception when others then
    return public.backoffice_fail(p_actor, v_action, 'practice', null, null, p_request_id, 'mutation_failed');
  end;

  v_result := jsonb_build_object('ok', true, 'practice_id', v_practice_id, 'onboarding_status', 'draft');
  insert into public.backoffice_idempotency_keys (actor_user_id, action, key, request_hash, result)
  values (p_actor, v_action, p_idempotency_key, v_hash, v_result);
  return v_result;
end $$;

create or replace function public.backoffice_update_practice(
  p_actor uuid,
  p_request_id text,
  p_idempotency_key text,
  p_practice_id uuid,
  p_patch jsonb default '{}'::jsonb,
  p_new_status text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action constant text := 'practice.update';
  v_hash text;
  v_lookup jsonb;
  v_current_status text;
  v_field text;
  v_result jsonb;
begin
  if coalesce(btrim(p_idempotency_key), '') = '' then
    return public.backoffice_fail(p_actor, v_action, 'practice', p_practice_id, p_practice_id, p_request_id, 'idempotency_key_required');
  end if;
  if not public.backoffice_actor_can(p_actor, 'practice.manage', p_practice_id) then
    return public.backoffice_fail(p_actor, v_action, 'practice', p_practice_id, p_practice_id, p_request_id, 'forbidden');
  end if;

  v_hash := md5(concat_ws('|', coalesce(p_patch::text, ''), coalesce(p_new_status, '')));
  v_lookup := public.backoffice_idempotency_lookup(p_actor, v_action, p_idempotency_key, v_hash);
  if v_lookup ? 'conflict' then
    return public.backoffice_fail(p_actor, v_action, 'practice', p_practice_id, p_practice_id, p_request_id, 'idempotency_conflict');
  elsif v_lookup ? 'replay' then
    return v_lookup->'result';
  end if;

  -- Pflichtfelder duerfen im Patch nicht auf Leerstring gesetzt werden.
  foreach v_field in array array['legal_name','display_name','contact_first_name','contact_last_name','contact_email','contact_phone','street','postal_code','city','country_code'] loop
    if p_patch ? v_field and coalesce(btrim(p_patch->>v_field), '') = '' then
      return public.backoffice_fail(p_actor, v_action, 'practice', p_practice_id, p_practice_id, p_request_id, 'invalid_master_data');
    end if;
  end loop;
  if p_patch ? 'country_code' and upper(btrim(p_patch->>'country_code')) !~ '^[A-Z]{2}$' then
    return public.backoffice_fail(p_actor, v_action, 'practice', p_practice_id, p_practice_id, p_request_id, 'invalid_master_data');
  end if;

  select onboarding_status into v_current_status from public.practices where id = p_practice_id for update;
  if not found then
    return public.backoffice_fail(p_actor, v_action, 'practice', p_practice_id, p_practice_id, p_request_id, 'not_found');
  end if;
  if p_new_status is not null and p_new_status <> v_current_status
     and not public.backoffice_valid_practice_transition(v_current_status, p_new_status) then
    return public.backoffice_fail(p_actor, v_action, 'practice', p_practice_id, p_practice_id, p_request_id, 'invalid_status_transition');
  end if;

  begin
    update public.practices set
      legal_name = coalesce(nullif(btrim(p_patch->>'legal_name'), ''), legal_name),
      display_name = coalesce(nullif(btrim(p_patch->>'display_name'), ''), display_name),
      name = coalesce(nullif(btrim(p_patch->>'display_name'), ''), name),
      contact_first_name = coalesce(nullif(btrim(p_patch->>'contact_first_name'), ''), contact_first_name),
      contact_last_name = coalesce(nullif(btrim(p_patch->>'contact_last_name'), ''), contact_last_name),
      contact_email = coalesce(lower(nullif(btrim(p_patch->>'contact_email'), '')), contact_email),
      contact_phone = coalesce(nullif(btrim(p_patch->>'contact_phone'), ''), contact_phone),
      street = coalesce(nullif(btrim(p_patch->>'street'), ''), street),
      postal_code = coalesce(nullif(btrim(p_patch->>'postal_code'), ''), postal_code),
      city = coalesce(nullif(btrim(p_patch->>'city'), ''), city),
      country_code = coalesce(upper(nullif(btrim(p_patch->>'country_code'), '')), country_code),
      domain = coalesce(p_patch->>'domain', domain),
      onboarding_status = coalesce(p_new_status, onboarding_status),
      updated_at = now()
    where id = p_practice_id;

    insert into public.backoffice_audit_events (actor_user_id, action, target_type, target_id, practice_id, result, request_id, metadata)
    values (p_actor, v_action, 'practice', p_practice_id, p_practice_id, 'success', p_request_id,
            jsonb_build_object('status_from', v_current_status, 'status_to', coalesce(p_new_status, v_current_status)));
  exception when others then
    return public.backoffice_fail(p_actor, v_action, 'practice', p_practice_id, p_practice_id, p_request_id, 'mutation_failed');
  end;

  v_result := jsonb_build_object('ok', true, 'practice_id', p_practice_id, 'onboarding_status', coalesce(p_new_status, v_current_status));
  insert into public.backoffice_idempotency_keys (actor_user_id, action, key, request_hash, result)
  values (p_actor, v_action, p_idempotency_key, v_hash, v_result);
  return v_result;
end $$;

create or replace function public.backoffice_create_invitation(
  p_actor uuid,
  p_request_id text,
  p_idempotency_key text,
  p_practice_id uuid,
  p_target_email text,
  p_intended_role public.practice_member_role,
  p_delivery_channel text,
  p_proof_reference text,
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action constant text := 'invitation.create';
  v_email text := lower(btrim(coalesce(p_target_email, '')));
  v_hash text;
  v_lookup jsonb;
  v_invitation_id uuid;
  v_revoked integer;
  v_result jsonb;
begin
  if coalesce(btrim(p_idempotency_key), '') = '' then
    return public.backoffice_fail(p_actor, v_action, 'practice_invitation', null, p_practice_id, p_request_id, 'idempotency_key_required');
  end if;
  if not public.backoffice_actor_can(p_actor, 'invitation.manage', p_practice_id) then
    return public.backoffice_fail(p_actor, v_action, 'practice_invitation', null, p_practice_id, p_request_id, 'forbidden');
  end if;

  v_hash := md5(concat_ws('|', v_email, p_intended_role::text, p_delivery_channel, p_proof_reference, p_expires_at::text));
  v_lookup := public.backoffice_idempotency_lookup(p_actor, v_action, p_idempotency_key, v_hash);
  if v_lookup ? 'conflict' then
    return public.backoffice_fail(p_actor, v_action, 'practice_invitation', null, p_practice_id, p_request_id, 'idempotency_conflict');
  elsif v_lookup ? 'replay' then
    return v_lookup->'result';
  end if;

  if v_email = '' or position('@' in v_email) = 0
     or p_delivery_channel not in ('in_person_code', 'email_link')
     or p_proof_reference is null or p_proof_reference !~ '^hmac:v[0-9]+:[0-9a-f]{64}$' then
    return public.backoffice_fail(p_actor, v_action, 'practice_invitation', null, p_practice_id, p_request_id, 'invalid_invitation');
  end if;
  if p_expires_at is null or p_expires_at <= now() or p_expires_at > now() + interval '7 days' then
    return public.backoffice_fail(p_actor, v_action, 'practice_invitation', null, p_practice_id, p_request_id, 'invalid_expiry');
  end if;

  begin
    update public.practice_invitations
    set status = 'revoked'
    where practice_id = p_practice_id and lower(target_email) = v_email
      and intended_role = p_intended_role and status = 'pending';
    get diagnostics v_revoked = row_count;

    insert into public.practice_invitations (
      practice_id, target_email, intended_role, delivery_channel, status, proof_reference, expires_at, invited_by
    )
    values (p_practice_id, v_email, p_intended_role, p_delivery_channel, 'pending', p_proof_reference, p_expires_at, p_actor)
    returning id into v_invitation_id;

    insert into public.backoffice_audit_events (actor_user_id, action, target_type, target_id, practice_id, result, request_id, metadata)
    values (p_actor, v_action, 'practice_invitation', v_invitation_id, p_practice_id, 'success', p_request_id,
            jsonb_build_object('delivery_channel', p_delivery_channel, 'revoked_previous', v_revoked));
    -- Kein Klartextcode und keine proof_reference im Audit.
  exception when others then
    return public.backoffice_fail(p_actor, v_action, 'practice_invitation', null, p_practice_id, p_request_id, 'mutation_failed');
  end;

  v_result := jsonb_build_object('ok', true, 'invitation_id', v_invitation_id, 'expires_at', p_expires_at, 'revoked_previous', v_revoked);
  insert into public.backoffice_idempotency_keys (actor_user_id, action, key, request_hash, result)
  values (p_actor, v_action, p_idempotency_key, v_hash, v_result);
  return v_result;
end $$;

create or replace function public.backoffice_revoke_invitation(
  p_actor uuid,
  p_request_id text,
  p_idempotency_key text,
  p_invitation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action constant text := 'invitation.revoke';
  v_hash text;
  v_lookup jsonb;
  v_practice_id uuid;
  v_result jsonb;
begin
  if coalesce(btrim(p_idempotency_key), '') = '' then
    return public.backoffice_fail(p_actor, v_action, 'practice_invitation', p_invitation_id, null, p_request_id, 'idempotency_key_required');
  end if;

  select practice_id into v_practice_id from public.practice_invitations where id = p_invitation_id for update;
  if not found then
    return public.backoffice_fail(p_actor, v_action, 'practice_invitation', p_invitation_id, null, p_request_id, 'not_found');
  end if;
  if not public.backoffice_actor_can(p_actor, 'invitation.manage', v_practice_id) then
    return public.backoffice_fail(p_actor, v_action, 'practice_invitation', p_invitation_id, v_practice_id, p_request_id, 'forbidden');
  end if;

  v_hash := md5(p_invitation_id::text);
  v_lookup := public.backoffice_idempotency_lookup(p_actor, v_action, p_idempotency_key, v_hash);
  if v_lookup ? 'conflict' then
    return public.backoffice_fail(p_actor, v_action, 'practice_invitation', p_invitation_id, v_practice_id, p_request_id, 'idempotency_conflict');
  elsif v_lookup ? 'replay' then
    return v_lookup->'result';
  end if;

  begin
    update public.practice_invitations set status = 'revoked' where id = p_invitation_id and status = 'pending';
    insert into public.backoffice_audit_events (actor_user_id, action, target_type, target_id, practice_id, result, request_id, metadata)
    values (p_actor, v_action, 'practice_invitation', p_invitation_id, v_practice_id, 'success', p_request_id, '{}'::jsonb);
  exception when others then
    return public.backoffice_fail(p_actor, v_action, 'practice_invitation', p_invitation_id, v_practice_id, p_request_id, 'mutation_failed');
  end;

  v_result := jsonb_build_object('ok', true, 'invitation_id', p_invitation_id, 'status', 'revoked');
  insert into public.backoffice_idempotency_keys (actor_user_id, action, key, request_hash, result)
  values (p_actor, v_action, p_idempotency_key, v_hash, v_result);
  return v_result;
end $$;

create or replace function public.backoffice_grant_membership(
  p_actor uuid,
  p_request_id text,
  p_idempotency_key text,
  p_practice_id uuid,
  p_user_id uuid,
  p_role public.practice_member_role
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action constant text := 'membership.grant';
  v_hash text;
  v_lookup jsonb;
  v_existing_role public.practice_member_role;
  v_membership_id uuid;
  v_result jsonb;
begin
  if coalesce(btrim(p_idempotency_key), '') = '' then
    return public.backoffice_fail(p_actor, v_action, 'practice_membership', null, p_practice_id, p_request_id, 'idempotency_key_required');
  end if;
  if not public.backoffice_actor_can(p_actor, 'membership.manage', p_practice_id) then
    return public.backoffice_fail(p_actor, v_action, 'practice_membership', null, p_practice_id, p_request_id, 'forbidden');
  end if;

  -- Owner-Schutz: Membership-RPC vergibt/veraendert niemals eine aktive
  -- practice_owner-Rolle (nur transfer_ownership bzw. B4-Redeem).
  if p_role = 'practice_owner' then
    return public.backoffice_fail(p_actor, v_action, 'practice_membership', null, p_practice_id, p_request_id, 'owner_role_forbidden');
  end if;
  select role into v_existing_role from public.practice_memberships
  where practice_id = p_practice_id and user_id = p_user_id and status = 'active';
  if v_existing_role = 'practice_owner' then
    return public.backoffice_fail(p_actor, v_action, 'practice_membership', null, p_practice_id, p_request_id, 'owner_role_forbidden');
  end if;

  v_hash := md5(concat_ws('|', p_user_id::text, p_role::text));
  v_lookup := public.backoffice_idempotency_lookup(p_actor, v_action, p_idempotency_key, v_hash);
  if v_lookup ? 'conflict' then
    return public.backoffice_fail(p_actor, v_action, 'practice_membership', null, p_practice_id, p_request_id, 'idempotency_conflict');
  elsif v_lookup ? 'replay' then
    return v_lookup->'result';
  end if;

  begin
    insert into public.practice_memberships (practice_id, user_id, role, status, granted_by, granted_at)
    values (p_practice_id, p_user_id, p_role, 'active', p_actor, now())
    on conflict (practice_id, user_id) where status = 'active'
    do update set role = p_role
    returning id into v_membership_id;

    insert into public.backoffice_audit_events (actor_user_id, action, target_type, target_id, practice_id, result, request_id, metadata)
    values (p_actor, v_action, 'practice_membership', v_membership_id, p_practice_id, 'success', p_request_id,
            jsonb_build_object('member_user_id', p_user_id, 'role', p_role));
  exception when others then
    return public.backoffice_fail(p_actor, v_action, 'practice_membership', null, p_practice_id, p_request_id, 'mutation_failed');
  end;

  v_result := jsonb_build_object('ok', true, 'membership_id', v_membership_id, 'role', p_role);
  insert into public.backoffice_idempotency_keys (actor_user_id, action, key, request_hash, result)
  values (p_actor, v_action, p_idempotency_key, v_hash, v_result);
  return v_result;
end $$;

create or replace function public.backoffice_revoke_membership(
  p_actor uuid,
  p_request_id text,
  p_idempotency_key text,
  p_practice_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action constant text := 'membership.revoke';
  v_hash text;
  v_lookup jsonb;
  v_existing_role public.practice_member_role;
  v_result jsonb;
begin
  if coalesce(btrim(p_idempotency_key), '') = '' then
    return public.backoffice_fail(p_actor, v_action, 'practice_membership', null, p_practice_id, p_request_id, 'idempotency_key_required');
  end if;
  if not public.backoffice_actor_can(p_actor, 'membership.manage', p_practice_id) then
    return public.backoffice_fail(p_actor, v_action, 'practice_membership', null, p_practice_id, p_request_id, 'forbidden');
  end if;

  select role into v_existing_role from public.practice_memberships
  where practice_id = p_practice_id and user_id = p_user_id and status = 'active';
  -- Owner-Schutz: eine aktive practice_owner-Rolle wird hier nie widerrufen.
  if v_existing_role = 'practice_owner' then
    return public.backoffice_fail(p_actor, v_action, 'practice_membership', null, p_practice_id, p_request_id, 'owner_role_forbidden');
  end if;

  v_hash := md5(p_user_id::text);
  v_lookup := public.backoffice_idempotency_lookup(p_actor, v_action, p_idempotency_key, v_hash);
  if v_lookup ? 'conflict' then
    return public.backoffice_fail(p_actor, v_action, 'practice_membership', null, p_practice_id, p_request_id, 'idempotency_conflict');
  elsif v_lookup ? 'replay' then
    return v_lookup->'result';
  end if;

  begin
    update public.practice_memberships
    set status = 'revoked', revoked_at = now()
    where practice_id = p_practice_id and user_id = p_user_id and status = 'active';

    insert into public.backoffice_audit_events (actor_user_id, action, target_type, target_id, practice_id, result, request_id, metadata)
    values (p_actor, v_action, 'practice_membership', null, p_practice_id, 'success', p_request_id,
            jsonb_build_object('member_user_id', p_user_id));
  exception when others then
    return public.backoffice_fail(p_actor, v_action, 'practice_membership', null, p_practice_id, p_request_id, 'mutation_failed');
  end;

  v_result := jsonb_build_object('ok', true, 'practice_id', p_practice_id, 'member_user_id', p_user_id, 'status', 'revoked');
  insert into public.backoffice_idempotency_keys (actor_user_id, action, key, request_hash, result)
  values (p_actor, v_action, p_idempotency_key, v_hash, v_result);
  return v_result;
end $$;

create or replace function public.backoffice_transfer_ownership(
  p_actor uuid,
  p_request_id text,
  p_idempotency_key text,
  p_practice_id uuid,
  p_new_owner uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action constant text := 'ownership.transfer';
  v_hash text;
  v_lookup jsonb;
  v_result jsonb;
begin
  if coalesce(btrim(p_idempotency_key), '') = '' then
    return public.backoffice_fail(p_actor, v_action, 'practice', p_practice_id, p_practice_id, p_request_id, 'idempotency_key_required');
  end if;
  -- Nur platform_admin; frische Step-up-Authentisierung erzwingt der Worker.
  if not public.backoffice_actor_can(p_actor, 'ownership.transfer', p_practice_id) then
    return public.backoffice_fail(p_actor, v_action, 'practice', p_practice_id, p_practice_id, p_request_id, 'forbidden');
  end if;

  v_hash := md5(p_new_owner::text);
  v_lookup := public.backoffice_idempotency_lookup(p_actor, v_action, p_idempotency_key, v_hash);
  if v_lookup ? 'conflict' then
    return public.backoffice_fail(p_actor, v_action, 'practice', p_practice_id, p_practice_id, p_request_id, 'idempotency_conflict');
  elsif v_lookup ? 'replay' then
    return v_lookup->'result';
  end if;

  begin
    perform public.transfer_practice_ownership(p_practice_id, p_new_owner, p_actor);
    insert into public.backoffice_audit_events (actor_user_id, action, target_type, target_id, practice_id, result, request_id, metadata)
    values (p_actor, v_action, 'practice', p_practice_id, p_practice_id, 'success', p_request_id,
            jsonb_build_object('new_owner_user_id', p_new_owner));
  exception when others then
    return public.backoffice_fail(p_actor, v_action, 'practice', p_practice_id, p_practice_id, p_request_id, 'mutation_failed');
  end;

  v_result := jsonb_build_object('ok', true, 'practice_id', p_practice_id, 'owner_id', p_new_owner);
  insert into public.backoffice_idempotency_keys (actor_user_id, action, key, request_hash, result)
  values (p_actor, v_action, p_idempotency_key, v_hash, v_result);
  return v_result;
end $$;

-- 6. Grants: ausschliesslich service_role -----------------------------------
do $$
declare
  fn text;
  fns text[] := array[
    'backoffice_actor_can(uuid, text, uuid)',
    'backoffice_fail(uuid, text, text, uuid, uuid, text, text)',
    'backoffice_idempotency_lookup(uuid, text, text, text)',
    'backoffice_create_practice(uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text)',
    'backoffice_update_practice(uuid, text, text, uuid, jsonb, text)',
    'backoffice_create_invitation(uuid, text, text, uuid, text, public.practice_member_role, text, text, timestamptz)',
    'backoffice_revoke_invitation(uuid, text, text, uuid)',
    'backoffice_grant_membership(uuid, text, text, uuid, uuid, public.practice_member_role)',
    'backoffice_revoke_membership(uuid, text, text, uuid, uuid)',
    'backoffice_transfer_ownership(uuid, text, text, uuid, uuid)'
  ];
begin
  foreach fn in array fns loop
    execute format('revoke all on function public.%s from public', fn);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on function public.%s from anon', fn);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on function public.%s from authenticated', fn);
    end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function public.%s to service_role', fn);
    end if;
  end loop;
end $$;
