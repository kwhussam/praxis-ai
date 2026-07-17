create index if not exists security_checks_practice_type_completed_at_idx
on public.security_checks (practice_id, type, completed_at desc);

grant select, insert, update on public.reports to service_role;
grant select, insert on public.monitoring_snapshots to service_role;
grant select, insert, update on public.monitoring_events to service_role;
grant select, insert on public.consent_log to service_role;
grant insert, update on public.data_processing_agreements to service_role;
grant insert, update on public.deletion_requests to service_role;
grant insert on public.email_outbox to service_role;

grant select, update on public.security_checks to service_role;
grant update on public.practices to service_role;
grant select, delete on public.wlan_scans to service_role;

grant select, insert, update, delete on public.inventory_items to service_role;
grant select, insert, update, delete on public.inventory_known_devices to service_role;
grant select, insert, update, delete on public.inventory_access_points to service_role;
grant select, insert, update, delete on public.router_wifi_configurations to service_role;
grant select, insert, update, delete on public.router_firewall_rules to service_role;
grant select, insert, update, delete on public.monitoring_targets to service_role;
