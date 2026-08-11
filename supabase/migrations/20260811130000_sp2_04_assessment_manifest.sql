-- SP2-04: bind every persisted report to one immutable, versioned assessment
-- manifest and persist manifest + report atomically. The manifest contains only
-- identifiers, versions and hashes; the evidence snapshot remains AES-GCM encrypted.

create table if not exists public.assessment_manifests (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references public.practices(id) on delete cascade,
  source_check_id uuid not null references public.security_checks(id) on delete cascade,
  manifest_version text not null,
  assessment_profile text not null,
  facts_version text not null,
  scoring_version text not null,
  report_format_version text not null,
  pdf_template_version text not null,
  snapshot_sha256 text not null,
  manifest jsonb not null,
  manifest_sha256 text not null,
  encrypted_snapshot jsonb not null,
  created_at timestamptz not null,
  anonymized_at timestamptz,
  constraint assessment_manifests_id_practice_unique unique (id, practice_id),
  constraint assessment_manifests_profile_check
    check (assessment_profile in ('general', 'health')),
  constraint assessment_manifests_snapshot_hash_check
    check (snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  constraint assessment_manifests_manifest_hash_check
    check (manifest_sha256 ~ '^[0-9a-f]{64}$')
);

create index if not exists assessment_manifests_practice_created_at_idx
on public.assessment_manifests (practice_id, created_at desc);

alter table public.assessment_manifests enable row level security;
alter table public.assessment_manifests force row level security;

drop policy if exists "assessment manifests are tenant readable" on public.assessment_manifests;
create policy "assessment manifests are tenant readable"
on public.assessment_manifests
for select
using (
  public.current_user_can_access_practice(practice_id, 'viewer')
  and exists (
    select 1
    from public.security_checks
    where security_checks.id = assessment_manifests.source_check_id
      and security_checks.practice_id = assessment_manifests.practice_id
  )
);

revoke all on public.assessment_manifests from anon, authenticated;
grant select on public.assessment_manifests to authenticated;
grant select, insert, delete on public.assessment_manifests to service_role;

alter table public.reports
add column if not exists assessment_manifest_id uuid,
add column if not exists report_manifest jsonb,
add column if not exists report_manifest_sha256 text;

alter table public.reports
drop constraint if exists reports_assessment_manifest_practice_fkey;

alter table public.reports
add constraint reports_assessment_manifest_practice_fkey
foreign key (assessment_manifest_id, practice_id)
references public.assessment_manifests(id, practice_id)
on delete set null (assessment_manifest_id);

alter table public.reports
drop constraint if exists reports_manifest_hash_check;

alter table public.reports
add constraint reports_manifest_hash_check
check (report_manifest_sha256 is null or report_manifest_sha256 ~ '^[0-9a-f]{64}$');

create or replace function public.report_manifest_belongs_to_practice(
  p_manifest_id uuid,
  p_practice_id uuid
)
returns boolean
language sql
stable
set search_path = public
as $$
  select p_manifest_id is null
    or exists (
      select 1
      from public.assessment_manifests
      where id = p_manifest_id
        and practice_id = p_practice_id
    );
$$;

drop policy if exists "tenant guard: reports practice and check" on public.reports;
create policy "tenant guard: reports practice check and manifest"
on public.reports
as restrictive
for all
using (
  public.current_user_can_access_practice(practice_id, 'viewer')
  and public.report_check_belongs_to_practice(check_id, practice_id)
  and public.report_manifest_belongs_to_practice(assessment_manifest_id, practice_id)
)
with check (
  public.current_user_can_access_practice(practice_id, 'manager')
  and public.report_check_belongs_to_practice(check_id, practice_id)
  and public.report_manifest_belongs_to_practice(assessment_manifest_id, practice_id)
);

-- The Worker is the only writer. This RPC makes the immutable evidence snapshot
-- and its report one transaction, so a failure cannot leave an orphaned artifact.
create or replace function public.persist_assessment_report(
  p_report_id uuid,
  p_manifest_id uuid,
  p_practice_id uuid,
  p_source_check_id uuid,
  p_created_at timestamptz,
  p_manifest_version text,
  p_assessment_profile text,
  p_facts_version text,
  p_scoring_version text,
  p_report_format_version text,
  p_pdf_template_version text,
  p_snapshot_sha256 text,
  p_manifest jsonb,
  p_manifest_sha256 text,
  p_encrypted_snapshot jsonb,
  p_report_summary jsonb,
  p_encrypted_report jsonb,
  p_report_sha256 text,
  p_client_sync_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_report_id uuid;
  v_existing_manifest_id uuid;
begin
  if not exists (
    select 1
    from public.security_checks
    where id = p_source_check_id
      and practice_id = p_practice_id
      and anonymized_at is null
  ) then
    raise exception 'source_check_not_found_for_practice' using errcode = '23503';
  end if;

  if p_client_sync_id is not null then
    select id, assessment_manifest_id into v_existing_report_id, v_existing_manifest_id
    from public.reports
    where practice_id = p_practice_id
      and client_sync_id = p_client_sync_id
    limit 1;

    if v_existing_report_id is not null then
      return jsonb_build_object(
        'report_id', v_existing_report_id,
        'assessment_manifest_id', v_existing_manifest_id
      );
    end if;
  end if;

  begin
    insert into public.assessment_manifests (
      id, practice_id, source_check_id, manifest_version, assessment_profile,
      facts_version, scoring_version, report_format_version, pdf_template_version,
      snapshot_sha256, manifest, manifest_sha256, encrypted_snapshot, created_at
    ) values (
      p_manifest_id, p_practice_id, p_source_check_id, p_manifest_version, p_assessment_profile,
      p_facts_version, p_scoring_version, p_report_format_version, p_pdf_template_version,
      p_snapshot_sha256, p_manifest, p_manifest_sha256, p_encrypted_snapshot, p_created_at
    );

    insert into public.reports (
      id, practice_id, check_id, assessment_manifest_id, format_version,
      scoring_version, content, encrypted_content, payload_sha256, input_hash,
      report_manifest, report_manifest_sha256, client_sync_id, created_at
    ) values (
      p_report_id, p_practice_id, p_source_check_id, p_manifest_id, p_report_format_version,
      p_scoring_version, p_report_summary, p_encrypted_report, p_report_sha256, p_snapshot_sha256,
      p_manifest, p_manifest_sha256, p_client_sync_id, p_created_at
    );
  exception when unique_violation then
    -- Concurrent retries can both pass the early lookup. The subtransaction
    -- rolls back the losing manifest insert, then returns the winning artifact.
    if p_client_sync_id is null then raise; end if;
    select id, assessment_manifest_id into v_existing_report_id, v_existing_manifest_id
    from public.reports
    where practice_id = p_practice_id
      and client_sync_id = p_client_sync_id
    limit 1;
    if v_existing_report_id is null or v_existing_manifest_id is null then raise; end if;
    return jsonb_build_object(
      'report_id', v_existing_report_id,
      'assessment_manifest_id', v_existing_manifest_id
    );
  end;

  return jsonb_build_object(
    'report_id', p_report_id,
    'assessment_manifest_id', p_manifest_id
  );
end;
$$;

revoke execute on function public.persist_assessment_report(
  uuid, uuid, uuid, uuid, timestamptz, text, text, text, text, text, text,
  text, jsonb, text, jsonb, jsonb, jsonb, text, text
) from public, anon, authenticated;
grant execute on function public.persist_assessment_report(
  uuid, uuid, uuid, uuid, timestamptz, text, text, text, text, text, text,
  text, jsonb, text, jsonb, jsonb, jsonb, text, text
) to service_role;

-- Assessment manifests are evidence data, not legal-retention records. Delete
-- them during erasure before anonymizing their source checks and reports.
create or replace function public.complete_privacy_deletion(
  p_practice_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deletion_id uuid := gen_random_uuid();
  v_now timestamptz := now();
  v_legal_retention_until timestamptz := v_now + interval '6 years';
  v_monitoring_retention_until timestamptz := v_now + interval '1 year';
  v_report jsonb;
begin
  delete from public.wlan_scans where practice_id = p_practice_id;
  delete from public.assessment_manifests where practice_id = p_practice_id;

  update public.practices
  set name = '[GELOESCHT]', domain = null, email = null, deleted_at = v_now
  where id = p_practice_id;

  update public.security_checks
  set results = jsonb_build_object('anonymized', true),
      encrypted_payload = '{}'::jsonb,
      anonymized_at = v_now
  where practice_id = p_practice_id;

  update public.reports
  set content = jsonb_build_object('anonymized', true),
      encrypted_content = '{}'::jsonb,
      report_manifest = null,
      report_manifest_sha256 = null,
      anonymized_at = v_now
  where practice_id = p_practice_id;

  update public.monitoring_events
  set title = '[GELOESCHT]', message = '', details = '{}'::jsonb, anonymized_at = v_now
  where practice_id = p_practice_id and anonymized_at is null;

  update public.monitoring_snapshots
  set ssl = '{}'::jsonb, email_security = '{}'::jsonb, devices = '{}'::jsonb,
      checks = '{}'::jsonb, encrypted_checks = '{}'::jsonb, payload_sha256 = null,
      anonymized_at = v_now
  where practice_id = p_practice_id and anonymized_at is null;

  v_report := jsonb_build_object(
    'deletion_id', v_deletion_id,
    'practice_id', p_practice_id,
    'requested_at', v_now,
    'state', 'completed',
    'immediate_deletions', jsonb_build_array('personal_data', 'wlan_scans', 'assessment_manifests'),
    'anonymizations', jsonb_build_array('security_checks', 'reports', 'monitoring_events', 'monitoring_snapshots'),
    'retained_for_legal', jsonb_build_array('practice_access_audit', 'deletion_requests', 'consent_log', 'data_processing_agreements'),
    'retention_until', v_legal_retention_until,
    'monitoring_retention_until', v_monitoring_retention_until,
    'completed_by', 'system'
  );

  insert into public.deletion_requests (
    id, practice_id, user_id, requested_by, status, state, requested_at, completed_at, report, metadata
  ) values (
    v_deletion_id, p_practice_id, p_user_id, p_user_id, 'completed', 'completed', v_now, v_now, v_report,
    jsonb_build_object('reason', 'user_requested_erasure')
  );

  return v_report;
end;
$$;

revoke execute on function public.complete_privacy_deletion(uuid, uuid) from public, anon, authenticated;
grant execute on function public.complete_privacy_deletion(uuid, uuid) to service_role;
