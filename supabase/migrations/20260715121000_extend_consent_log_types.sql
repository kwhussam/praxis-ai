alter table public.consent_log
  drop constraint if exists consent_log_type_check;

alter table public.consent_log
  add constraint consent_log_type_check
  check (
    type in (
      'avv',
      'privacy_policy',
      'wlan_scan',
      'ai_processing',
      'wlan_audit_scan',
      'wlan_ipv6_reachability_scan'
    )
  );
