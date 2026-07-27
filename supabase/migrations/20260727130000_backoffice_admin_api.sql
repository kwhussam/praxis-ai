-- B2 (Slice 1): DB-Sicherheitskern der Admin-API.
-- Fachplan docs/WEB_BACKOFFICE_FOUNDATION.md, Freigabe E-027.
--
-- Verbindlicher gehaerteter Vertrag (inkl. zweiter Codex-Gegenpruefung 2026-07-27):
--  * Jede mutierende RPC prueft ZUERST die Capability, dann Idempotenz; Mutation
--    und GENAU EIN Audit-Ereignis (success ODER failure) liegen in derselben
--    Transaktion. Abgelehnte/fehlgeschlagene Mutationen liefern einen
--    strukturierten Fehlervertrag {ok:false,error} UND ein failure-Audit; nur
--    ein reiner Idempotenz-Replay auditiert nicht erneut.
--  * Idempotenz ist an (actor, action, key) gebunden und traegt einen
--    SHA-256-Fingerprint ueber ALLE autorisierungs- und mutationsrelevanten
--    Ziel-IDs (insbesondere practice_id). Gleicher Schluessel mit abweichendem
--    Payload ODER abweichendem Ziel -> Konflikt (kein praxisuebergreifender
--    Ergebnis-Leak). Schluessel/Request-ID sind laengenbegrenzt.
--  * Parallelitaet: die Idempotenz-Zeile wird VOR der Mutation atomar reserviert
--    (insert ... on conflict do nothing). Zwei gleichzeitige Erstrequests werden
--    durch das ON-CONFLICT-Blocking serialisiert; der Verlierer erhaelt den
--    Replay des Gewinners. Scheitert eine Mutation, wird die Reservierung wieder
--    freigegeben, damit ein Retry moeglich bleibt (keine Fehler-Zwischenspeicherung).
--  * Capabilities explizit; consultant nur im aktiven Assignment-Scope; support
--    nur Lesen; ownership.transfer nur admin.
--  * Membership-RPCs fassen NIEMALS eine aktive practice_owner-Rolle an; Owner
--    entsteht/wechselt nur ueber transfer_ownership (Admin + Step-up) bzw. B4-Redeem.
--  * Kein No-op-Erfolg: bereits widerrufene Einladungen bzw. nicht vorhandene
--    aktive Mitgliedschaften werden als Fehler (invalid_state/not_found) auditiert,
--    nie als success.
--  * Einmalcodes erreichen die DB nur als striktes HMAC-Format 'hmac:v1:<64 hex>';
--    unbekannte Versionen werden abgelehnt. Klartext/Secret bleiben im Worker.
--  * Failure-Audit ist FK-sicher: eine nicht existierende practice_id landet nie
--    in der FK-Spalte, sondern nur als nicht-FK target_id.
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

-- Laengen-/Pflicht-Guard fuer Idempotenz-Key und Request-ID. Gibt bei Verstoss
-- ein Fehlerlabel zurueck, sonst null.
create or replace function public.backoffice_guard_ids(p_key text, p_request_id text)
returns text
language sql
immutable
as $$
  select case
    when coalesce(btrim(p_key), '') = '' then 'idempotency_key_required'
    when length(p_key) > 200 then 'idempotency_key_invalid'
    when p_request_id is not null and length(p_request_id) > 200 then 'request_id_invalid'
    else null
  end;
$$;

-- Kanonischer SHA-256-Fingerprint. jsonb serialisiert schluesselsortiert und
-- normalisiert -> stabiler, kollisionsarmer Hash inklusive aller Ziel-IDs.
create or replace function public.backoffice_hash(p_payload jsonb)
returns text
language sql
immutable
as $$
  select encode(sha256(convert_to(p_payload::text, 'UTF8')), 'hex');
$$;

