-- SP2-04 release evidence: immutable assessment manifests, tenant isolation and
-- atomic/idempotent persistence. This suite always runs in `supabase db test`;
-- unlike the Jest integration tests it does not depend on optional env vars.
create schema if not exists extensions;
create extension if not exists pgtap with schema extensions;

begin;
set local search_path = public, extensions;
select plan(19);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data
)
values
  ('a1400000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'manifest-a@example.test', 'x', now(), now(), now(), '{}', '{}'),
  ('a1400000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'manifest-b@example.test', 'x', now(), now(), now(), '{}', '{}')
on conflict (id) do nothing;

insert into public.practices (id, owner_id, name)
values
  ('b1400000-0000-4000-8000-000000000001', 'a1400000-0000-4000-8000-000000000001', 'Manifest Praxis A'),
  ('b1400000-0000-4000-8000-000000000002', 'a1400000-0000-4000-8000-000000000002', 'Manifest Praxis B')
on conflict (id) do nothing;

insert into public.practice_memberships (practice_id, user_id, role, status, granted_by)
values
  ('b1400000-0000-4000-8000-000000000001', 'a1400000-0000-4000-8000-000000000001', 'practice_owner', 'active', 'a1400000-0000-4000-8000-000000000001'),
  ('b1400000-0000-4000-8000-000000000002', 'a1400000-0000-4000-8000-000000000002', 'practice_owner', 'active', 'a1400000-0000-4000-8000-000000000002')
on conflict (practice_id, user_id) where status = 'active' do nothing;

insert into public.security_checks (id, practice_id, type, score, results)
values
  ('c1400000-0000-4000-8000-000000000001', 'b1400000-0000-4000-8000-000000000001', 'external', 80, '{}'),
  ('c1400000-0000-4000-8000-000000000002', 'b1400000-0000-4000-8000-000000000002', 'external', 50, '{}')
on conflict (id) do nothing;

insert into public.assessment_manifests (
  id, practice_id, source_check_id, manifest_version, assessment_profile,
  facts_version, scoring_version, report_format_version, pdf_template_version,
  snapshot_sha256, manifest, manifest_sha256, encrypted_snapshot, created_at
)
values
  (
    'd1400000-0000-4000-8000-000000000001', 'b1400000-0000-4000-8000-000000000001',
    'c1400000-0000-4000-8000-000000000001', '1.0.0', 'general', '1.0.0', '2026.1', '1.0.0', '1.0.0',
    repeat('a', 64), '{}', repeat('b', 64), '{"alg":"AES-256-GCM"}', '2026-08-12T10:00:00Z'
  ),
  (
    'd1400000-0000-4000-8000-000000000002', 'b1400000-0000-4000-8000-000000000002',
    'c1400000-0000-4000-8000-000000000002', '1.0.0', 'general', '1.0.0', '2026.1', '1.0.0', '1.0.0',
    repeat('c', 64), '{}', repeat('d', 64), '{"alg":"AES-256-GCM"}', '2026-08-12T10:00:00Z'
  );

-- A colliding report ID forces the report insert to fail after the manifest
-- insert. The RPC subtransaction must remove that transient manifest.
insert into public.reports (id, practice_id, check_id, content)
values (
  'e1400000-0000-4000-8000-000000000001',
  'b1400000-0000-4000-8000-000000000001',
  'c1400000-0000-4000-8000-000000000001',
  '{}'
);

select is(
  (select relrowsecurity from pg_class where oid = 'public.assessment_manifests'::regclass),
  true,
  'assessment manifests have row-level security enabled'
);
select is(
  (select relforcerowsecurity from pg_class where oid = 'public.assessment_manifests'::regclass),
  true,
  'assessment manifests force row-level security for table owners'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.persist_assessment_report(uuid,uuid,uuid,uuid,timestamptz,text,text,text,text,text,text,text,jsonb,text,jsonb,jsonb,jsonb,text,text)',
    'EXECUTE'
  ),
  'authenticated cannot execute the persistence RPC'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.persist_assessment_report(uuid,uuid,uuid,uuid,timestamptz,text,text,text,text,text,text,text,jsonb,text,jsonb,jsonb,jsonb,text,text)',
    'EXECUTE'
  ),
  'service_role can execute the persistence RPC'
);
select ok(
  (select 'search_path=public' = any(proconfig) from pg_proc where oid = 'public.persist_assessment_report(uuid,uuid,uuid,uuid,timestamptz,text,text,text,text,text,text,text,jsonb,text,jsonb,jsonb,jsonb,text,text)'::regprocedure),
  'persistence RPC fixes its search_path'
);

select throws_ok(
  $$insert into public.reports (id, practice_id, check_id, assessment_manifest_id, content)
    values (
      'e1400000-0000-4000-8000-000000000002',
      'b1400000-0000-4000-8000-000000000001',
      'c1400000-0000-4000-8000-000000000001',
      'd1400000-0000-4000-8000-000000000002',
      '{}'
    )$$,
  '23503',
  null,
  'composite FK rejects a cross-tenant manifest binding'
);

