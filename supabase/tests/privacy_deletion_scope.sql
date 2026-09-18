-- SP3-02 / G-01: prove that privacy deletion removes every D2 inventory,
-- router and monitoring-target row for exactly one tenant while preserving
-- the explicitly retained legal records.
create schema if not exists extensions;
create extension if not exists pgtap with schema extensions;

begin;
set local search_path = public, extensions;
select plan(24);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data
)
values
  ('a1700000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'deletion-a@example.test', 'x', now(), now(), now(), '{}', '{}'),
  ('a1700000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'deletion-b@example.test', 'x', now(), now(), now(), '{}', '{}');

insert into public.practices (id, owner_id, name, domain, email)
values
  ('b1700000-0000-4000-8000-000000000001', 'a1700000-0000-4000-8000-000000000001', 'Deletion Praxis A', 'a.example.test', 'a@example.test'),
  ('b1700000-0000-4000-8000-000000000002', 'a1700000-0000-4000-8000-000000000002', 'Deletion Praxis B', 'b.example.test', 'b@example.test');

insert into public.inventory_items (practice_id, type, name, criticality)
values
  ('b1700000-0000-4000-8000-000000000001', 'device', 'A device', 'medium'),
  ('b1700000-0000-4000-8000-000000000002', 'device', 'B device', 'medium');

insert into public.inventory_known_devices (
  practice_id, mac_address, hostname, device_type, criticality, last_confirmed_at
)
values
  ('b1700000-0000-4000-8000-000000000001', '02:00:00:00:17:A1', 'a.invalid', 'workstation', 'medium', now()),
  ('b1700000-0000-4000-8000-000000000002', '02:00:00:00:17:B1', 'b.invalid', 'workstation', 'medium', now());

insert into public.inventory_access_points (
  practice_id, ssid, bssid, expected_encryption
)
values
  ('b1700000-0000-4000-8000-000000000001', 'A-NET', '02:00:00:17:00:A1', 'WPA3'),
  ('b1700000-0000-4000-8000-000000000002', 'B-NET', '02:00:00:17:00:B1', 'WPA3');

insert into public.router_wifi_configurations (practice_id, wpa2_aes, wpa3, wps)
values
  ('b1700000-0000-4000-8000-000000000001', true, true, false),
  ('b1700000-0000-4000-8000-000000000002', true, true, false);

insert into public.router_firewall_rules (
  practice_id, name, source_view, direction, protocol, action
)
values
  ('b1700000-0000-4000-8000-000000000001', 'A rule', 'external', 'wan_to_lan', 'any', 'deny'),
  ('b1700000-0000-4000-8000-000000000002', 'B rule', 'external', 'wan_to_lan', 'any', 'deny');

insert into public.monitoring_targets (practice_id, target_type, value)
values
  ('b1700000-0000-4000-8000-000000000001', 'domain', 'a.example.test'),
  ('b1700000-0000-4000-8000-000000000002', 'domain', 'b.example.test');

insert into public.practice_access_audit (practice_id, user_id, action, resource)
values (
  'b1700000-0000-4000-8000-000000000002',
  'a1700000-0000-4000-8000-000000000002',
  'deletion-fixture',
  'privacy-data'
);

insert into public.consent_log (
  practice_id, user_id, type, version, accepted, accepted_at, scope
)
values (
  'b1700000-0000-4000-8000-000000000002',
  'a1700000-0000-4000-8000-000000000002',
  'privacy_policy',
  'g01-test-v1',
  true,
  now(),
  '{"fixture":"g01"}'::jsonb
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.complete_privacy_deletion(uuid,uuid)',
    'EXECUTE'
  ),
  'authenticated cannot execute the deletion RPC'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.complete_privacy_deletion(uuid,uuid)',
    'EXECUTE'
  ),
  'service_role can execute the deletion RPC'
);
select ok(
  (select 'search_path=public' = any(proconfig)
   from pg_proc
   where oid = 'public.complete_privacy_deletion(uuid,uuid)'::regprocedure),
  'deletion RPC fixes its search_path'
);

set local role service_role;
select lives_ok(
  $$select public.complete_privacy_deletion(
      'b1700000-0000-4000-8000-000000000002',
      'a1700000-0000-4000-8000-000000000002'
    )$$,
  'service_role can atomically delete the target practice'
);
reset role;

