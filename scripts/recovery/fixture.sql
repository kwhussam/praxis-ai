\set ON_ERROR_STOP on

-- Synthetic-only canaries for SP3-02. The surrounding runner resets the local
-- Supabase database before loading this file and rejects non-fixture tenants.
set search_path = public, extensions;

insert into public.data_processing_agreements (
  id, practice_id, user_id, version, status, accepted_at, metadata
)
values
  (
    'b3200000-0000-4000-8000-0000000000a1',
    '20000000-0000-4000-8000-0000000000a1',
    '00000000-0000-4000-8000-0000000000a1',
    'sp3-02-fixture-v1', 'accepted', '2026-09-16T08:00:00Z', '{"fixture":"sp3-02"}'::jsonb
  ),
  (
    'b3200000-0000-4000-8000-0000000000b1',
    '20000000-0000-4000-8000-0000000000b1',
    '00000000-0000-4000-8000-0000000000b1',
    'sp3-02-fixture-v1', 'accepted', '2026-09-16T08:01:00Z', '{"fixture":"sp3-02"}'::jsonb
  );

insert into public.wlan_scans (
  id, practice_id, network_info, vulnerabilities, encrypted_payload,
  devices_found, risk_level, created_at
)
values
  (
    'b3200000-0000-4000-8000-000000000101',
    '20000000-0000-4000-8000-0000000000a1',
    '{"fixture":"tenant-a","ssid":"RECOVERY-A"}'::jsonb,
    '[{"fixture":"tenant-a"}]'::jsonb, '{}'::jsonb, 1, 'low', '2026-09-16T08:02:00Z'
  ),
  (
    'b3200000-0000-4000-8000-000000000102',
    '20000000-0000-4000-8000-0000000000b1',
    '{"fixture":"tenant-b","ssid":"RECOVERY-B"}'::jsonb,
    '[{"fixture":"tenant-b"}]'::jsonb, '{}'::jsonb, 1, 'high', '2026-09-16T08:03:00Z'
  );

insert into public.inventory_items (
  id, practice_id, type, name, detail, criticality, metadata, created_at, updated_at
)
select
  case suffix when 'a1' then 'b3200000-0000-4000-8000-000000000201'::uuid
              else 'b3200000-0000-4000-8000-000000000202'::uuid end,
  practice_id, 'device', 'SP3-02 synthetic inventory ' || upper(suffix),
  'synthetic-only', 'medium', jsonb_build_object('fixture', 'tenant-' || left(suffix, 1)),
  '2026-09-16T08:04:00Z', '2026-09-16T08:04:00Z'
from (values
  ('a1', '20000000-0000-4000-8000-0000000000a1'::uuid),
  ('b1', '20000000-0000-4000-8000-0000000000b1'::uuid)
) as fixture(suffix, practice_id);

insert into public.inventory_known_devices (
  id, practice_id, mac_address, hostname, device_type, location, owner,
  criticality, last_confirmed_at, metadata, created_at, updated_at
)
values
  ('b3200000-0000-4000-8000-000000000301', '20000000-0000-4000-8000-0000000000a1',
   '02:00:00:00:00:A1', 'recovery-a.invalid', 'workstation', 'fixture', 'fixture', 'medium',
   '2026-09-16T08:05:00Z', '{"fixture":"tenant-a"}', '2026-09-16T08:05:00Z', '2026-09-16T08:05:00Z'),
  ('b3200000-0000-4000-8000-000000000302', '20000000-0000-4000-8000-0000000000b1',
   '02:00:00:00:00:B1', 'recovery-b.invalid', 'workstation', 'fixture', 'fixture', 'high',
   '2026-09-16T08:05:00Z', '{"fixture":"tenant-b"}', '2026-09-16T08:05:00Z', '2026-09-16T08:05:00Z');

insert into public.inventory_access_points (
  id, practice_id, ssid, bssid, location, vendor, channel,
  expected_encryption, metadata, created_at, updated_at
)
values
  ('b3200000-0000-4000-8000-000000000401', '20000000-0000-4000-8000-0000000000a1',
   'RECOVERY-A', '02:00:00:00:10:A1', 'fixture', 'fixture', '1', 'WPA3',
   '{"fixture":"tenant-a"}', '2026-09-16T08:06:00Z', '2026-09-16T08:06:00Z'),
  ('b3200000-0000-4000-8000-000000000402', '20000000-0000-4000-8000-0000000000b1',
   'RECOVERY-B', '02:00:00:00:10:B1', 'fixture', 'fixture', '6', 'WPA2_AES',
   '{"fixture":"tenant-b"}', '2026-09-16T08:06:00Z', '2026-09-16T08:06:00Z');

