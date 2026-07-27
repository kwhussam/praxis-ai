-- B2 (Slice 1): DB-Sicherheitskern der Admin-API.
-- Capabilities, atomare Mutation+Audit (Erfolg UND Fehler), gescopte/
-- fingerprinted Idempotenz, Owner-Schutz, Einladungsvertrag (striktes HMAC),
-- vollstaendige Pflichtfelder, Consultant-Auto-Zuweisung und Owner-Transfer.

create schema if not exists extensions;
create extension if not exists pgtap with schema extensions;

begin;
set local search_path = public, extensions;

select plan(32);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values
  ('00000000-0000-4000-8000-0000000000a3', 'authenticated', 'authenticated', 'admin-a3@example.test', 'x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-4000-8000-0000000000b3', 'authenticated', 'authenticated', 'consultant-b3@example.test', 'x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-4000-8000-0000000000c3', 'authenticated', 'authenticated', 'support-c3@example.test', 'x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-4000-8000-0000000000d3', 'authenticated', 'authenticated', 'newowner-d3@example.test', 'x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-4000-8000-0000000000e3', 'authenticated', 'authenticated', 'member-e3@example.test', 'x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;

insert into public.platform_staff (user_id, role, status)
values
  ('00000000-0000-4000-8000-0000000000a3', 'platform_admin', 'active'),
  ('00000000-0000-4000-8000-0000000000b3', 'security_consultant', 'active'),
  ('00000000-0000-4000-8000-0000000000c3', 'support', 'active')
on conflict (user_id) do nothing;

insert into public.practices (id, owner_id, name, onboarding_status)
values
  ('20000000-0000-4000-8000-0000000000a3', null, 'Backoffice P1', 'draft'),
  ('20000000-0000-4000-8000-0000000000b3', null, 'Backoffice P2', 'draft')
on conflict (id) do nothing;

insert into public.staff_practice_assignments (staff_user_id, practice_id, status)
values
  ('00000000-0000-4000-8000-0000000000b3', '20000000-0000-4000-8000-0000000000a3', 'active'),
  ('00000000-0000-4000-8000-0000000000c3', '20000000-0000-4000-8000-0000000000a3', 'active')
on conflict (staff_user_id, practice_id) where status = 'active' do nothing;

-- Capabilities ---------------------------------------------------------------
select ok(public.backoffice_actor_can('00000000-0000-4000-8000-0000000000a3', 'ownership.transfer', '20000000-0000-4000-8000-0000000000a3'), 'admin has ownership.transfer');
select is(public.backoffice_actor_can('00000000-0000-4000-8000-0000000000b3', 'ownership.transfer', '20000000-0000-4000-8000-0000000000a3'), false, 'consultant lacks ownership.transfer');
select ok(public.backoffice_actor_can('00000000-0000-4000-8000-0000000000b3', 'practice.manage', '20000000-0000-4000-8000-0000000000a3'), 'consultant manages assigned practice');
select is(public.backoffice_actor_can('00000000-0000-4000-8000-0000000000b3', 'practice.manage', '20000000-0000-4000-8000-0000000000b3'), false, 'consultant cannot manage unassigned practice');
select ok(public.backoffice_actor_can('00000000-0000-4000-8000-0000000000c3', 'practice.read', '20000000-0000-4000-8000-0000000000a3'), 'support can read assigned practice');
select is(public.backoffice_actor_can('00000000-0000-4000-8000-0000000000c3', 'practice.manage', '20000000-0000-4000-8000-0000000000a3'), false, 'support cannot manage');

-- create_practice + auto-assignment + atomic success/failure audit -----------
select is(
  public.backoffice_create_practice('00000000-0000-4000-8000-0000000000b3', 'req-1', 'k-c1', 'general', 'Legal GmbH', 'Anzeige', 'Vor', 'Nach', 'kontakt@example.test', '+49301', 'Str 1', '10115', 'Berlin', 'DE') ->> 'ok',
  'true', 'consultant can create a fully specified practice'
);
select ok(
  exists (select 1 from public.staff_practice_assignments a join public.practices p on p.id = a.practice_id
          where p.created_by_staff_id = '00000000-0000-4000-8000-0000000000b3' and a.staff_user_id = '00000000-0000-4000-8000-0000000000b3' and a.status = 'active'),
  'creating consultant is auto-assigned to the new practice'
);
select is((select count(*) from public.backoffice_audit_events where actor_user_id = '00000000-0000-4000-8000-0000000000b3' and action = 'practice.create' and result = 'success'), 1::bigint, 'successful create writes exactly one success audit');
select is(
  public.backoffice_create_practice('00000000-0000-4000-8000-0000000000c3', 'req-2', 'k-sup', 'general', 'Legal', 'Anzeige', 'Vor', 'Nach', 'k@example.test', '+49', 'Str', '10115', 'Berlin', 'DE') ->> 'error',
  'forbidden', 'support cannot create a practice'
);
select is((select count(*) from public.backoffice_audit_events where actor_user_id = '00000000-0000-4000-8000-0000000000c3' and result = 'failure'), 1::bigint, 'denied mutation writes exactly one failure audit (E-027)');
select is(
  public.backoffice_create_practice('00000000-0000-4000-8000-0000000000a3', 'req-3', 'k-bad', 'general', 'Legal', 'Anzeige', 'Vor', 'Nach', 'k@example.test', '', 'Str', '10115', 'Berlin', 'DE') ->> 'error',
  'invalid_master_data', 'incomplete mandatory master data is rejected'
);

-- idempotency (scoped + fingerprinted) ---------------------------------------
select is(
  (public.backoffice_create_practice('00000000-0000-4000-8000-0000000000a3', 'req-4', 'K1', 'general', 'L', 'D', 'V', 'N', 'i@example.test', '+49', 'S', '10115', 'B', 'DE') ->> 'practice_id'),
  (public.backoffice_create_practice('00000000-0000-4000-8000-0000000000a3', 'req-4', 'K1', 'general', 'L', 'D', 'V', 'N', 'i@example.test', '+49', 'S', '10115', 'B', 'DE') ->> 'practice_id'),
  'idempotent replay returns the same practice'
);
select is((select count(*) from public.backoffice_idempotency_keys where actor_user_id = '00000000-0000-4000-8000-0000000000a3' and action = 'practice.create' and key = 'K1'), 1::bigint, 'idempotency key stored once');
select is(
  public.backoffice_create_practice('00000000-0000-4000-8000-0000000000a3', 'req-5', 'K1', 'general', 'DIFFERENT', 'D', 'V', 'N', 'i@example.test', '+49', 'S', '10115', 'B', 'DE') ->> 'error',
  'idempotency_conflict', 'same key with a different payload is a conflict'
);
select is(
  public.backoffice_create_practice('00000000-0000-4000-8000-0000000000a3', 'req-6', null, 'general', 'L', 'D', 'V', 'N', 'i@example.test', '+49', 'S', '10115', 'B', 'DE') ->> 'error',
  'idempotency_key_required', 'a missing idempotency key is rejected'
);

-- status machine -------------------------------------------------------------
select is(
  public.backoffice_update_practice('00000000-0000-4000-8000-0000000000a3', 'req-7', 'k-u1', '20000000-0000-4000-8000-0000000000a3', '{}'::jsonb, 'invited') ->> 'onboarding_status',
  'invited', 'valid status transition draft -> invited succeeds'
);
select is(
  public.backoffice_update_practice('00000000-0000-4000-8000-0000000000a3', 'req-8', 'k-u2', '20000000-0000-4000-8000-0000000000b3', '{}'::jsonb, 'active') ->> 'error',
  'invalid_status_transition', 'invalid status transition draft -> active is rejected'
);

-- invitations (strict HMAC, TTL, revoke-older) -------------------------------
select is(
  (public.backoffice_create_invitation('00000000-0000-4000-8000-0000000000a3', 'req-9', 'k-i1', '20000000-0000-4000-8000-0000000000a3', 'owner@example.test', 'practice_owner', 'in_person_code', 'hmac:v1:' || repeat('a', 64), now() + interval '1 day') ->> 'revoked_previous')::int,
  0, 'first invitation revokes no prior invitation'
);
select is(
  (public.backoffice_create_invitation('00000000-0000-4000-8000-0000000000a3', 'req-10', 'k-i2', '20000000-0000-4000-8000-0000000000a3', 'owner@example.test', 'practice_owner', 'in_person_code', 'hmac:v1:' || repeat('b', 64), now() + interval '1 day') ->> 'revoked_previous')::int,
  1, 're-issue revokes the older matching open invitation'
);
select is(
  public.backoffice_create_invitation('00000000-0000-4000-8000-0000000000a3', 'req-11', 'k-i3', '20000000-0000-4000-8000-0000000000a3', 'owner@example.test', 'practice_owner', 'in_person_code', 'hmac:v1:' || repeat('c', 64), now() + interval '8 days') ->> 'error',
  'invalid_expiry', 'invitation expiry beyond seven days is rejected'
);
select is(
  public.backoffice_create_invitation('00000000-0000-4000-8000-0000000000a3', 'req-12', 'k-i4', '20000000-0000-4000-8000-0000000000a3', 'owner@example.test', 'practice_owner', 'in_person_code', 'hmac:v1:abc', now() + interval '1 day') ->> 'error',
  'invalid_invitation', 'a too-short HMAC proof reference is rejected'
);
select is(
  public.backoffice_create_invitation('00000000-0000-4000-8000-0000000000a3', 'req-13', 'k-i5', '20000000-0000-4000-8000-0000000000a3', 'owner@example.test', 'practice_owner', 'in_person_code', 'hmac:v1:' || repeat('z', 64), now() + interval '1 day') ->> 'error',
  'invalid_invitation', 'a non-hex HMAC proof reference is rejected'
);

-- memberships + owner protection ---------------------------------------------
select is(
  public.backoffice_grant_membership('00000000-0000-4000-8000-0000000000a3', 'req-14', 'k-m1', '20000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-0000000000e3', 'viewer') ->> 'role',
  'viewer', 'admin can grant a non-owner membership'
);
select is(
  public.backoffice_grant_membership('00000000-0000-4000-8000-0000000000a3', 'req-15', 'k-m2', '20000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-0000000000e3', 'practice_owner') ->> 'error',
  'owner_role_forbidden', 'membership grant cannot assign practice_owner'
);
select is(
  public.backoffice_grant_membership('00000000-0000-4000-8000-0000000000b3', 'req-16', 'k-m3', '20000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-0000000000e3', 'practice_owner') ->> 'error',
  'owner_role_forbidden', 'consultant cannot mint an owner via membership grant'
);
select is(
  public.backoffice_revoke_membership('00000000-0000-4000-8000-0000000000a3', 'req-17', 'k-m4', '20000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-0000000000e3') ->> 'ok',
  'true', 'admin can revoke a non-owner membership'
);
select is(
  public.can_access_practice('00000000-0000-4000-8000-0000000000e3', '20000000-0000-4000-8000-0000000000a3', 'viewer'),
  false, 'revoked member has no access afterwards'
);

-- ownership transfer + owner-revoke protection -------------------------------
select is(
  public.backoffice_transfer_ownership('00000000-0000-4000-8000-0000000000b3', 'req-18', 'k-t1', '20000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-0000000000d3') ->> 'error',
  'forbidden', 'consultant cannot transfer ownership'
);
select is(
  public.backoffice_transfer_ownership('00000000-0000-4000-8000-0000000000a3', 'req-19', 'k-t2', '20000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-0000000000d3') ->> 'ok',
  'true', 'admin can transfer ownership'
);
select is(
  (select owner_id from public.practices where id = '20000000-0000-4000-8000-0000000000a3'),
  '00000000-0000-4000-8000-0000000000d3'::uuid, 'ownership transfer repoints owner_id to the new owner'
);
select is(
  public.backoffice_revoke_membership('00000000-0000-4000-8000-0000000000a3', 'req-20', 'k-m5', '20000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-0000000000d3') ->> 'error',
  'owner_role_forbidden', 'membership revoke cannot remove an active practice_owner'
);

select * from finish();
rollback;