-- Genau ein failure-Audit + strukturierter Fehlervertrag. FK-sicher: eine nicht
-- existierende practice_id wird NICHT in die FK-Spalte geschrieben, sondern nur
-- als nicht-FK target_id festgehalten. Keine sensitiven Eingaben/Details ins Audit.
create or replace function public.backoffice_fail(
  p_actor uuid, p_action text, p_target_type text, p_target_id uuid,
  p_practice_id uuid, p_request_id text, p_error text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_practice_fk uuid := null;
begin
  if p_practice_id is not null and exists (select 1 from public.practices where id = p_practice_id) then
    v_practice_fk := p_practice_id;
  end if;
  insert into public.backoffice_audit_events (actor_user_id, action, target_type, target_id, practice_id, result, request_id, metadata)
  values (p_actor, p_action, p_target_type, coalesce(p_target_id, p_practice_id), v_practice_fk, 'failure', left(p_request_id, 200), jsonb_build_object('error', p_error));
  return jsonb_build_object('ok', false, 'error', p_error);
end $$;

-- Atomare Idempotenz-Reservierung. Ergebnis:
--   {reserved:true}            -> Zeile neu belegt, Aufrufer besitzt sie
--   {replay:true,result:...}   -> gleicher Key+Hash bereits abgeschlossen
--   {conflict:true}            -> gleicher Key, abweichender Hash/Ziel
--   {in_progress:true}         -> defensiv (durch ON-CONFLICT-Blocking praktisch
--                                 unerreichbar, da abgeschlossene Zeilen result != '{}')
create or replace function public.backoffice_reserve(
  p_actor uuid, p_action text, p_key text, p_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted integer;
  v_hash text;
  v_result jsonb;
begin
  insert into public.backoffice_idempotency_keys (actor_user_id, action, key, request_hash, result)
  values (p_actor, p_action, p_key, p_hash, '{}'::jsonb)
  on conflict (actor_user_id, action, key) do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted = 1 then
    return jsonb_build_object('reserved', true);
  end if;

  select request_hash, result into v_hash, v_result
  from public.backoffice_idempotency_keys
  where actor_user_id = p_actor and action = p_action and key = p_key;

  if v_hash is distinct from p_hash then
    return jsonb_build_object('conflict', true);
  end if;
  if v_result = '{}'::jsonb then
    return jsonb_build_object('in_progress', true);
  end if;
  return jsonb_build_object('replay', true, 'result', v_result);
end $$;

-- Reservierung mit Ergebnis abschliessen (Erfolgspfad).
create or replace function public.backoffice_reserve_commit(
  p_actor uuid, p_action text, p_key text, p_result jsonb
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.backoffice_idempotency_keys set result = p_result
  where actor_user_id = p_actor and action = p_action and key = p_key;
$$;

-- Reservierung freigeben (Fehlerpfad -> Retry bleibt moeglich).
create or replace function public.backoffice_reserve_release(
  p_actor uuid, p_action text, p_key text
)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.backoffice_idempotency_keys
  where actor_user_id = p_actor and action = p_action and key = p_key;
$$;

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
  v_guard text;
  v_hash text;
  v_reserve jsonb;
  v_practice_id uuid;
  v_result jsonb;
  v_role text;
  v_fail_reason text := 'mutation_failed';
begin
  v_guard := public.backoffice_guard_ids(p_idempotency_key, p_request_id);
  if v_guard is not null then
    return public.backoffice_fail(p_actor, v_action, 'practice', null, null, p_request_id, v_guard);
  end if;
  if not public.backoffice_actor_can(p_actor, 'practice.create', null) then
    return public.backoffice_fail(p_actor, v_action, 'practice', null, null, p_request_id, 'forbidden');
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

  v_hash := public.backoffice_hash(jsonb_build_object(
    'kind', p_practice_kind, 'legal', btrim(p_legal_name), 'display', btrim(p_display_name),
    'first', btrim(p_contact_first_name), 'last', btrim(p_contact_last_name), 'email', v_email,
    'phone', btrim(p_contact_phone), 'street', btrim(p_street), 'zip', btrim(p_postal_code),
    'city', btrim(p_city), 'country', v_country, 'domain', p_domain));
  v_reserve := public.backoffice_reserve(p_actor, v_action, p_idempotency_key, v_hash);
  if v_reserve ? 'conflict' then
    return public.backoffice_fail(p_actor, v_action, 'practice', null, null, p_request_id, 'idempotency_conflict');
  elsif v_reserve ? 'in_progress' then
    return public.backoffice_fail(p_actor, v_action, 'practice', null, null, p_request_id, 'idempotency_in_progress');
  elsif v_reserve ? 'replay' then
    return v_reserve->'result';
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
    values (p_actor, v_action, 'practice', v_practice_id, v_practice_id, 'success', left(p_request_id, 200),
            jsonb_build_object('onboarding_status', 'draft', 'auto_assigned', v_role = 'security_consultant'));
  exception when others then
    perform public.backoffice_reserve_release(p_actor, v_action, p_idempotency_key);
    return public.backoffice_fail(p_actor, v_action, 'practice', null, null, p_request_id, v_fail_reason);
  end;

  v_result := jsonb_build_object('ok', true, 'practice_id', v_practice_id, 'onboarding_status', 'draft');
  perform public.backoffice_reserve_commit(p_actor, v_action, p_idempotency_key, v_result);
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
  v_guard text;
  v_hash text;
  v_reserve jsonb;
  v_current_status text;
  v_field text;
  v_result jsonb;
  v_fail_reason text := 'mutation_failed';
begin
  v_guard := public.backoffice_guard_ids(p_idempotency_key, p_request_id);
  if v_guard is not null then
    return public.backoffice_fail(p_actor, v_action, 'practice', p_practice_id, p_practice_id, p_request_id, v_guard);
  end if;
  if not public.backoffice_actor_can(p_actor, 'practice.manage', p_practice_id) then
    return public.backoffice_fail(p_actor, v_action, 'practice', p_practice_id, p_practice_id, p_request_id, 'forbidden');
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
  -- Dieselbe Mindestvalidierung fuer E-Mail wie bei create (mindestens ein '@').
  if p_patch ? 'contact_email' and position('@' in lower(btrim(coalesce(p_patch->>'contact_email', '')))) = 0 then
    return public.backoffice_fail(p_actor, v_action, 'practice', p_practice_id, p_practice_id, p_request_id, 'invalid_master_data');
  end if;

  v_hash := public.backoffice_hash(jsonb_build_object(
    'practice_id', p_practice_id, 'patch', coalesce(p_patch, '{}'::jsonb), 'status', p_new_status));
  v_reserve := public.backoffice_reserve(p_actor, v_action, p_idempotency_key, v_hash);
  if v_reserve ? 'conflict' then
    return public.backoffice_fail(p_actor, v_action, 'practice', p_practice_id, p_practice_id, p_request_id, 'idempotency_conflict');
  elsif v_reserve ? 'in_progress' then
    return public.backoffice_fail(p_actor, v_action, 'practice', p_practice_id, p_practice_id, p_request_id, 'idempotency_in_progress');
  elsif v_reserve ? 'replay' then
    return v_reserve->'result';
  end if;

  begin
    select onboarding_status into v_current_status from public.practices where id = p_practice_id for update;
    if not found then
      v_fail_reason := 'not_found';
      raise exception 'abort';
    end if;
    if p_new_status is not null and p_new_status <> v_current_status
       and not public.backoffice_valid_practice_transition(v_current_status, p_new_status) then
      v_fail_reason := 'invalid_status_transition';
      raise exception 'abort';
    end if;

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
    values (p_actor, v_action, 'practice', p_practice_id, p_practice_id, 'success', left(p_request_id, 200),
            jsonb_build_object('status_from', v_current_status, 'status_to', coalesce(p_new_status, v_current_status)));
  exception when others then
    perform public.backoffice_reserve_release(p_actor, v_action, p_idempotency_key);
    return public.backoffice_fail(p_actor, v_action, 'practice', p_practice_id, p_practice_id, p_request_id, v_fail_reason);
  end;

  v_result := jsonb_build_object('ok', true, 'practice_id', p_practice_id, 'onboarding_status', coalesce(p_new_status, v_current_status));
  perform public.backoffice_reserve_commit(p_actor, v_action, p_idempotency_key, v_result);
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
  v_guard text;
  v_hash text;
  v_reserve jsonb;
  v_invitation_id uuid;
  v_revoked integer;
  v_result jsonb;
  v_fail_reason text := 'mutation_failed';
begin
  v_guard := public.backoffice_guard_ids(p_idempotency_key, p_request_id);
  if v_guard is not null then
    return public.backoffice_fail(p_actor, v_action, 'practice_invitation', null, p_practice_id, p_request_id, v_guard);
  end if;
  if not public.backoffice_actor_can(p_actor, 'invitation.manage', p_practice_id) then
    return public.backoffice_fail(p_actor, v_action, 'practice_invitation', null, p_practice_id, p_request_id, 'forbidden');
  end if;

  -- Nur unterstuetzte HMAC-Version v1 zulassen (Klartext bleibt im Worker).
  if v_email = '' or position('@' in v_email) = 0
     or p_delivery_channel not in ('in_person_code', 'email_link')
     or p_proof_reference is null or p_proof_reference !~ '^hmac:v1:[0-9a-f]{64}$' then
    return public.backoffice_fail(p_actor, v_action, 'practice_invitation', null, p_practice_id, p_request_id, 'invalid_invitation');
  end if;
  if p_expires_at is null or p_expires_at <= now() or p_expires_at > now() + interval '7 days' then
    return public.backoffice_fail(p_actor, v_action, 'practice_invitation', null, p_practice_id, p_request_id, 'invalid_expiry');
  end if;

  v_hash := public.backoffice_hash(jsonb_build_object(
    'practice_id', p_practice_id, 'email', v_email, 'role', p_intended_role::text,
    'channel', p_delivery_channel, 'proof', p_proof_reference, 'expires', p_expires_at));
  v_reserve := public.backoffice_reserve(p_actor, v_action, p_idempotency_key, v_hash);
  if v_reserve ? 'conflict' then
    return public.backoffice_fail(p_actor, v_action, 'practice_invitation', null, p_practice_id, p_request_id, 'idempotency_conflict');
  elsif v_reserve ? 'in_progress' then
    return public.backoffice_fail(p_actor, v_action, 'practice_invitation', null, p_practice_id, p_request_id, 'idempotency_in_progress');
  elsif v_reserve ? 'replay' then
    return v_reserve->'result';
  end if;

  begin
    if not exists (select 1 from public.practices where id = p_practice_id) then
      v_fail_reason := 'not_found';
      raise exception 'abort';
    end if;

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
    values (p_actor, v_action, 'practice_invitation', v_invitation_id, p_practice_id, 'success', left(p_request_id, 200),
            jsonb_build_object('delivery_channel', p_delivery_channel, 'revoked_previous', v_revoked));
    -- Kein Klartextcode und keine proof_reference im Audit.
  exception when others then
    perform public.backoffice_reserve_release(p_actor, v_action, p_idempotency_key);
    return public.backoffice_fail(p_actor, v_action, 'practice_invitation', null, p_practice_id, p_request_id, v_fail_reason);
  end;

  v_result := jsonb_build_object('ok', true, 'invitation_id', v_invitation_id, 'expires_at', p_expires_at, 'revoked_previous', v_revoked);
  perform public.backoffice_reserve_commit(p_actor, v_action, p_idempotency_key, v_result);
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
  v_guard text;
  v_hash text;
  v_reserve jsonb;
  v_practice_id uuid;
  v_status text;
  v_result jsonb;
  v_fail_reason text := 'mutation_failed';
begin
  v_guard := public.backoffice_guard_ids(p_idempotency_key, p_request_id);
  if v_guard is not null then
    return public.backoffice_fail(p_actor, v_action, 'practice_invitation', p_invitation_id, null, p_request_id, v_guard);
  end if;

  -- Ziel sperren und Praxis fuer die Capability-Pruefung aufloesen.
  select practice_id, status into v_practice_id, v_status
  from public.practice_invitations where id = p_invitation_id for update;
  if not found then
    return public.backoffice_fail(p_actor, v_action, 'practice_invitation', p_invitation_id, null, p_request_id, 'not_found');
  end if;
  if not public.backoffice_actor_can(p_actor, 'invitation.manage', v_practice_id) then
    return public.backoffice_fail(p_actor, v_action, 'practice_invitation', p_invitation_id, v_practice_id, p_request_id, 'forbidden');
  end if;

  v_hash := public.backoffice_hash(jsonb_build_object('invitation_id', p_invitation_id));
  v_reserve := public.backoffice_reserve(p_actor, v_action, p_idempotency_key, v_hash);
  if v_reserve ? 'conflict' then
    return public.backoffice_fail(p_actor, v_action, 'practice_invitation', p_invitation_id, v_practice_id, p_request_id, 'idempotency_conflict');
  elsif v_reserve ? 'in_progress' then
    return public.backoffice_fail(p_actor, v_action, 'practice_invitation', p_invitation_id, v_practice_id, p_request_id, 'idempotency_in_progress');
  elsif v_reserve ? 'replay' then
    return v_reserve->'result';
  end if;

  -- Kein No-op-Erfolg: nur eine tatsaechlich offene Einladung wird widerrufen.
  if v_status <> 'pending' then
    perform public.backoffice_reserve_release(p_actor, v_action, p_idempotency_key);
    return public.backoffice_fail(p_actor, v_action, 'practice_invitation', p_invitation_id, v_practice_id, p_request_id, 'invalid_state');
  end if;

  begin
    update public.practice_invitations set status = 'revoked' where id = p_invitation_id and status = 'pending';
    insert into public.backoffice_audit_events (actor_user_id, action, target_type, target_id, practice_id, result, request_id, metadata)
    values (p_actor, v_action, 'practice_invitation', p_invitation_id, v_practice_id, 'success', left(p_request_id, 200), '{}'::jsonb);
  exception when others then
    perform public.backoffice_reserve_release(p_actor, v_action, p_idempotency_key);
    return public.backoffice_fail(p_actor, v_action, 'practice_invitation', p_invitation_id, v_practice_id, p_request_id, v_fail_reason);
  end;

  v_result := jsonb_build_object('ok', true, 'invitation_id', p_invitation_id, 'status', 'revoked');
  perform public.backoffice_reserve_commit(p_actor, v_action, p_idempotency_key, v_result);
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
  v_guard text;
  v_hash text;
  v_reserve jsonb;
  v_existing_role public.practice_member_role;
  v_membership_id uuid;
  v_result jsonb;
  v_fail_reason text := 'mutation_failed';
begin
  v_guard := public.backoffice_guard_ids(p_idempotency_key, p_request_id);
  if v_guard is not null then
    return public.backoffice_fail(p_actor, v_action, 'practice_membership', null, p_practice_id, p_request_id, v_guard);
  end if;
  if not public.backoffice_actor_can(p_actor, 'membership.manage', p_practice_id) then
    return public.backoffice_fail(p_actor, v_action, 'practice_membership', null, p_practice_id, p_request_id, 'forbidden');
  end if;

  -- Owner-Schutz (Parameter): Membership-RPC vergibt nie eine practice_owner-Rolle.
  if p_role = 'practice_owner' then
    return public.backoffice_fail(p_actor, v_action, 'practice_membership', null, p_practice_id, p_request_id, 'owner_role_forbidden');
  end if;

  v_hash := public.backoffice_hash(jsonb_build_object(
    'practice_id', p_practice_id, 'user_id', p_user_id, 'role', p_role::text));
  v_reserve := public.backoffice_reserve(p_actor, v_action, p_idempotency_key, v_hash);
  if v_reserve ? 'conflict' then
    return public.backoffice_fail(p_actor, v_action, 'practice_membership', null, p_practice_id, p_request_id, 'idempotency_conflict');
  elsif v_reserve ? 'in_progress' then
    return public.backoffice_fail(p_actor, v_action, 'practice_membership', null, p_practice_id, p_request_id, 'idempotency_in_progress');
  elsif v_reserve ? 'replay' then
    return v_reserve->'result';
  end if;

  begin
    -- Owner-Schutz (Ziel): eine bestehende aktive Owner-Rolle wird nie ueberschrieben.
    select role into v_existing_role from public.practice_memberships
    where practice_id = p_practice_id and user_id = p_user_id and status = 'active' for update;
    if v_existing_role = 'practice_owner' then
      v_fail_reason := 'owner_role_forbidden';
      raise exception 'abort';
    end if;

    insert into public.practice_memberships (practice_id, user_id, role, status, granted_by, granted_at)
    values (p_practice_id, p_user_id, p_role, 'active', p_actor, now())
    on conflict (practice_id, user_id) where status = 'active'
    do update set role = p_role
    returning id into v_membership_id;

    insert into public.backoffice_audit_events (actor_user_id, action, target_type, target_id, practice_id, result, request_id, metadata)
    values (p_actor, v_action, 'practice_membership', v_membership_id, p_practice_id, 'success', left(p_request_id, 200),
            jsonb_build_object('member_user_id', p_user_id, 'role', p_role));
  exception when others then
    perform public.backoffice_reserve_release(p_actor, v_action, p_idempotency_key);
    return public.backoffice_fail(p_actor, v_action, 'practice_membership', null, p_practice_id, p_request_id, v_fail_reason);
  end;

  v_result := jsonb_build_object('ok', true, 'membership_id', v_membership_id, 'role', p_role);
  perform public.backoffice_reserve_commit(p_actor, v_action, p_idempotency_key, v_result);
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
  v_guard text;
  v_hash text;
  v_reserve jsonb;
  v_existing_role public.practice_member_role;
  v_result jsonb;
  v_fail_reason text := 'mutation_failed';
begin
  v_guard := public.backoffice_guard_ids(p_idempotency_key, p_request_id);
  if v_guard is not null then
    return public.backoffice_fail(p_actor, v_action, 'practice_membership', null, p_practice_id, p_request_id, v_guard);
  end if;
  if not public.backoffice_actor_can(p_actor, 'membership.manage', p_practice_id) then
    return public.backoffice_fail(p_actor, v_action, 'practice_membership', null, p_practice_id, p_request_id, 'forbidden');
  end if;

  v_hash := public.backoffice_hash(jsonb_build_object('practice_id', p_practice_id, 'user_id', p_user_id));
  v_reserve := public.backoffice_reserve(p_actor, v_action, p_idempotency_key, v_hash);
  if v_reserve ? 'conflict' then
    return public.backoffice_fail(p_actor, v_action, 'practice_membership', null, p_practice_id, p_request_id, 'idempotency_conflict');
  elsif v_reserve ? 'in_progress' then
    return public.backoffice_fail(p_actor, v_action, 'practice_membership', null, p_practice_id, p_request_id, 'idempotency_in_progress');
  elsif v_reserve ? 'replay' then
    return v_reserve->'result';
  end if;

  begin
    select role into v_existing_role from public.practice_memberships
    where practice_id = p_practice_id and user_id = p_user_id and status = 'active' for update;
    -- Kein No-op-Erfolg: ohne aktive Mitgliedschaft ist der Widerruf not_found.
    if not found then
      v_fail_reason := 'not_found';
      raise exception 'abort';
    end if;
    -- Owner-Schutz: eine aktive practice_owner-Rolle wird hier nie widerrufen.
    if v_existing_role = 'practice_owner' then
      v_fail_reason := 'owner_role_forbidden';
      raise exception 'abort';
    end if;

    update public.practice_memberships
    set status = 'revoked', revoked_at = now()
    where practice_id = p_practice_id and user_id = p_user_id and status = 'active';

    insert into public.backoffice_audit_events (actor_user_id, action, target_type, target_id, practice_id, result, request_id, metadata)
    values (p_actor, v_action, 'practice_membership', null, p_practice_id, 'success', left(p_request_id, 200),
            jsonb_build_object('member_user_id', p_user_id));
  exception when others then
    perform public.backoffice_reserve_release(p_actor, v_action, p_idempotency_key);
    return public.backoffice_fail(p_actor, v_action, 'practice_membership', null, p_practice_id, p_request_id, v_fail_reason);
  end;

  v_result := jsonb_build_object('ok', true, 'practice_id', p_practice_id, 'member_user_id', p_user_id, 'status', 'revoked');
  perform public.backoffice_reserve_commit(p_actor, v_action, p_idempotency_key, v_result);
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
  v_guard text;
  v_hash text;
  v_reserve jsonb;
  v_result jsonb;
  v_fail_reason text := 'mutation_failed';
begin
  v_guard := public.backoffice_guard_ids(p_idempotency_key, p_request_id);
  if v_guard is not null then
    return public.backoffice_fail(p_actor, v_action, 'practice', p_practice_id, p_practice_id, p_request_id, v_guard);
  end if;
  -- Nur platform_admin; frische Step-up-Authentisierung erzwingt der Worker.
  if not public.backoffice_actor_can(p_actor, 'ownership.transfer', p_practice_id) then
    return public.backoffice_fail(p_actor, v_action, 'practice', p_practice_id, p_practice_id, p_request_id, 'forbidden');
  end if;

  v_hash := public.backoffice_hash(jsonb_build_object('practice_id', p_practice_id, 'new_owner', p_new_owner));
  v_reserve := public.backoffice_reserve(p_actor, v_action, p_idempotency_key, v_hash);
  if v_reserve ? 'conflict' then
    return public.backoffice_fail(p_actor, v_action, 'practice', p_practice_id, p_practice_id, p_request_id, 'idempotency_conflict');
  elsif v_reserve ? 'in_progress' then
    return public.backoffice_fail(p_actor, v_action, 'practice', p_practice_id, p_practice_id, p_request_id, 'idempotency_in_progress');
  elsif v_reserve ? 'replay' then
    return v_reserve->'result';
  end if;

  begin
    if not exists (select 1 from public.practices where id = p_practice_id) then
      v_fail_reason := 'not_found';
      raise exception 'abort';
    end if;
    perform public.transfer_practice_ownership(p_practice_id, p_new_owner, p_actor);
    insert into public.backoffice_audit_events (actor_user_id, action, target_type, target_id, practice_id, result, request_id, metadata)
    values (p_actor, v_action, 'practice', p_practice_id, p_practice_id, 'success', left(p_request_id, 200),
            jsonb_build_object('new_owner_user_id', p_new_owner));
  exception when others then
    perform public.backoffice_reserve_release(p_actor, v_action, p_idempotency_key);
    return public.backoffice_fail(p_actor, v_action, 'practice', p_practice_id, p_practice_id, p_request_id, v_fail_reason);
  end;

  v_result := jsonb_build_object('ok', true, 'practice_id', p_practice_id, 'owner_id', p_new_owner);
  perform public.backoffice_reserve_commit(p_actor, v_action, p_idempotency_key, v_result);
  return v_result;
end $$;

-- 6. Grants -----------------------------------------------------------------
-- Interne Helfer werden von den security-definer-RPCs im Definer-Kontext
-- aufgerufen; sie sind fuer externe Rollen gesperrt. Nur die sieben
-- Mutations-RPCs sind fuer service_role ausfuehrbar.
do $$
declare
  fn text;
  helpers text[] := array[
    'backoffice_actor_can(uuid, text, uuid)',
    'backoffice_valid_practice_transition(text, text)',
    'backoffice_guard_ids(text, text)',
    'backoffice_hash(jsonb)',
    'backoffice_fail(uuid, text, text, uuid, uuid, text, text)',
    'backoffice_reserve(uuid, text, text, text)',
    'backoffice_reserve_commit(uuid, text, text, jsonb)',
    'backoffice_reserve_release(uuid, text, text)'
  ];
  rpcs text[] := array[
    'backoffice_create_practice(uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text)',
    'backoffice_update_practice(uuid, text, text, uuid, jsonb, text)',
    'backoffice_create_invitation(uuid, text, text, uuid, text, public.practice_member_role, text, text, timestamptz)',
    'backoffice_revoke_invitation(uuid, text, text, uuid)',
    'backoffice_grant_membership(uuid, text, text, uuid, uuid, public.practice_member_role)',
    'backoffice_revoke_membership(uuid, text, text, uuid, uuid)',
    'backoffice_transfer_ownership(uuid, text, text, uuid, uuid)'
  ];
begin
  foreach fn in array helpers || rpcs loop
    execute format('revoke all on function public.%s from public', fn);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on function public.%s from anon', fn);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on function public.%s from authenticated', fn);
    end if;
  end loop;
  foreach fn in array rpcs loop
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function public.%s to service_role', fn);
    end if;
  end loop;
end $$;
