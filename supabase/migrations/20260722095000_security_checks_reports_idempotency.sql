-- DB-05: wlan_scans already has replay protection via client_sync_id; security_checks and
-- reports inserts (questionnaire/external check, report generation) have none, so a network
-- retry creates a duplicate row and burns a second quota slot for free-plan practices.
-- Optional and additive: existing rows/clients are unaffected until a clientSyncId is sent.
alter table public.security_checks
add column if not exists client_sync_id text;

create unique index if not exists security_checks_practice_client_sync_id_idx
on public.security_checks(practice_id, client_sync_id)
where client_sync_id is not null;

alter table public.reports
add column if not exists client_sync_id text;

create unique index if not exists reports_practice_client_sync_id_idx
on public.reports(practice_id, client_sync_id)
where client_sync_id is not null;
