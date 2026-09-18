-- SP3-02 / G-01: inventory, router and monitoring-target records contain D2
-- data (for example MAC addresses, SSIDs, hostnames and firewall rules). The
-- privacy deletion transaction must remove them before recording completion.
--
-- The six deletes intentionally run inside the existing SECURITY DEFINER RPC.
-- Any failure therefore rolls back the D2 deletion, anonymization and legal
-- deletion receipt as one transaction. Legal-retention records remain intact.

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
  delete from public.inventory_items where practice_id = p_practice_id;
  delete from public.inventory_known_devices where practice_id = p_practice_id;
  delete from public.inventory_access_points where practice_id = p_practice_id;
  delete from public.router_wifi_configurations where practice_id = p_practice_id;
  delete from public.router_firewall_rules where practice_id = p_practice_id;
  delete from public.monitoring_targets where practice_id = p_practice_id;
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
    'immediate_deletions', jsonb_build_array(
      'personal_data',
      'wlan_scans',
      'assessment_manifests',
      'inventory_items',
      'inventory_known_devices',
      'inventory_access_points',
      'router_wifi_configurations',
      'router_firewall_rules',
      'monitoring_targets'
    ),
    'anonymizations', jsonb_build_array(
      'security_checks', 'reports', 'monitoring_events', 'monitoring_snapshots'
    ),
    'retained_for_legal', jsonb_build_array(
      'practice_access_audit', 'deletion_requests', 'consent_log', 'data_processing_agreements'
    ),
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
