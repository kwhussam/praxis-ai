-- B1a P2: proves the backfill maps pre-existing owner_id / partner_practices
-- data into practice_memberships with the exact role and preserved provenance.
-- Fixtures are created here and then public.backfill_practice_memberships() is
-- invoked (the same idempotent routine the migration runs), so this is a real
-- before/after check rather than fixtures that only exist post-migration.

create schema if not exists extensions;
create extension if not exists pgtap with schema extensions;

begin;

set local search_path = public, extensions;

select plan(6);

-- Legacy fixtures (fresh ids so nothing is pre-mapped by the migration backfill).
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values
  ('00000000-0000-4000-8000-0000000000f0', 'authenticated', 'authenticated', 'legacy-owner-f0@example.test', 'x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-4000-8000-0000000000f1', 'authenticated', 'authenticated', 'legacy-partner-owner-f1@example.test', 'x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-4000-8000-0000000000f2', 'authenticated', 'authenticated', 'legacy-partner-manager-f2@example.test', 'x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-4000-8000-0000000000f3', 'authenticated', 'authenticated', 'legacy-partner-viewer-f3@example.test', 'x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-4000-8000-0000000000f4', 'authenticated', 'authenticated', 'legacy-white-label-f4@example.test', 'x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;

insert into public.practices (id, owner_id, name)
values ('20000000-0000-4000-8000-0000000000f0', '00000000-0000-4000-8000-0000000000f0', 'Legacy Praxis F0')
on conflict (id) do nothing;

insert into public.partner_practices (id, partner_id, practice_id, role, granted_by, granted_at)
values
  ('30000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000f1', '20000000-0000-4000-8000-0000000000f0', 'owner', '00000000-0000-4000-8000-0000000000f0', '2025-01-02T00:00:00Z'),
  ('30000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000f2', '20000000-0000-4000-8000-0000000000f0', 'manager', '00000000-0000-4000-8000-0000000000f0', '2025-02-03T00:00:00Z'),
  ('30000000-0000-4000-8000-0000000000f3', '00000000-0000-4000-8000-0000000000f3', '20000000-0000-4000-8000-0000000000f0', 'viewer', '00000000-0000-4000-8000-0000000000f0', '2025-03-04T00:00:00Z'),
  ('30000000-0000-4000-8000-0000000000f4', '00000000-0000-4000-8000-0000000000f4', '20000000-0000-4000-8000-0000000000f0', 'white_label', '00000000-0000-4000-8000-0000000000f0', '2025-04-05T00:00:00Z')
on conflict (partner_id, practice_id) do nothing;

-- Run the same idempotent backfill the migration uses.
select public.backfill_practice_memberships();

select is(
  (select role::text from public.practice_memberships where practice_id = '20000000-0000-4000-8000-0000000000f0' and user_id = '00000000-0000-4000-8000-0000000000f0' and status = 'active'),
  'practice_owner',
  'owner_id becomes an active practice_owner membership'
);
select is(
  (select role::text from public.practice_memberships where practice_id = '20000000-0000-4000-8000-0000000000f0' and user_id = '00000000-0000-4000-8000-0000000000f1' and status = 'active'),
  'practice_owner',
  'partner_practices owner maps to practice_owner'
);
select is(
  (select role::text from public.practice_memberships where practice_id = '20000000-0000-4000-8000-0000000000f0' and user_id = '00000000-0000-4000-8000-0000000000f2' and status = 'active'),
  'practice_manager',
  'partner_practices manager maps to practice_manager'
);
select is(
  (select role::text from public.practice_memberships where practice_id = '20000000-0000-4000-8000-0000000000f0' and user_id = '00000000-0000-4000-8000-0000000000f3' and status = 'active'),
  'viewer',
  'partner_practices viewer maps to viewer'
);
-- white_label is NOT migrated (stays an effective partner_practices grant only).
select is(
  (select count(*) from public.practice_memberships where practice_id = '20000000-0000-4000-8000-0000000000f0' and user_id = '00000000-0000-4000-8000-0000000000f4'),
  0::bigint,
  'white_label partner is not migrated into practice_memberships'
);
-- Provenance is preserved (granted_by + granted_at) for a migrated grant.
select ok(
  (
    select granted_by = '00000000-0000-4000-8000-0000000000f0'::uuid
       and granted_at = '2025-02-03T00:00:00Z'::timestamptz
    from public.practice_memberships
    where practice_id = '20000000-0000-4000-8000-0000000000f0'
      and user_id = '00000000-0000-4000-8000-0000000000f2'
      and status = 'active'
  ),
  'migrated membership preserves granted_by and granted_at'
);

select * from finish();

rollback;
