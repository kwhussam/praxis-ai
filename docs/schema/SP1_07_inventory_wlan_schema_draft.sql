-- DESIGN DRAFT ONLY -- NOT A SUPABASE MIGRATION
-- SP1-07 / ADR-001. Column names and checks are subject to security/privacy review.

-- Shared target columns for inventory entities. Apply per existing table in an
-- additive migration; do not scrub legacy columns in the same release.
--
-- encrypted_payload jsonb not null
--   {alg, iv, ciphertext, key_version, payload_version, created_at}
-- payload_sha256 text not null
-- key_version text not null
-- payload_version text not null
-- source text not null
-- synthetic boolean not null default false
-- confidence smallint not null check (confidence between 0 and 100)
-- sync_policy text not null check (sync_policy in ('local_only', 'cloud_allowed'))
-- sync_revision bigint not null default 1
-- observed_at timestamptz
-- confirmed_at timestamptz
-- expires_at timestamptz
-- deleted_at timestamptz

/*
The complete DDL sketch is block-commented so this design file cannot mutate a
database if it is accidentally passed to the migration runner.

-- Envelope-key registry. No grants to authenticated/anon; Worker service path only.
create table if not exists public.practice_data_keys_draft (
  practice_id uuid primary key references public.practices(id) on delete cascade,
  wrapped_dek jsonb not null,
  kek_version text not null,
  algorithm text not null check (algorithm = 'AES-256-GCM'),
  created_at timestamptz not null default now(),
  rotated_at timestamptz,
  retired_at timestamptz
);

-- Representative additive target for inventory_items.
alter table public.inventory_items
  add column if not exists encrypted_payload_draft jsonb,
  add column if not exists payload_sha256_draft text,
  add column if not exists key_version_draft text,
  add column if not exists payload_version_draft text,
  add column if not exists source_draft text,
  add column if not exists synthetic_draft boolean,
  add column if not exists confidence_draft smallint,
  add column if not exists sync_policy_draft text,
  add column if not exists sync_revision_draft bigint,
  add column if not exists observed_at_draft timestamptz,
  add column if not exists confirmed_at_draft timestamptz,
  add column if not exists expires_at_draft timestamptz,
  add column if not exists deleted_at_draft timestamptz;

-- Known devices and APs use keyed identities for equality/deduplication.
alter table public.inventory_known_devices
  add column if not exists identity_hmac_draft text,
  add column if not exists encrypted_payload_draft jsonb,
  add column if not exists payload_sha256_draft text,
  add column if not exists key_version_draft text,
  add column if not exists payload_version_draft text,
  add column if not exists source_draft text,
  add column if not exists synthetic_draft boolean,
  add column if not exists confidence_draft smallint,
  add column if not exists sync_policy_draft text,
  add column if not exists sync_revision_draft bigint,
  add column if not exists deleted_at_draft timestamptz;

alter table public.inventory_access_points
  add column if not exists identity_hmac_draft text,
  add column if not exists encrypted_payload_draft jsonb,
  add column if not exists payload_sha256_draft text,
  add column if not exists key_version_draft text,
  add column if not exists payload_version_draft text,
  add column if not exists source_draft text,
  add column if not exists synthetic_draft boolean,
  add column if not exists confidence_draft smallint,
  add column if not exists sync_policy_draft text,
  add column if not exists sync_revision_draft bigint,
  add column if not exists deleted_at_draft timestamptz;

-- WLAN list/dashboard metadata remains D1; topology and findings move into the envelope.
alter table public.wlan_scans
  add column if not exists risk_score_draft integer,
  add column if not exists coverage_score_draft integer,
  add column if not exists critical_count_draft integer,
  add column if not exists warning_count_draft integer,
  add column if not exists scan_mode_draft text,
  add column if not exists key_version_draft text,
  add column if not exists payload_version_draft text,
  add column if not exists migration_status_draft text,
  add column if not exists migrated_at_draft timestamptz;

-- Target constraints, indexes and grants are deliberately deferred to a later,
-- reviewed migration. In particular, do not drop plaintext unique constraints
-- before every legacy row has a verified identity_hmac and encrypted envelope.
*/