select throws_ok(
  $$select public.persist_assessment_report(
    'e1400000-0000-4000-8000-000000000003', 'd1400000-0000-4000-8000-000000000003',
    'b1400000-0000-4000-8000-000000000001', 'c1400000-0000-4000-8000-000000000002',
    '2026-08-12T10:00:00Z', '1.0.0', 'general', '1.0.0', '2026.1', '1.0.0', '1.0.0',
    repeat('e',64), '{}', repeat('f',64), '{}', '{}', '{}', repeat('1',64), null
  )$$,
  '23503',
  null,
  'persistence RPC rejects a source check from another tenant'
);
select is(
  (select count(*) from public.assessment_manifests where id = 'd1400000-0000-4000-8000-000000000003'),
  0::bigint,
  'source-check rejection leaves no manifest'
);

select throws_ok(
  $$select public.persist_assessment_report(
    'e1400000-0000-4000-8000-000000000001', 'd1400000-0000-4000-8000-000000000004',
    'b1400000-0000-4000-8000-000000000001', 'c1400000-0000-4000-8000-000000000001',
    '2026-08-12T10:00:00Z', '1.0.0', 'general', '1.0.0', '2026.1', '1.0.0', '1.0.0',
    repeat('e',64), '{}', repeat('f',64), '{}', '{}', '{}', repeat('1',64), null
  )$$,
  '23505',
  null,
  'report insert failure propagates from the atomic RPC'
);
select is(
  (select count(*) from public.assessment_manifests where id = 'd1400000-0000-4000-8000-000000000004'),
  0::bigint,
  'report insert failure rolls back the manifest insert'
);

select is(
  public.persist_assessment_report(
    'e1400000-0000-4000-8000-000000000005', 'd1400000-0000-4000-8000-000000000005',
    'b1400000-0000-4000-8000-000000000001', 'c1400000-0000-4000-8000-000000000001',
    '2026-08-12T10:00:00Z', '1.0.0', 'general', '1.0.0', '2026.1', '1.0.0', '1.0.0',
    repeat('e',64), '{}', repeat('f',64), '{}', '{}', '{}', repeat('1',64), 'manifest-idempotency'
  ),
  jsonb_build_object(
    'report_id', 'e1400000-0000-4000-8000-000000000005'::uuid,
    'assessment_manifest_id', 'd1400000-0000-4000-8000-000000000005'::uuid
  ),
  'first persistence call creates and returns the artifact pair'
);
select is(
  public.persist_assessment_report(
    'e1400000-0000-4000-8000-000000000006', 'd1400000-0000-4000-8000-000000000006',
    'b1400000-0000-4000-8000-000000000001', 'c1400000-0000-4000-8000-000000000001',
    '2026-08-12T10:00:01Z', '1.0.0', 'general', '1.0.0', '2026.1', '1.0.0', '1.0.0',
    repeat('2',64), '{}', repeat('3',64), '{}', '{}', '{}', repeat('4',64), 'manifest-idempotency'
  ),
  jsonb_build_object(
    'report_id', 'e1400000-0000-4000-8000-000000000005'::uuid,
    'assessment_manifest_id', 'd1400000-0000-4000-8000-000000000005'::uuid
  ),
  'idempotent retry returns the original artifact pair'
);
select is(
  (select count(*) from public.reports where practice_id = 'b1400000-0000-4000-8000-000000000001' and client_sync_id = 'manifest-idempotency'),
  1::bigint,
  'idempotent retry creates exactly one report'
);
select is(
  (select count(*) from public.assessment_manifests where id = 'd1400000-0000-4000-8000-000000000005'),
  1::bigint,
  'idempotent retry retains exactly the original manifest'
);
select is(
  (select count(*) from public.assessment_manifests where id = 'd1400000-0000-4000-8000-000000000006'),
  0::bigint,
  'idempotent retry creates no unused manifest'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1400000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"a1400000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select is(
  (select count(*) from public.assessment_manifests where id = 'd1400000-0000-4000-8000-000000000001'),
  1::bigint,
  'owner can read the own-practice manifest'
);
select is(
  (select count(*) from public.assessment_manifests where id = 'd1400000-0000-4000-8000-000000000002'),
  0::bigint,
  'owner cannot read a foreign-practice manifest by exchanged ID'
);
select throws_ok(
  $$insert into public.assessment_manifests (
      practice_id, source_check_id, manifest_version, assessment_profile, facts_version,
      scoring_version, report_format_version, pdf_template_version, snapshot_sha256,
      manifest, manifest_sha256, encrypted_snapshot, created_at
    ) values (
      'b1400000-0000-4000-8000-000000000001', 'c1400000-0000-4000-8000-000000000001',
      '1.0.0', 'general', '1.0.0', '2026.1', '1.0.0', '1.0.0', repeat('a',64), '{}', repeat('b',64), '{}', now()
    )$$,
  '42501',
  null,
  'authenticated cannot insert manifests directly'
);
select throws_ok(
  $$select public.persist_assessment_report(
    'e1400000-0000-4000-8000-000000000007', 'd1400000-0000-4000-8000-000000000007',
    'b1400000-0000-4000-8000-000000000001', 'c1400000-0000-4000-8000-000000000001',
    now(), '1.0.0', 'general', '1.0.0', '2026.1', '1.0.0', '1.0.0',
    repeat('a',64), '{}', repeat('b',64), '{}', '{}', '{}', repeat('c',64), null
  )$$,
  '42501',
  null,
  'authenticated cannot bypass the Worker through the persistence RPC'
);

reset role;
select * from finish();
rollback;
