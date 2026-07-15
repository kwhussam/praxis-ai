grant usage on schema public to authenticated;

grant select, insert, update on public.practices to authenticated;
grant select on public.monitoring_events to authenticated;
grant select on public.monitoring_snapshots to authenticated;
grant select, insert on public.wlan_scans to authenticated;

grant select on public.security_checks to authenticated;
grant select on public.reports to authenticated;
grant select on public.external_check_usage to authenticated;
grant select on public.practice_access_audit to authenticated;
grant select on public.data_processing_agreements to authenticated;
grant select on public.deletion_requests to authenticated;
grant select on public.consent_log to authenticated;
grant select on public.partner_practices to authenticated;
grant select on public.partner_plan_pricing to authenticated;
grant select on public.white_label_partners to authenticated;
