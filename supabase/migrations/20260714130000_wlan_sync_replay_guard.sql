alter table public.wlan_scans
add column if not exists client_sync_id text;

create unique index if not exists wlan_scans_practice_client_sync_id_idx
on public.wlan_scans(practice_id, client_sync_id)
where client_sync_id is not null;
