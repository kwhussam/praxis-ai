-- DESIGN DRAFT ONLY -- NOT A SUPABASE MIGRATION
-- SP1-07 / ADR-001. The complete sketch is block-commented intentionally.
-- It must not be copied into production without every ADR-001 gate and the
-- executable fixtures in ADR-001_VERIFICATION_PLAN.md passing.

/*
Target invariants
=================

1. Existing plaintext fields stay readable through M4. They are scrubbed only
   in M5 after exact reconciliation and are dropped no earlier than M7.
2. encrypted_payload_v2 is nullable during backfill. The existing wlan_scans
   encrypted_payload default `{}` is legacy state and never a valid v2 envelope.
3. payload_hmac and identity_hmac are keyed, practice-bound and domain-separated.
   They are not unkeyed hashes of confidential plaintext.
4. No authenticated/anon grant exists on the key registry.
5. Draft suffixes make accidental coupling to application code less likely.

-- One row per practice and DEK version. A practice_id primary key would make
-- rotation history impossible, therefore the version is part of the key.
create table public.practice_data_keys_draft (
  practice_id uuid not null references public.practices(id) on delete cascade,
  key_version text not null,
  wrapped_dek jsonb not null,
  kek_version text not null,
  wrap_algorithm text not null,
  status text not null check (status in ('active', 'decrypt_only', 'retired')),
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  decrypt_only_at timestamptz,
  retired_at timestamptz,
  primary key (practice_id, key_version),
  check ((status <> 'active') or activated_at is not null),
  check ((status <> 'retired') or retired_at is not null)
);

create unique index practice_data_keys_one_active_draft
  on public.practice_data_keys_draft(practice_id)
  where status = 'active';

revoke all on public.practice_data_keys_draft from public, anon, authenticated;
-- A reviewed migration grants only the minimum operations to service_role.

-- Reused target columns are shown explicitly on every sensitive table because
-- the source tables differ. Envelope validation is staged: nullable in M1-M4,
-- required and schema-validated only in M5.
alter table public.inventory_items
  add column encrypted_payload_v2_draft jsonb,
  add column payload_hmac_draft text,
  add column key_version_draft text,
  add column payload_version_draft integer,
  add column aad_version_draft integer,
  add column source_draft text,
  add column synthetic_draft boolean,
  add column confidence_draft smallint,
  add column sync_policy_draft text,
  add column sync_revision_draft bigint,
  add column observed_at_draft timestamptz,
  add column confirmed_at_draft timestamptz,
  add column expires_at_draft timestamptz,
  add column deleted_at_draft timestamptz,
  add column migration_status_draft text,
  add column migrated_at_draft timestamptz;

alter table public.inventory_known_devices
  add column identity_hmac_draft text,
  add column encrypted_payload_v2_draft jsonb,
  add column payload_hmac_draft text,
  add column key_version_draft text,
  add column payload_version_draft integer,
  add column aad_version_draft integer,
  add column source_draft text,
  add column synthetic_draft boolean,
  add column confidence_draft smallint,
  add column sync_policy_draft text,
  add column sync_revision_draft bigint,
  add column observed_at_draft timestamptz,
  add column confirmed_at_draft timestamptz,
  add column expires_at_draft timestamptz,
  add column deleted_at_draft timestamptz,
  add column migration_status_draft text,
  add column migrated_at_draft timestamptz;

alter table public.inventory_access_points
  add column identity_hmac_draft text,
  add column encrypted_payload_v2_draft jsonb,
  add column payload_hmac_draft text,
  add column key_version_draft text,
  add column payload_version_draft integer,
  add column aad_version_draft integer,
  add column source_draft text,
  add column synthetic_draft boolean,
  add column confidence_draft smallint,
  add column sync_policy_draft text,
  add column sync_revision_draft bigint,
  add column observed_at_draft timestamptz,
  add column confirmed_at_draft timestamptz,
  add column expires_at_draft timestamptz,
  add column deleted_at_draft timestamptz,
  add column migration_status_draft text,
  add column migrated_at_draft timestamptz;

-- Raw WLAN security flags are D2. Only derived, non-identifying aggregates may
-- remain D1. This table therefore needs an envelope like every other entity.
alter table public.router_wifi_configurations
  add column encrypted_payload_v2_draft jsonb,
  add column payload_hmac_draft text,
  add column key_version_draft text,
  add column payload_version_draft integer,
  add column aad_version_draft integer,
  add column source_draft text,
  add column confidence_draft smallint,
  add column migration_status_draft text,
  add column migrated_at_draft timestamptz;

alter table public.router_firewall_rules
  add column encrypted_payload_v2_draft jsonb,
  add column payload_hmac_draft text,
  add column key_version_draft text,
  add column payload_version_draft integer,
  add column aad_version_draft integer,
  add column source_draft text,
  add column confidence_draft smallint,
  add column migration_status_draft text,
  add column migrated_at_draft timestamptz;

-- value and normalized_value are D2. Equality uses a keyed identity HMAC.
alter table public.monitoring_targets
  add column identity_hmac_draft text,
  add column encrypted_payload_v2_draft jsonb,
  add column payload_hmac_draft text,
  add column key_version_draft text,
  add column payload_version_draft integer,
  add column aad_version_draft integer,
  add column source_draft text,
  add column migration_status_draft text,
  add column migrated_at_draft timestamptz;

-- WLAN gets a separate v2 column; encrypted_payload={} remains legacy.
alter table public.wlan_scans
  add column encrypted_payload_v2_draft jsonb,
  add column payload_hmac_draft text,
  add column key_version_draft text,
  add column payload_version_draft integer,
  add column aad_version_draft integer,
  add column risk_score_draft integer,
  add column coverage_score_draft integer,
  add column critical_count_draft integer,
  add column warning_count_draft integer,
  add column scan_mode_draft text,
  add column migration_status_draft text,
  add column migrated_at_draft timestamptz;

-- Representative M1 checks. The reviewed migration should name checks per
-- table and use NOT VALID before backfill where appropriate.
alter table public.inventory_items
  add constraint inventory_items_confidence_draft_check
    check (confidence_draft between 0 and 100) not valid,
  add constraint inventory_items_source_draft_check
    check (source_draft in
      ('manual', 'observed', 'imported', 'practice_profile', 'connector', 'agent')) not valid,
  add constraint inventory_items_sync_policy_draft_check
    check (sync_policy_draft in ('local_only', 'cloud_allowed')) not valid,
  add constraint inventory_items_migration_status_draft_check
    check (migration_status_draft in
      ('legacy_pending', 'backfill_paused', 'dual_written', 'verified', 'scrubbed')) not valid;

-- M5-only constraints, expressed as examples rather than executable DDL:
--   envelope is an object and has exactly the allowed v2 keys/types;
--   alg='A256GCM', payload_version=2, aad_version=1;
--   envelope key_version matches the relational key_version and registry FK;
--   migrated live rows require envelope + payload_hmac + key_version;
--   D3 key names are rejected in the Worker before encryption;
--   sync_policy='local_only' is rejected by every Cloud write endpoint.

-- M5-only keyed identity uniqueness. Keep old plaintext unique constraints
-- until every legacy row is verified; then replace them transactionally.
create unique index inventory_known_devices_identity_draft
  on public.inventory_known_devices(practice_id, identity_hmac_draft)
  where deleted_at_draft is null and identity_hmac_draft is not null;

create unique index inventory_access_points_identity_draft
  on public.inventory_access_points(practice_id, identity_hmac_draft)
  where deleted_at_draft is null and identity_hmac_draft is not null;

create unique index monitoring_targets_identity_draft
  on public.monitoring_targets(practice_id, target_type, identity_hmac_draft)
  where identity_hmac_draft is not null;

-- Final grants are intentionally not declared here. M6 must prove:
--   authenticated/anon: no direct INSERT/UPDATE/DELETE on sensitive tables;
--   service_role: only reviewed Worker/RPC operations;
--   viewer/manager access: exclusively via tenant-validated Worker endpoints;
--   key registry: inaccessible outside the minimum Worker/rotation functions.
*/