select is((select count(*) from public.inventory_items where practice_id = 'b1700000-0000-4000-8000-000000000002'), 0::bigint, 'target inventory items are deleted');
select is((select count(*) from public.inventory_known_devices where practice_id = 'b1700000-0000-4000-8000-000000000002'), 0::bigint, 'target known devices are deleted');
select is((select count(*) from public.inventory_access_points where practice_id = 'b1700000-0000-4000-8000-000000000002'), 0::bigint, 'target access points are deleted');
select is((select count(*) from public.router_wifi_configurations where practice_id = 'b1700000-0000-4000-8000-000000000002'), 0::bigint, 'target router Wi-Fi configuration is deleted');
select is((select count(*) from public.router_firewall_rules where practice_id = 'b1700000-0000-4000-8000-000000000002'), 0::bigint, 'target firewall rules are deleted');
select is((select count(*) from public.monitoring_targets where practice_id = 'b1700000-0000-4000-8000-000000000002'), 0::bigint, 'target monitoring targets are deleted');

select is((select count(*) from public.inventory_items where practice_id = 'b1700000-0000-4000-8000-000000000001'), 1::bigint, 'other-tenant inventory items remain');
select is((select count(*) from public.inventory_known_devices where practice_id = 'b1700000-0000-4000-8000-000000000001'), 1::bigint, 'other-tenant known devices remain');
select is((select count(*) from public.inventory_access_points where practice_id = 'b1700000-0000-4000-8000-000000000001'), 1::bigint, 'other-tenant access points remain');
select is((select count(*) from public.router_wifi_configurations where practice_id = 'b1700000-0000-4000-8000-000000000001'), 1::bigint, 'other-tenant router Wi-Fi configuration remains');
select is((select count(*) from public.router_firewall_rules where practice_id = 'b1700000-0000-4000-8000-000000000001'), 1::bigint, 'other-tenant firewall rules remain');
select is((select count(*) from public.monitoring_targets where practice_id = 'b1700000-0000-4000-8000-000000000001'), 1::bigint, 'other-tenant monitoring targets remain');

select is((select count(*) from public.practice_access_audit where practice_id = 'b1700000-0000-4000-8000-000000000002'), 1::bigint, 'practice access audit is retained');
select is((select count(*) from public.consent_log where practice_id = 'b1700000-0000-4000-8000-000000000002'), 1::bigint, 'consent log is retained');
select is((select count(*) from public.data_processing_agreements where practice_id = 'b1700000-0000-4000-8000-000000000002'), 1::bigint, 'data processing agreement is retained');
select is((select count(*) from public.deletion_requests where practice_id = 'b1700000-0000-4000-8000-000000000002' and status = 'completed' and state = 'completed'), 1::bigint, 'completed deletion receipt is retained');

select ok(
  (select deleted_at is not null and name = '[GELOESCHT]' and domain is null and email is null
   from public.practices
   where id = 'b1700000-0000-4000-8000-000000000002'),
  'target practice is anonymized'
);
select ok(
  (select report -> 'immediate_deletions' @> '["inventory_items","inventory_known_devices","inventory_access_points","router_wifi_configurations","router_firewall_rules","monitoring_targets"]'::jsonb
   from public.deletion_requests
   where practice_id = 'b1700000-0000-4000-8000-000000000002'
   order by requested_at desc
   limit 1),
  'deletion receipt lists every removed D2 collection'
);

set local role service_role;
select lives_ok(
  $$select public.complete_privacy_deletion(
      'b1700000-0000-4000-8000-000000000002',
      'a1700000-0000-4000-8000-000000000002'
    )$$,
  'repeated deletion is idempotent for already removed D2 data'
);
reset role;

select is(
  (select count(*) from (
    select practice_id from public.inventory_items
    union all select practice_id from public.inventory_known_devices
    union all select practice_id from public.inventory_access_points
    union all select practice_id from public.router_wifi_configurations
    union all select practice_id from public.router_firewall_rules
    union all select practice_id from public.monitoring_targets
  ) remaining where practice_id = 'b1700000-0000-4000-8000-000000000002'),
  0::bigint,
  'repeated deletion cannot recreate target D2 data'
);

select * from finish();
rollback;
