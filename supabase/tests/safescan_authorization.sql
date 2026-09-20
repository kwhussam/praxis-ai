-- SP3-04: SafeScan authorization is tenant-bound, immutable and fail-closed.
create schema if not exists extensions;
create extension if not exists pgtap with schema extensions;

begin;
set local search_path = public, extensions;
select plan(48);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data
)
values
  ('a4400000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'scan-a@example.test', 'x', now(), now(), now(), '{}', '{}'),
  ('a4400000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'scan-b@example.test', 'x', now(), now(), now(), '{}', '{}')
on conflict (id) do nothing;

insert into public.practices (id, owner_id, name)
values
  ('b4400000-0000-4000-8000-000000000001', 'a4400000-0000-4000-8000-000000000001', 'SafeScan Praxis A'),
  ('b4400000-0000-4000-8000-000000000002', 'a4400000-0000-4000-8000-000000000002', 'SafeScan Praxis B')
on conflict (id) do nothing;

insert into public.practice_memberships (practice_id, user_id, role, status, granted_by)
values
  ('b4400000-0000-4000-8000-000000000001', 'a4400000-0000-4000-8000-000000000001', 'practice_owner', 'active', 'a4400000-0000-4000-8000-000000000001'),
  ('b4400000-0000-4000-8000-000000000002', 'a4400000-0000-4000-8000-000000000002', 'practice_owner', 'active', 'a4400000-0000-4000-8000-000000000002')
on conflict (practice_id, user_id) where status = 'active' do nothing;

create temporary table safescan_fixture (name text primary key, payload jsonb not null);
insert into safescan_fixture values (
  'a',
  jsonb_build_object(
    'schema_version', '1.0.0',
    'authorization_id', 'd4400000-0000-4000-8000-000000000001',
    'practice_id', 'b4400000-0000-4000-8000-000000000001',
    'site_ref', 'site-berlin-01',
    'policy_version', 'de-health-safescan-1.0.0',
    'actor', jsonb_build_object(
      'user_id', 'a4400000-0000-4000-8000-000000000001',
      'role', 'practice_owner',
      'authorized_at', now() - interval '10 minutes'
    ),
    'valid_from', now() - interval '5 minutes',
    'valid_until', now() + interval '1 day',
    'max_safety_class', 2,
    'maintenance_windows', jsonb_build_array(jsonb_build_object(
      'id', 'mw-01', 'starts_at', now() - interval '1 minute', 'ends_at', now() + interval '1 hour'
    )),
    'scope', jsonb_build_object(
      'targets', jsonb_build_array(
        jsonb_build_object(
          'id', 'office-lan', 'kind', 'cidr', 'locator', '192.0.2.0/24',
          'asset_class', 'standard', 'max_safety_class', 2, 'elevated_approval', null
        ),
        jsonb_build_object(
          'id', 'medical-001', 'kind', 'asset', 'locator', 'inventory:medical-001',
          'asset_class', 'medical_device', 'max_safety_class', 1, 'elevated_approval', null
        )
      ),
      'exclusions', jsonb_build_array(jsonb_build_object('target_id', 'medical-001', 'reason_code', 'owner_excluded'))
    ),
    'stop_conditions', jsonb_build_array(
      'kill_switch', 'clinical_impact_reported', 'connectivity_degradation',
      'unexpected_medical_device', 'error_threshold_exceeded', 'authorization_changed'
    ),
    'integrity', jsonb_build_object('scope_sha256', repeat('a', 64))
  )
);

select is((select relrowsecurity from pg_class where oid = 'public.scan_authorizations'::regclass), true, 'authorization RLS enabled');
select is((select relforcerowsecurity from pg_class where oid = 'public.scan_authorizations'::regclass), true, 'authorization RLS forced');
select is((select relrowsecurity from pg_class where oid = 'public.scan_authorization_events'::regclass), true, 'authorization event RLS enabled');
select is((select relforcerowsecurity from pg_class where oid = 'public.scan_authorization_events'::regclass), true, 'authorization event RLS forced');
select is((select relrowsecurity from pg_class where oid = 'public.scan_kill_switch_events'::regclass), true, 'kill-switch RLS enabled');
select is((select relforcerowsecurity from pg_class where oid = 'public.scan_kill_switch_events'::regclass), true, 'kill-switch RLS forced');

select ok(not has_table_privilege('authenticated', 'public.scan_authorizations', 'INSERT'), 'authenticated cannot insert authorizations');
select ok(not has_column_privilege('authenticated', 'public.scan_authorizations', 'encrypted_scope', 'SELECT'), 'authenticated cannot read encrypted scope');
select ok(not has_table_privilege('authenticated', 'public.scan_authorization_events', 'INSERT'), 'authenticated cannot insert lifecycle events');
select ok(not has_table_privilege('authenticated', 'public.scan_kill_switch_events', 'INSERT'), 'authenticated cannot change kill switch directly');
select ok(not has_table_privilege('service_role', 'public.scan_authorizations', 'INSERT'), 'service role cannot bypass persistence RPC');

select ok(not has_function_privilege('authenticated', 'public.persist_scan_authorization(jsonb,jsonb,text)', 'EXECUTE'), 'authenticated cannot persist authorization');
select ok(not has_function_privilege('authenticated', 'public.revoke_scan_authorization(uuid,uuid,uuid,text)', 'EXECUTE'), 'authenticated cannot invoke revoke RPC');
select ok(not has_function_privilege('authenticated', 'public.set_scan_kill_switch(uuid,uuid,boolean,text)', 'EXECUTE'), 'authenticated cannot invoke kill-switch RPC');
select ok(not has_function_privilege('authenticated', 'public.check_scan_authorization_lifecycle(uuid,uuid,text,smallint)', 'EXECUTE'), 'authenticated cannot invoke lifecycle RPC');
select ok(has_function_privilege('service_role', 'public.persist_scan_authorization(jsonb,jsonb,text)', 'EXECUTE'), 'service role can invoke persistence RPC');
select ok(has_function_privilege('service_role', 'public.revoke_scan_authorization(uuid,uuid,uuid,text)', 'EXECUTE'), 'service role can invoke revoke RPC');
select ok(has_function_privilege('service_role', 'public.set_scan_kill_switch(uuid,uuid,boolean,text)', 'EXECUTE'), 'service role can invoke kill-switch RPC');
select ok(has_function_privilege('service_role', 'public.check_scan_authorization_lifecycle(uuid,uuid,text,smallint)', 'EXECUTE'), 'service role can invoke lifecycle RPC');
select ok((select 'search_path=""' = any(proconfig) from pg_proc where oid = 'public.persist_scan_authorization(jsonb,jsonb,text)'::regprocedure), 'persistence RPC has empty search path');
select ok((select 'search_path=""' = any(proconfig) from pg_proc where oid = 'public.revoke_scan_authorization(uuid,uuid,uuid,text)'::regprocedure), 'revoke RPC has empty search path');
select ok((select 'search_path=""' = any(proconfig) from pg_proc where oid = 'public.set_scan_kill_switch(uuid,uuid,boolean,text)'::regprocedure), 'kill-switch RPC has empty search path');
select ok((select 'search_path=""' = any(proconfig) from pg_proc where oid = 'public.check_scan_authorization_lifecycle(uuid,uuid,text,smallint)'::regprocedure), 'lifecycle RPC has empty search path');

select throws_ok(
  $$select public.persist_scan_authorization(
    (select payload || '{"future":true}'::jsonb from safescan_fixture where name='a'),
    jsonb_build_object('envelope_version','2','alg','AES-256-GCM','key_version','fixture','iv','AA','ciphertext','AA','aad_sha256',repeat('a',64)),
    'invalid-extra-field'
  )$$,'22023','scan_authorization_invalid_contract','unknown contract fields fail closed'
);
select throws_ok(
  $$select public.persist_scan_authorization(
    jsonb_set((select payload from safescan_fixture where name='a'),'{max_safety_class}','3'),
    jsonb_build_object('envelope_version','2','alg','AES-256-GCM','key_version','fixture','iv','AA','ciphertext','AA','aad_sha256',repeat('a',64)),
    'invalid-s3'
  )$$,'22023','scan_authorization_invalid_contract','S3 cannot be granted'
);
select throws_ok(
  $$select public.persist_scan_authorization(
    jsonb_set((select payload from safescan_fixture where name='a'),'{scope,targets,1,max_safety_class}','2'),
    jsonb_build_object('envelope_version','2','alg','AES-256-GCM','key_version','fixture','iv','AA','ciphertext','AA','aad_sha256',repeat('a',64)),
    'invalid-medical-s2'
  )$$,'22023','scan_authorization_invalid_target','medical S2 without elevated approval fails closed'
);
select throws_ok(
  $$select public.persist_scan_authorization(
    jsonb_set(
      jsonb_set((select payload from safescan_fixture where name='a'),'{scope,targets,1,max_safety_class}','2'),
      '{scope,targets,1,elevated_approval}',
      jsonb_build_object(
        'approved_by_user_id','a4400000-0000-4000-8000-000000000002',
        'approved_at',now() - interval '10 minutes','expires_at',now() + interval '1 hour',
        'reason_code','foreign_owner','clinical_owner_approved',true
      )
    ),
    jsonb_build_object('envelope_version','2','alg','AES-256-GCM','key_version','fixture','iv','AA','ciphertext','AA','aad_sha256',repeat('a',64)),
    'invalid-foreign-medical-approval'
  )$$,'22023','scan_authorization_invalid_target','sensitive target approval must come from an active owner of the same practice'
);
select throws_ok(
  $$select public.persist_scan_authorization(
    jsonb_set((select payload from safescan_fixture where name='a'),'{actor,user_id}','"a4400000-0000-4000-8000-000000000002"'),
    jsonb_build_object('envelope_version','2','alg','AES-256-GCM','key_version','fixture','iv','AA','ciphertext','AA','aad_sha256',repeat('a',64)),
    'cross-tenant-actor'
  )$$,'42501','scan_authorization_actor_forbidden','cross-tenant actor cannot grant authorization'
);

select is(
  public.persist_scan_authorization(
    (select payload from safescan_fixture where name = 'a'),
    jsonb_build_object('envelope_version','2','alg','AES-256-GCM','key_version','fixture','iv','AA','ciphertext','AA','aad_sha256',repeat('a',64)),
    'safescan-a'
  ),
  jsonb_build_object('authorization_id','d4400000-0000-4000-8000-000000000001'::uuid,'scope_sha256',repeat('a',64)),
  'valid authorization persists atomically'
);
select is((select count(*) from public.scan_authorizations where id = 'd4400000-0000-4000-8000-000000000001'), 1::bigint, 'one authorization row exists');
select is((select count(*) from public.scan_authorization_events where authorization_id = 'd4400000-0000-4000-8000-000000000001' and event_type = 'granted'), 1::bigint, 'grant event exists');
select is(
  public.persist_scan_authorization(
    (select payload from safescan_fixture where name = 'a'),
    jsonb_build_object('envelope_version','2','alg','AES-256-GCM','key_version','fixture','iv','AA','ciphertext','AA','aad_sha256',repeat('a',64)),
    'safescan-a'
  ) ->> 'authorization_id',
  'd4400000-0000-4000-8000-000000000001',
  'idempotent retry returns the original authorization'
);

select is(
  public.check_scan_authorization_lifecycle(
    'd4400000-0000-4000-8000-000000000001','b4400000-0000-4000-8000-000000000001',
    'de-health-safescan-1.0.0',2::smallint
  ) ->> 'allowed', 'true', 'valid lifecycle allows bounded S2 preflight'
);
select is(
  public.check_scan_authorization_lifecycle(
    'd4400000-0000-4000-8000-000000000001','b4400000-0000-4000-8000-000000000001',
    'de-health-safescan-1.0.0',3::smallint
  ) ->> 'reason_code', 'safety_class_prohibited', 'S3 fails closed'
);
select is(
  public.check_scan_authorization_lifecycle(
    'd4400000-0000-4000-8000-000000000001','b4400000-0000-4000-8000-000000000002',
    'de-health-safescan-1.0.0',1::smallint
  ) ->> 'reason_code', 'authorization_not_found', 'cross-tenant practice binding fails closed'
);

select is(public.set_scan_kill_switch(
  'b4400000-0000-4000-8000-000000000001','a4400000-0000-4000-8000-000000000001',true,'operator_stop'
) ->> 'enabled', 'true', 'manager can activate kill switch through RPC');
select is(public.check_scan_authorization_lifecycle(
  'd4400000-0000-4000-8000-000000000001','b4400000-0000-4000-8000-000000000001',
  'de-health-safescan-1.0.0',1::smallint
) ->> 'reason_code', 'kill_switch_active', 'active kill switch blocks lifecycle');
select is(public.set_scan_kill_switch(
  'b4400000-0000-4000-8000-000000000001','a4400000-0000-4000-8000-000000000001',false,'operator_release'
) ->> 'enabled', 'false', 'manager can release kill switch through RPC');
select is(public.check_scan_authorization_lifecycle(
  'd4400000-0000-4000-8000-000000000001','b4400000-0000-4000-8000-000000000001',
  'de-health-safescan-1.0.0',1::smallint
) ->> 'allowed', 'true', 'release restores only a still-valid authorization');

select is(public.revoke_scan_authorization(
  'd4400000-0000-4000-8000-000000000001','b4400000-0000-4000-8000-000000000001',
  'a4400000-0000-4000-8000-000000000001','owner_revoked'
) ->> 'state', 'revoked', 'manager can revoke through RPC');
select is(public.check_scan_authorization_lifecycle(
  'd4400000-0000-4000-8000-000000000001','b4400000-0000-4000-8000-000000000001',
  'de-health-safescan-1.0.0',1::smallint
) ->> 'reason_code', 'authorization_revoked', 'revocation remains fail-closed after kill-switch release');

select throws_ok($$update public.scan_authorizations set site_ref='changed' where id='d4400000-0000-4000-8000-000000000001'$$,
  '42501','SafeScan authorization evidence is immutable','authorization metadata is immutable');
select throws_ok($$update public.scan_authorization_events set reason_code='changed' where authorization_id='d4400000-0000-4000-8000-000000000001'$$,
  '42501','SafeScan authorization evidence is immutable','authorization events are immutable');
select throws_ok($$update public.scan_kill_switch_events set reason_code='changed' where practice_id='b4400000-0000-4000-8000-000000000001'$$,
  '42501','SafeScan authorization evidence is immutable','kill-switch events are immutable');

update safescan_fixture set payload = jsonb_set(
  jsonb_set(jsonb_set(jsonb_set(payload,
    '{authorization_id}','"d4400000-0000-4000-8000-000000000002"'),
    '{practice_id}','"b4400000-0000-4000-8000-000000000002"'),
    '{actor,user_id}','"a4400000-0000-4000-8000-000000000002"'),
    '{integrity,scope_sha256}',to_jsonb(repeat('b',64))
) where name='a';
select public.persist_scan_authorization(
  (select payload from safescan_fixture where name='a'),
  jsonb_build_object('envelope_version','2','alg','AES-256-GCM','key_version','fixture','iv','AA','ciphertext','AA','aad_sha256',repeat('b',64)),
  'safescan-b'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','a4400000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"a4400000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((select count(*) from public.scan_authorizations where practice_id='b4400000-0000-4000-8000-000000000001'),1::bigint,'practice A manager reads its metadata');
select is((select count(*) from public.scan_authorizations where practice_id='b4400000-0000-4000-8000-000000000002'),0::bigint,'practice A cannot read practice B metadata');
reset role;

select lives_ok($$select public.complete_privacy_deletion(
  'b4400000-0000-4000-8000-000000000002','a4400000-0000-4000-8000-000000000002'
)$$,'privacy deletion accepts SafeScan authorization data');
select is((select count(*) from public.scan_authorizations where practice_id='b4400000-0000-4000-8000-000000000002'),0::bigint,'privacy deletion removes authorization, events and ciphertext');

select * from finish();
rollback;
