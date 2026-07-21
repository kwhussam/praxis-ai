-- F-089/F-090/F-031: the privacy deletion handler previously ran six
-- sequential supabaseRest calls (insert deletion_requests, delete
-- wlan_scans, anonymize practices/security_checks/reports, update
-- deletion_requests to completed). A failure partway through could leave
-- practice data anonymized without deletion_requests ever reflecting it
-- (or vice versa) -- an audit-trail gap for a DSGVO erasure function.
--
-- This migration moves the whole operation into a single plpgsql function
-- invoked via one RPC call, so Postgres guarantees it is all-or-nothing:
-- deletion_requests.state == 'completed' if and only if every anonymization
-- step actually ran. Email confirmation stays in the Worker (external side
-- effect, not part of the DB transaction).
--
-- It also closes F-090/F-031: monitoring_events and monitoring_snapshots
-- were never touched by the deletion flow. Both are now anonymized (content
-- cleared, row kept for score/alert-type trend history) with a 1-year
-- retention window, matching the RETENTION_PERIODS.monitoring_events value
-- (365 days) that existed in workers/hono/src/privacy.ts but was dead code
-- until now -- the retention math now lives here since the whole deletion
-- flow is one RPC call, so that TS constant (and the equally unused
-- security_reports/personal_data ones) has been removed as dead code.
--
-- data_processing_agreements (the AVV, Art. 28 DSGVO) is deliberately left
-- untouched: it is a business contract record subject to the German
-- commercial retention duty (HGB Sec. 257 / AO Sec. 147, 6 years -- the
-- same duration as the audit-log retention below), which DSGVO Art. 17(3)(b)
-- explicitly allows to override the erasure right.

alter table public.monitoring_events
  add column if not exists anonymized_at timestamptz;

alter table public.monitoring_snapshots
  add column if not exists anonymized_at timestamptz;

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
  delete from public.wlan_scans
  where practice_id = p_practice_id;

  update public.practices
  set name = '[GELOESCHT]',
      domain = null,
      email = null,
      deleted_at = v_now
  where id = p_practice_id;

  update public.security_checks
  set results = jsonb_build_object('anonymized', true),
      encrypted_payload = '{}'::jsonb,
      anonymized_at = v_now
  where practice_id = p_practice_id;

  update public.reports
  set content = jsonb_build_object('anonymized', true),
      encrypted_content = '{}'::jsonb,
      anonymized_at = v_now
  where practice_id = p_practice_id;

  update public.monitoring_events
  set title = '[GELOESCHT]',
      message = '',
      details = '{}'::jsonb,
      anonymized_at = v_now
  where practice_id = p_practice_id
    and anonymized_at is null;

  update public.monitoring_snapshots
  set ssl = '{}'::jsonb,
      email_security = '{}'::jsonb,
      devices = '{}'::jsonb,
      checks = '{}'::jsonb,
      encrypted_checks = '{}'::jsonb,
      payload_sha256 = null,
      anonymized_at = v_now
  where practice_id = p_practice_id
    and anonymized_at is null;

  v_report := jsonb_build_object(
    'deletion_id', v_deletion_id,
    'practice_id', p_practice_id,
    'requested_at', v_now,
    'state', 'completed',
    'immediate_deletions', jsonb_build_array('personal_data', 'wlan_scans'),
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

revoke execute on function public.complete_privacy_deletion(uuid, uuid) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on function public.complete_privacy_deletion(uuid, uuid) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke execute on function public.complete_privacy_deletion(uuid, uuid) from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.complete_privacy_deletion(uuid, uuid) to service_role';
  end if;
end
$$;