insert into public.router_wifi_configurations (
  practice_id, wpa2_aes, wpa3, wps, metadata, created_at, updated_at
)
values
  ('20000000-0000-4000-8000-0000000000a1', true, true, false,
   '{"fixture":"tenant-a"}', '2026-09-16T08:07:00Z', '2026-09-16T08:07:00Z'),
  ('20000000-0000-4000-8000-0000000000b1', true, false, true,
   '{"fixture":"tenant-b"}', '2026-09-16T08:07:00Z', '2026-09-16T08:07:00Z');

insert into public.router_firewall_rules (
  id, practice_id, name, source_view, direction, protocol, ports, source,
  destination, action, purpose, owner, enabled, metadata, created_at, updated_at
)
values
  ('b3200000-0000-4000-8000-000000000501', '20000000-0000-4000-8000-0000000000a1',
   'SP3-02 A deny', 'external', 'wan_to_lan', 'any', 'any', 'any', 'any', 'deny',
   'fixture', 'fixture', true, '{"fixture":"tenant-a"}', '2026-09-16T08:08:00Z', '2026-09-16T08:08:00Z'),
  ('b3200000-0000-4000-8000-000000000502', '20000000-0000-4000-8000-0000000000b1',
   'SP3-02 B allow', 'external', 'wan_to_lan', 'tcp', '443', 'any', 'fixture', 'allow',
   'fixture', 'fixture', true, '{"fixture":"tenant-b"}', '2026-09-16T08:08:00Z', '2026-09-16T08:08:00Z');

insert into public.monitoring_targets (
  id, practice_id, target_type, value, enabled, leak_scan_allowed,
  metadata, created_at, updated_at
)
values
  ('b3200000-0000-4000-8000-000000000601', '20000000-0000-4000-8000-0000000000a1',
   'domain', 'recovery-a.example.test', true, false, '{"fixture":"tenant-a"}',
   '2026-09-16T08:09:00Z', '2026-09-16T08:09:00Z'),
  ('b3200000-0000-4000-8000-000000000602', '20000000-0000-4000-8000-0000000000b1',
   'domain', 'recovery-b.example.test', true, false, '{"fixture":"tenant-b"}',
   '2026-09-16T08:09:00Z', '2026-09-16T08:09:00Z');

insert into public.consent_log (
  id, practice_id, user_id, type, version, accepted, accepted_at,
  scope, withdrawn_at, created_at
)
values
  ('b3200000-0000-4000-8000-000000000701', '20000000-0000-4000-8000-0000000000a1',
   '00000000-0000-4000-8000-0000000000a1', 'wlan_scan', 'sp3-02-v1', true,
   '2026-09-16T08:10:00Z', '{"fixture":"event-1"}', null, '2026-09-16T08:10:00Z'),
  ('b3200000-0000-4000-8000-000000000702', '20000000-0000-4000-8000-0000000000a1',
   '00000000-0000-4000-8000-0000000000a1', 'wlan_scan', 'sp3-02-v2', true,
   '2026-09-16T08:11:00Z', '{"fixture":"event-2"}', null, '2026-09-16T08:11:00Z'),
  ('b3200000-0000-4000-8000-000000000703', '20000000-0000-4000-8000-0000000000a1',
   '00000000-0000-4000-8000-0000000000a1', 'wlan_scan', 'sp3-02-v2', false,
   '2026-09-16T08:12:00Z', '{"fixture":"event-3"}', '2026-09-16T08:12:00Z',
   '2026-09-16T08:12:00Z');

-- The deletion is deliberately performed before the backup. P-06 then proves
-- whether restore preserves the completed deletion state. At the current
-- baseline this exposes known gap G-01 for the six inventory/router tables.
select public.complete_privacy_deletion(
  '20000000-0000-4000-8000-0000000000b1',
  '00000000-0000-4000-8000-0000000000b1'
);
