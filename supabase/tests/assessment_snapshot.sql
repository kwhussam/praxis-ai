-- SP3-03: authoritative assessment snapshots are atomic, immutable and tenant-bound.
create schema if not exists extensions;
create extension if not exists pgtap with schema extensions;

begin;
set local search_path = public, extensions;
select plan(34);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data
)
values
  ('a3300000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'snapshot-a@example.test', 'x', now(), now(), now(), '{}', '{}'),
  ('a3300000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'snapshot-b@example.test', 'x', now(), now(), now(), '{}', '{}')
on conflict (id) do nothing;

insert into public.practices (id, owner_id, name)
values
  ('b3300000-0000-4000-8000-000000000001', 'a3300000-0000-4000-8000-000000000001', 'Snapshot Praxis A'),
  ('b3300000-0000-4000-8000-000000000002', 'a3300000-0000-4000-8000-000000000002', 'Snapshot Praxis B')
on conflict (id) do nothing;

insert into public.practice_memberships (practice_id, user_id, role, status, granted_by)
values
  ('b3300000-0000-4000-8000-000000000001', 'a3300000-0000-4000-8000-000000000001', 'practice_owner', 'active', 'a3300000-0000-4000-8000-000000000001'),
  ('b3300000-0000-4000-8000-000000000002', 'a3300000-0000-4000-8000-000000000002', 'practice_owner', 'active', 'a3300000-0000-4000-8000-000000000002')
on conflict (practice_id, user_id) where status = 'active' do nothing;

create temporary table snapshot_fixture (name text primary key, payload jsonb not null);

insert into snapshot_fixture values (
  'a',
  jsonb_build_object(
    'schema_version', '1.0.0',
    'snapshot_id', 'c3300000-0000-4000-8000-000000000001',
    'practice_id', 'b3300000-0000-4000-8000-000000000001',
    'captured_at', '2026-09-18T09:00:00.000Z',
    'assessment_profile', 'health',
    'versions', jsonb_build_object(
      'facts', '1.0.0', 'scoring', '2.2.1', 'control_catalog', '2026.09',
      'policy_pack', 'de-health-2026.09', 'engine', 'assessment-engine-1.0.0'
    ),
    'posture', jsonb_build_object('ampel', 'gelb', 'gating_reason_codes', jsonb_build_array('coverage.insufficient')),
    'evidence', jsonb_build_object(
      'coverage_score', 50, 'confidence_score', 42, 'freshness', 'unknown', 'review_status', 'review_required'
    ),
    'technical_scores', jsonb_build_object(
      'overall', 80,
      'by_category', jsonb_build_object(
        'access_control', 80, 'backup', 80, 'email_security', 80,
        'network', 80, 'dsgvo', 80, 'updates', 80
      )
    ),
    'components', jsonb_build_array(jsonb_build_object(
      'id', 'd3300000-0000-4000-8000-000000000001',
      'kind', 'wlan',
      'source_id', 'wlan-scan:c3300000-0000-4000-8000-000000000101',
      'source_version', 'ios-probe-1.0.0',
      'collection_status', 'unsupported',
      'freshness', 'unknown',
      'observed_at', '2026-09-18T08:59:00.000Z',
      'expires_at', null,
      'payload_sha256', repeat('1', 64),
      'control_ids', jsonb_build_array('NETWORK_SECURITY_PROBES')
    )),
    'controls', jsonb_build_array(jsonb_build_object(
      'rule_id', 'NETWORK_SECURITY_PROBES', 'category', 'network',
      'applicability', 'applicable', 'status', 'unknown', 'collection_status', 'unsupported',
      'points_earned', 0, 'points_max', 5
    )),
    'score_explanations', jsonb_build_array(jsonb_build_object(
      'code', 'coverage.insufficient', 'severity', 'warning', 'effect', 'blocks_green',
      'category', 'network', 'control_ids', jsonb_build_array('NETWORK_SECURITY_PROBES'),
      'points_delta', null
    )),
    'integrity', jsonb_build_object(
      'payload_sha256', repeat('a', 64), 'authenticity', 'hash_only', 'signature', null
    )
  )
);

select is((select relrowsecurity from pg_class where oid = 'public.assessment_snapshots'::regclass), true, 'snapshots enable RLS');
select is((select relforcerowsecurity from pg_class where oid = 'public.assessment_snapshots'::regclass), true, 'snapshots force RLS');
select is((select relrowsecurity from pg_class where oid = 'public.assessment_snapshot_components'::regclass), true, 'components enable RLS');
select is((select relforcerowsecurity from pg_class where oid = 'public.assessment_snapshot_components'::regclass), true, 'components force RLS');
select is((select relrowsecurity from pg_class where oid = 'public.assessment_snapshot_score_explanations'::regclass), true, 'explanations enable RLS');
select is((select relforcerowsecurity from pg_class where oid = 'public.assessment_snapshot_score_explanations'::regclass), true, 'explanations force RLS');

select ok(not has_table_privilege('authenticated', 'public.assessment_snapshots', 'INSERT'), 'authenticated cannot insert snapshots');
select ok(
  not has_column_privilege('authenticated', 'public.assessment_snapshots', 'encrypted_payload', 'SELECT'),
  'authenticated cannot download encrypted snapshot payloads directly'
);
select ok(not has_table_privilege('service_role', 'public.assessment_snapshots', 'INSERT'), 'service role cannot bypass the RPC for snapshots');
select ok(not has_table_privilege('service_role', 'public.assessment_snapshot_components', 'INSERT'), 'service role cannot insert components directly');
select ok(not has_table_privilege('service_role', 'public.assessment_snapshot_score_explanations', 'INSERT'), 'service role cannot insert explanations directly');
select ok(
  not has_function_privilege('authenticated', 'public.persist_assessment_snapshot(jsonb,jsonb,text)', 'EXECUTE'),
  'authenticated cannot execute snapshot persistence'
);
select ok(
  has_function_privilege('service_role', 'public.persist_assessment_snapshot(jsonb,jsonb,text)', 'EXECUTE'),
  'service role can execute snapshot persistence'
);
select ok(
  (select 'search_path=""' = any(proconfig) from pg_proc where oid = 'public.persist_assessment_snapshot(jsonb,jsonb,text)'::regprocedure),
  'persistence RPC has an empty search path'
);

select throws_ok(
  $$select public.persist_assessment_snapshot(
      (select payload || '{"future_field":true}'::jsonb from snapshot_fixture where name = 'a'),
      '{"envelope_version":"2","alg":"AES-256-GCM","key_version":"fixture","iv":"AA","ciphertext":"AA","aad_sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}',
      'snapshot-invalid-extra-field'
    )$$,
  '22023',
  'assessment_snapshot_invalid_contract',
  'database RPC rejects contract fields without a schema-version bump'
);

select is(
  public.persist_assessment_snapshot(
    (select payload from snapshot_fixture where name = 'a'),
    '{"envelope_version":"2","alg":"AES-256-GCM","key_version":"fixture","iv":"AA","ciphertext":"AA","aad_sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}',
    'snapshot-fixture-a'
  ),
  jsonb_build_object(
    'snapshot_id', 'c3300000-0000-4000-8000-000000000001'::uuid,
    'payload_sha256', repeat('a', 64)
  ),
  'RPC atomically persists a valid snapshot'
);
select is((select count(*) from public.assessment_snapshots where id = 'c3300000-0000-4000-8000-000000000001'), 1::bigint, 'one snapshot is persisted');
select is((select count(*) from public.assessment_snapshot_components where snapshot_id = 'c3300000-0000-4000-8000-000000000001'), 1::bigint, 'component is persisted');
select is((select count(*) from public.assessment_snapshot_score_explanations where snapshot_id = 'c3300000-0000-4000-8000-000000000001'), 1::bigint, 'score explanation is persisted');

select is(
  public.persist_assessment_snapshot(
    (select payload from snapshot_fixture where name = 'a'),
    '{"envelope_version":"2","alg":"AES-256-GCM","key_version":"fixture","iv":"AA","ciphertext":"AA","aad_sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}',
    'snapshot-fixture-a'
  ) ->> 'snapshot_id',
  'c3300000-0000-4000-8000-000000000001',
  'same idempotency key and hash returns the original snapshot'
);
select is((select count(*) from public.assessment_snapshots where idempotency_key = 'snapshot-fixture-a'), 1::bigint, 'idempotent retry creates no duplicate');
select throws_ok(
  $$select public.persist_assessment_snapshot(
      jsonb_set((select payload from snapshot_fixture where name = 'a'), '{integrity,payload_sha256}', to_jsonb(repeat('b',64))),
      '{"envelope_version":"2","alg":"AES-256-GCM","key_version":"fixture","iv":"AA","ciphertext":"AA","aad_sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}',
      'snapshot-fixture-a'
    )$$,
  '23505',
  'assessment_snapshot_idempotency_conflict',
  'same idempotency key with a different hash fails closed'
);

select throws_ok(
  $$update public.assessment_snapshots set posture = 'rot' where id = 'c3300000-0000-4000-8000-000000000001'$$,
  '42501', 'assessment snapshots are immutable', 'snapshot rows cannot be updated'
);
select throws_ok(
  $$update public.assessment_snapshot_components set kind = 'router' where id = 'd3300000-0000-4000-8000-000000000001'$$,
  '42501', 'assessment snapshots are immutable', 'component rows cannot be updated'
);
select throws_ok(
  $$update public.assessment_snapshot_score_explanations set severity = 'critical' where snapshot_id = 'c3300000-0000-4000-8000-000000000001'$$,
  '42501', 'assessment snapshots are immutable', 'explanation rows cannot be updated'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a3300000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"a3300000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select is((select count(*) from public.assessment_snapshots where id = 'c3300000-0000-4000-8000-000000000001'), 1::bigint, 'practice A reads its snapshot');
select is((select count(*) from public.assessment_snapshot_components where snapshot_id = 'c3300000-0000-4000-8000-000000000001'), 1::bigint, 'practice A reads its component');
select is((select count(*) from public.assessment_snapshot_score_explanations where snapshot_id = 'c3300000-0000-4000-8000-000000000001'), 1::bigint, 'practice A reads its explanation');

reset role;
update snapshot_fixture
set payload = jsonb_set(
  jsonb_set(
    jsonb_set(payload, '{snapshot_id}', '"c3300000-0000-4000-8000-000000000002"'),
    '{practice_id}', '"b3300000-0000-4000-8000-000000000002"'
  ),
  '{components,0,id}', '"d3300000-0000-4000-8000-000000000002"'
)
where name = 'a';
select public.persist_assessment_snapshot(
  (select payload from snapshot_fixture where name = 'a'),
  '{"envelope_version":"2","alg":"AES-256-GCM","key_version":"fixture","iv":"AA","ciphertext":"AA","aad_sha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}',
  'snapshot-fixture-b'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a3300000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"a3300000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is((select count(*) from public.assessment_snapshots where id = 'c3300000-0000-4000-8000-000000000002'), 0::bigint, 'practice A cannot read practice B snapshot');
select is((select count(*) from public.assessment_snapshot_components where snapshot_id = 'c3300000-0000-4000-8000-000000000002'), 0::bigint, 'practice A cannot read practice B component');
select is((select count(*) from public.assessment_snapshot_score_explanations where snapshot_id = 'c3300000-0000-4000-8000-000000000002'), 0::bigint, 'practice A cannot read practice B explanation');
select throws_ok(
  $$select public.persist_assessment_snapshot(
      (select payload from snapshot_fixture where name = 'a'),
      '{"envelope_version":"2","alg":"AES-256-GCM","key_version":"fixture","iv":"AA","ciphertext":"AA","aad_sha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}',
      'authenticated-bypass'
    )$$,
  '42501', null, 'authenticated cannot bypass persistence through the RPC'
);

reset role;
select lives_ok(
  $$select public.complete_privacy_deletion(
      'b3300000-0000-4000-8000-000000000002',
      'a3300000-0000-4000-8000-000000000002'
    )$$,
  'privacy deletion accepts a practice containing snapshots'
);
select is((select count(*) from public.assessment_snapshots where practice_id = 'b3300000-0000-4000-8000-000000000002'), 0::bigint, 'privacy deletion removes snapshots and child rows');

select * from finish();
rollback;
