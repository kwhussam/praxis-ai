-- B2 (Slice 1): DB-Sicherheitskern der Admin-API.
-- Fachplan docs/WEB_BACKOFFICE_FOUNDATION.md, Freigabe E-027.
--
-- Kernprinzipien (verbindlicher gehaerteter Vertrag):
--  * Jede mutierende Aktion laeuft als transaktionale security-definer-RPC, die
--    Capability-Pruefung, Idempotenz, Mutation und GENAU EIN Erfolgs-Audit in
--    derselben Transaktion behandelt. Ein Fehler rollt alles zurueck -> kein
--    erfolgreicher Fachzustand ohne zugehoeriges Audit. Fehl-/Deny-Audits
--    schreibt der Worker best-effort ausserhalb der Transaktion (Slice 2).
--  * Capabilities sind explizit (kein lineares Rollenranking). Consultant nur im
--    aktiven Assignment-Scope; Support nur Lesen; ownership.transfer nur Admin.
--  * Einmalcodes erreichen die DB nur als versionierte HMAC-Referenz
--    (proof_reference, z. B. 'hmac:v1:<digest>'); Klartext bleibt im Worker.
--  * Rollenauflösung folgt B1a-Cutover (can_access_practice): owner_id + aktive
--    practice_memberships, partner_practices nur white_label.
--  * Nur service_role darf die RPCs ausfuehren.

