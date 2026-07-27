-- B2 (Slice 1): DB-Sicherheitskern der Admin-API.
-- Capabilities, atomare Mutation+Audit, Idempotenz, Einladungs-/Status-/
-- Membership-Verträge und Owner-Transfer.

create schema if not exists extensions;
create extension if not exists pgtap with schema extensions;

begin;
set local search_path = public, extensions;

select plan(24);

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

-- create_practice + atomicity ------------------------------------------------
select ok(
  (public.backoffice_create_practice('00000000-0000-4000-8000-0000000000b3', 'req-1', null, 'general', 'Legal GmbH', 'Anzeige', 'Vor', 'Nach', 'kontakt@example.test', '+49', 'Str 1', '10115', 'Berlin', 'DE') ->> 'practice_id') is not null,
  'consultant can create a practice'
);
select is((select count(*) from public.backoffice_audit_events where actor_user_id = '00000000-0000-4000-8000-0000000000b3' and action = 'practice.create'), 1::bigint, 'successful create writes exactly one audit event');
select throws_ok(
  $$select public.backoffice_create_practice('00000000-0000-4000-8000-0000000000c3', 'req-2', null, 'general', 'Legal', 'Anzeige', 'Vor', 'Nach', 'k@example.test', '+49', 'Str', '10115', 'Berlin', 'DE')$$,
  '42501', null, 'support cannot create a practice'
);
select is((select count(*) from public.backoffice_audit_events where actor_user_id = '00000000-0000-4000-8000-0000000000c3'), 0::bigint, 'forbidden attempt writes no audit (atomic rollback)');

-- idempotency ----------------------------------------------------------------
select is(
  (public.backoffice_create_practice('00000000-0000-4000-8000-0000000000a3', 'req-3', 'IDEMP-1', 'general', 'L', 'D', 'V', 'N', 'i@example.test', '+49', 'S', '10115', 'B', 'DE') ->> 'practice_id'),
  (public.backoffice_create_practice('00000000-0000-4000-8000-0000000000a3', 'req-3', 'IDEMP-1', 'general', 'L', 'D', 'V', 'N', 'i@example.test', '+49', 'S', '10115', 'B', 'DE') ->> 'practice_id'),
  'idempotent replay returns the same practice'
);
select is((select count(*) from public.backoffice_idempotency_keys where key = 'IDEMP-1'), 1::bigint, 'idempotency key is stored exactly once');

-- status machine -------------------------------------------------------------
select is(
  public.backoffice_update_practice('00000000-0000-4000-8000-0000000000a3', 'req-4', null, '20000000-0000-4000-8000-0000000000a3', '{}'::jsonb, 'invited') ->> 'onboarding_status',
  'invited',
  'valid status transition draft -> invited succeeds'
);
select throws_ok(
  $$select public.backoffice_update_practice('00000000-0000-4000-8000-0000000000a3', 'req-5', null, '20000000-0000-4000-8000-0000000000b3', '{}'::jsonb, 'active')$$,
  '22000', null, 'invalid status transition draft -> active is rejected'
);

-- invitations ----------------------------------------------------------------
select is(
  (public.backoffice_create_invitation('00000000-0000-4000-8000-0000000000a3', 'req-6', null, '20000000-0000-4000-8000-0000000000a3', 'owner@example.test', 'practice_owner', 'in_person_code', 'hmac:v1:deadbeef', now() + interval '1 day') ->> 'revoked_previous')::int,
  0,
  'first invitation revokes no prior invitation'
);
select is(
  (public.backoffice_create_invitation('00000000-0000-4000-8000-0000000000a3', 'req-7', null, '20000000-0000-4000-8000-0000000000a3', 'owner@example.test', 'practice_owner', 'in_person_code', 'hmac:v1:cafef00d', now() + interval '1 day') ->> 'revoked_previous')::int,
  1,
  're-issuing revokes the older matching open invitation'
);
select throws_ok(
  $$select public.backoffice_create_invitation('00000000-0000-4000-8000-0000000000a3', 'req-8', null, '20000000-0000-4000-8000-0000000000a3', 'owner@example.test', 'practice_owner', 'in_person_code', 'hmac:v1:abc', now() + interval '8 days')$$,
  '22000', null, 'invitation expiry beyond seven days is rejected'
);
select throws_ok(
  $$select public.backoffice_create_invitation('00000000-0000-4000-8000-0000000000a3', 'req-9', null, '20000000-0000-4000-8000-0000000000a3', 'owner@example.test', 'practice_owner', 'in_person_code', 'plaintext-code', now() + interval '1 day')$$,
  '22000', null, 'a non-HMAC proof reference is rejected'
);

-- memberships ----------------------------------------------------------------
select is(
  public.backoffice_grant_membership('00000000-0000-4000-8000-0000000000a3', 'req-10', '20000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-0000000000e3', 'viewer') ->> 'role',
  'viewer',
  'admin can grant a membership'
);
select lives_ok(
  $$select public.backoffice_revoke_membership('00000000-0000-4000-8000-0000000000a3', 'req-11', '20000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-0000000000e3')$$,
  'admin can revoke a membership'
);
select is(
  public.can_access_practice('00000000-0000-4000-8000-0000000000e3', '20000000-0000-4000-8000-0000000000a3', 'viewer'),
  false,
  'revoked member has no access afterwards'
);

-- ownership transfer ---------------------------------------------------------
select throws_ok(
  $$select public.backoffice_transfer_ownership('00000000-0000-4000-8000-0000000000b3', 'req-12', '20000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-0000000000d3')$$,
  '42501', null, 'consultant cannot transfer ownership'
);
select lives_ok(
  $$select public.backoffice_transfer_ownership('00000000-0000-4000-8000-0000000000a3', 'req-13', '20000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-0000000000d3')$$,
  'admin can transfer ownership'
);
select is(
  (select owner_id from public.practices where id = '20000000-0000-4000-8000-0000000000a3'),
  '00000000-0000-4000-8000-0000000000d3'::uuid,
  'ownership transfer repoints owner_id to the new owner'
);

select * from finish();
rollback;
