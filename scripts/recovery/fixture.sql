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

-- SP3-03 canaries prove that the authoritative snapshot, its ordered component
-- and score explanation survive backup/restore for A and are erased for B.
select public.persist_assessment_snapshot(
  jsonb_build_object(
    'schema_version', '1.0.0',
    'snapshot_id', snapshot_id,
    'practice_id', practice_id,
    'captured_at', '2026-09-16T08:09:30Z',
    'assessment_profile', 'health',
    'versions', jsonb_build_object(
      'facts', '1.0.0', 'scoring', '2.2.1', 'control_catalog', '2026.09',
      'policy_pack', 'de-health-2026.09', 'engine', 'assessment-engine-1.0.0'
    ),
    'posture', jsonb_build_object('ampel', 'gelb', 'gating_reason_codes', jsonb_build_array('fixture.recovery')),
    'evidence', jsonb_build_object(
      'coverage_score', 50, 'confidence_score', 50, 'freshness', 'fresh', 'review_status', 'review_required'
    ),
    'technical_scores', jsonb_build_object(
      'overall', 50,
      'by_category', jsonb_build_object(
        'access_control', 50, 'backup', 50, 'email_security', 50,
        'network', 50, 'dsgvo', 50, 'updates', 50
      )
    ),
    'components', jsonb_build_array(jsonb_build_object(
      'id', component_id, 'kind', 'manual_attestation', 'source_id', 'recovery:' || suffix,
      'source_version', 'fixture-1.0.0', 'collection_status', 'collected', 'freshness', 'fresh',
      'observed_at', '2026-09-16T08:09:00Z', 'expires_at', '2026-12-15T08:09:00Z',
      'payload_sha256', component_hash, 'control_ids', jsonb_build_array()
    )),
    'controls', jsonb_build_array(),
    'score_explanations', jsonb_build_array(jsonb_build_object(
      'code', 'fixture.recovery', 'severity', 'info', 'effect', 'informational',
      'category', null, 'control_ids', jsonb_build_array(), 'points_delta', null
    )),
    'integrity', jsonb_build_object(
      'payload_sha256', payload_hash, 'authenticity', 'hash_only', 'signature', null
    )
  ),
  jsonb_build_object(
    'envelope_version', '2', 'alg', 'AES-256-GCM', 'key_version', 'fixture',
    'iv', 'synthetic-' || suffix, 'ciphertext', 'synthetic-' || suffix,
    'aad_sha256', aad_hash
  ),
  'sp3-03-recovery-' || suffix
)
from (values
  (
    'a',
    '20000000-0000-4000-8000-0000000000a1'::uuid,
    'c3300000-0000-4000-8000-0000000000a1'::uuid,
    'd3300000-0000-4000-8000-0000000000a1'::uuid,
    repeat('1', 64), repeat('a', 64), repeat('c', 64)
  ),
  (
    'b',
    '20000000-0000-4000-8000-0000000000b1'::uuid,
    'c3300000-0000-4000-8000-0000000000b1'::uuid,
    'd3300000-0000-4000-8000-0000000000b1'::uuid,
    repeat('2', 64), repeat('b', 64), repeat('d', 64)
  )
) as snapshot_fixture(
  suffix, practice_id, snapshot_id, component_id,
  component_hash, payload_hash, aad_hash
);

-- SP3-04 canaries prove that encrypted authorization scope and append-only
-- lifecycle evidence survive for A, while B remains erased before backup.
select public.persist_scan_authorization(
  jsonb_build_object(
    'schema_version', '1.0.0',
    'authorization_id', authorization_id,
    'practice_id', practice_id,
    'site_ref', 'recovery-' || suffix,
    'policy_version', 'de-health-safescan-1.0.0',
    'actor', jsonb_build_object(
      'user_id', actor_id, 'role', 'practice_owner', 'authorized_at', now() - interval '10 minutes'
    ),
    'valid_from', now() - interval '5 minutes',
    'valid_until', now() + interval '1 day',
    'max_safety_class', 1,
    'maintenance_windows', jsonb_build_array(),
    'scope', jsonb_build_object(
      'targets', jsonb_build_array(jsonb_build_object(
        'id', 'recovery-target-' || suffix, 'kind', 'asset',
        'locator', 'synthetic:' || suffix, 'asset_class', 'standard',
        'max_safety_class', 1, 'elevated_approval', null
      )),
      'exclusions', jsonb_build_array()
    ),
    'stop_conditions', jsonb_build_array(
      'kill_switch', 'clinical_impact_reported', 'connectivity_degradation',
      'unexpected_medical_device', 'error_threshold_exceeded', 'authorization_changed'
    ),
    'integrity', jsonb_build_object('scope_sha256', scope_hash)
  ),
  jsonb_build_object(
    'envelope_version', '2', 'alg', 'AES-256-GCM', 'key_version', 'fixture',
    'iv', 'synthetic-' || suffix, 'ciphertext', 'synthetic-' || suffix,
    'aad_sha256', aad_hash
  ),
  'sp3-04-recovery-' || suffix
)
from (values
  (
    'a', '20000000-0000-4000-8000-0000000000a1'::uuid,
    '00000000-0000-4000-8000-0000000000a1'::uuid,
    'd4400000-0000-4000-8000-0000000000a1'::uuid, repeat('a', 64), repeat('c', 64)
  ),
  (
    'b', '20000000-0000-4000-8000-0000000000b1'::uuid,
    '00000000-0000-4000-8000-0000000000b1'::uuid,
    'd4400000-0000-4000-8000-0000000000b1'::uuid, repeat('b', 64), repeat('d', 64)
  )
) as authorization_fixture(suffix, practice_id, actor_id, authorization_id, scope_hash, aad_hash);

select public.set_scan_kill_switch(
  '20000000-0000-4000-8000-0000000000a1',
  '00000000-0000-4000-8000-0000000000a1',
  false,
  'recovery_fixture_initial_state'
);

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
-- baseline this also proves the SP3-03 snapshot and SP3-04 authorization deletion contracts.
select public.complete_privacy_deletion(
  '20000000-0000-4000-8000-0000000000b1',
  '00000000-0000-4000-8000-0000000000b1'
);