-- 1. Idempotenz-Speicher ---------------------------------------------------
create table if not exists public.backoffice_idempotency_keys (
  key text primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.backoffice_idempotency_keys enable row level security;
alter table public.backoffice_idempotency_keys force row level security;
-- Keine Policy: fuer authenticated/anon deny-by-default. Zugriff nur ueber die
-- security-definer-RPCs (Eigentuemerrechte).

-- 2. Capability-Modell -----------------------------------------------------
-- Explizite Capabilities:
--   practice.read | practice.create | practice.manage | invitation.manage |
--   membership.manage | ownership.transfer | audit.read
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

  -- Scope-Pruefung fuer praxisbezogene Aktionen (consultant): aktive Zuweisung.
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

-- 4. Idempotenz-Helper -----------------------------------------------------
create or replace function public.backoffice_idempotent_result(p_key text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select result from public.backoffice_idempotency_keys where key = p_key;
$$;

-- 5. Mutations-RPCs (transaktional: Capability + Mutation + genau ein Audit) --

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
  v_prior jsonb;
  v_practice_id uuid;
  v_result jsonb;
begin
  if p_idempotency_key is not null then
    v_prior := public.backoffice_idempotent_result(p_idempotency_key);
    if v_prior is not null then
      return v_prior;
    end if;
  end if;

  if not public.backoffice_actor_can(p_actor, 'practice.create', null) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if p_practice_kind not in ('general', 'health')
     or coalesce(btrim(p_legal_name), '') = ''
     or coalesce(btrim(p_display_name), '') = ''
     or coalesce(btrim(p_contact_email), '') = '' then
    raise exception 'invalid practice master data' using errcode = '22000';
  end if;

  insert into public.practices (
    owner_id, name, domain, practice_kind, legal_name, display_name,
    contact_first_name, contact_last_name, contact_email, contact_phone,
    street, postal_code, city, country_code, onboarding_status,
    created_by_staff_id, updated_at
  )
  values (
    null, p_display_name, p_domain, p_practice_kind, p_legal_name, p_display_name,
    p_contact_first_name, p_contact_last_name, p_contact_email, p_contact_phone,
    p_street, p_postal_code, p_city, p_country_code, 'draft',
    p_actor, now()
  )
  returning id into v_practice_id;

  insert into public.backoffice_audit_events (actor_user_id, action, target_type, target_id, practice_id, result, request_id, metadata)
  values (p_actor, 'practice.create', 'practice', v_practice_id, v_practice_id, 'success', p_request_id, jsonb_build_object('onboarding_status', 'draft'));

  v_result := jsonb_build_object('practice_id', v_practice_id, 'onboarding_status', 'draft');

  if p_idempotency_key is not null then
    insert into public.backoffice_idempotency_keys (key, actor_user_id, action, result)
    values (p_idempotency_key, p_actor, 'practice.create', v_result);
  end if;

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
  v_prior jsonb;
  v_current_status text;
  v_result jsonb;
begin
  if p_idempotency_key is not null then
    v_prior := public.backoffice_idempotent_result(p_idempotency_key);
    if v_prior is not null then
      return v_prior;
    end if;
  end if;

  if not public.backoffice_actor_can(p_actor, 'practice.manage', p_practice_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select onboarding_status into v_current_status
  from public.practices where id = p_practice_id
  for update;

  if not found then
    raise exception 'practice not found' using errcode = 'P0002';
  end if;

  if p_new_status is not null and p_new_status <> v_current_status then
    if not public.backoffice_valid_practice_transition(v_current_status, p_new_status) then
      raise exception 'invalid status transition % -> %', v_current_status, p_new_status using errcode = '22000';
    end if;
  end if;

  update public.practices set
    legal_name = coalesce(p_patch->>'legal_name', legal_name),
    display_name = coalesce(p_patch->>'display_name', display_name),
    name = coalesce(p_patch->>'display_name', name),
    contact_first_name = coalesce(p_patch->>'contact_first_name', contact_first_name),
    contact_last_name = coalesce(p_patch->>'contact_last_name', contact_last_name),
    contact_email = coalesce(p_patch->>'contact_email', contact_email),
    contact_phone = coalesce(p_patch->>'contact_phone', contact_phone),
    street = coalesce(p_patch->>'street', street),
    postal_code = coalesce(p_patch->>'postal_code', postal_code),
    city = coalesce(p_patch->>'city', city),
    country_code = coalesce(p_patch->>'country_code', country_code),
    domain = coalesce(p_patch->>'domain', domain),
    onboarding_status = coalesce(p_new_status, onboarding_status),
    updated_at = now()
  where id = p_practice_id;

  insert into public.backoffice_audit_events (actor_user_id, action, target_type, target_id, practice_id, result, request_id, metadata)
  values (p_actor, 'practice.update', 'practice', p_practice_id, p_practice_id, 'success', p_request_id,
          jsonb_build_object('status_from', v_current_status, 'status_to', coalesce(p_new_status, v_current_status)));

  v_result := jsonb_build_object('practice_id', p_practice_id, 'onboarding_status', coalesce(p_new_status, v_current_status));

  if p_idempotency_key is not null then
    insert into public.backoffice_idempotency_keys (key, actor_user_id, action, result)
    values (p_idempotency_key, p_actor, 'practice.update', v_result);
  end if;

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
  v_prior jsonb;
  v_email text := lower(btrim(p_target_email));
  v_invitation_id uuid;
  v_revoked integer;
  v_result jsonb;
begin
  if p_idempotency_key is not null then
    v_prior := public.backoffice_idempotent_result(p_idempotency_key);
    if v_prior is not null then
      return v_prior;
    end if;
  end if;

  if not public.backoffice_actor_can(p_actor, 'invitation.manage', p_practice_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_email = '' or p_delivery_channel not in ('in_person_code', 'email_link')
     or p_proof_reference is null or p_proof_reference not like 'hmac:v%' then
    raise exception 'invalid invitation input' using errcode = '22000';
  end if;

  -- TTL-Obergrenze: sieben Tage.
  if p_expires_at is null or p_expires_at <= now() or p_expires_at > now() + interval '7 days' then
    raise exception 'invitation expiry must be within seven days' using errcode = '22000';
  end if;

  -- Neuausstellung widerruft aeltere offene Einladungen fuer dieselbe
  -- Praxis/Zieladresse/Rolle (single-use, keine parallelen gueltigen Codes).
  update public.practice_invitations
  set status = 'revoked'
  where practice_id = p_practice_id
    and lower(target_email) = v_email
    and intended_role = p_intended_role
    and status = 'pending';
  get diagnostics v_revoked = row_count;

  insert into public.practice_invitations (
    practice_id, target_email, intended_role, delivery_channel, status,
    proof_reference, expires_at, invited_by
  )
  values (
    p_practice_id, v_email, p_intended_role, p_delivery_channel, 'pending',
    p_proof_reference, p_expires_at, p_actor
  )
  returning id into v_invitation_id;

  insert into public.backoffice_audit_events (actor_user_id, action, target_type, target_id, practice_id, result, request_id, metadata)
  values (p_actor, 'invitation.create', 'practice_invitation', v_invitation_id, p_practice_id, 'success', p_request_id,
          jsonb_build_object('delivery_channel', p_delivery_channel, 'revoked_previous', v_revoked));
  -- Kein Klartextcode und keine proof_reference im Audit.

  v_result := jsonb_build_object('invitation_id', v_invitation_id, 'expires_at', p_expires_at, 'revoked_previous', v_revoked);

  if p_idempotency_key is not null then
    insert into public.backoffice_idempotency_keys (key, actor_user_id, action, result)
    values (p_idempotency_key, p_actor, 'invitation.create', v_result);
  end if;

  return v_result;
end $$;

create or replace function public.backoffice_revoke_invitation(
  p_actor uuid,
  p_request_id text,
  p_invitation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_practice_id uuid;
begin
  select practice_id into v_practice_id from public.practice_invitations where id = p_invitation_id for update;
  if not found then
    raise exception 'invitation not found' using errcode = 'P0002';
  end if;

  if not public.backoffice_actor_can(p_actor, 'invitation.manage', v_practice_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.practice_invitations
  set status = 'revoked'
  where id = p_invitation_id and status = 'pending';

  insert into public.backoffice_audit_events (actor_user_id, action, target_type, target_id, practice_id, result, request_id, metadata)
  values (p_actor, 'invitation.revoke', 'practice_invitation', p_invitation_id, v_practice_id, 'success', p_request_id, '{}'::jsonb);

  return jsonb_build_object('invitation_id', p_invitation_id, 'status', 'revoked');
end $$;

create or replace function public.backoffice_grant_membership(
  p_actor uuid,
  p_request_id text,
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
  v_membership_id uuid;
begin
  if not public.backoffice_actor_can(p_actor, 'membership.manage', p_practice_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  insert into public.practice_memberships (practice_id, user_id, role, status, granted_by, granted_at)
  values (p_practice_id, p_user_id, p_role, 'active', p_actor, now())
  on conflict (practice_id, user_id) where status = 'active'
  do update set role = p_role
  returning id into v_membership_id;

  insert into public.backoffice_audit_events (actor_user_id, action, target_type, target_id, practice_id, result, request_id, metadata)
  values (p_actor, 'membership.grant', 'practice_membership', v_membership_id, p_practice_id, 'success', p_request_id,
          jsonb_build_object('member_user_id', p_user_id, 'role', p_role));

  return jsonb_build_object('membership_id', v_membership_id, 'role', p_role);
end $$;

create or replace function public.backoffice_revoke_membership(
  p_actor uuid,
  p_request_id text,
  p_practice_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.backoffice_actor_can(p_actor, 'membership.manage', p_practice_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Der Trigger guard_last_practice_owner schuetzt den letzten aktiven Owner.
  update public.practice_memberships
  set status = 'revoked', revoked_at = now()
  where practice_id = p_practice_id and user_id = p_user_id and status = 'active';

  insert into public.backoffice_audit_events (actor_user_id, action, target_type, target_id, practice_id, result, request_id, metadata)
  values (p_actor, 'membership.revoke', 'practice_membership', null, p_practice_id, 'success', p_request_id,
          jsonb_build_object('member_user_id', p_user_id));

  return jsonb_build_object('practice_id', p_practice_id, 'member_user_id', p_user_id, 'status', 'revoked');
end $$;

create or replace function public.backoffice_transfer_ownership(
  p_actor uuid,
  p_request_id text,
  p_practice_id uuid,
  p_new_owner uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Nur platform_admin (ownership.transfer); frische Step-up-Authentisierung
  -- wird zusaetzlich im Worker erzwungen.
  if not public.backoffice_actor_can(p_actor, 'ownership.transfer', p_practice_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  perform public.transfer_practice_ownership(p_practice_id, p_new_owner, p_actor);

  insert into public.backoffice_audit_events (actor_user_id, action, target_type, target_id, practice_id, result, request_id, metadata)
  values (p_actor, 'ownership.transfer', 'practice', p_practice_id, p_practice_id, 'success', p_request_id,
          jsonb_build_object('new_owner_user_id', p_new_owner));

  return jsonb_build_object('practice_id', p_practice_id, 'owner_id', p_new_owner);
end $$;

-- 6. Grants: ausschliesslich service_role -----------------------------------
do $$
declare
  fn text;
  fns text[] := array[
    'backoffice_actor_can(uuid, text, uuid)',
    'backoffice_idempotent_result(text)',
    'backoffice_create_practice(uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text)',
    'backoffice_update_practice(uuid, text, text, uuid, jsonb, text)',
    'backoffice_create_invitation(uuid, text, text, uuid, text, public.practice_member_role, text, text, timestamptz)',
    'backoffice_revoke_invitation(uuid, text, uuid)',
    'backoffice_grant_membership(uuid, text, uuid, uuid, public.practice_member_role)',
    'backoffice_revoke_membership(uuid, text, uuid, uuid)',
    'backoffice_transfer_ownership(uuid, text, uuid, uuid)'
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
