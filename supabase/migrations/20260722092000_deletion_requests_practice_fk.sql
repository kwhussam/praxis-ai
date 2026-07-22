-- SEC-06/DB-09: deletion_requests.practice_id had no FK, weakening the referential integrity
-- of the DSGVO deletion audit trail that complete_privacy_deletion() writes to. Null out any
-- pre-existing orphaned references first (a broken reference is equivalent to what
-- "on delete set null" would already produce going forward), then add the constraint so it
-- applies cleanly regardless of existing data.
update public.deletion_requests
set practice_id = null
where practice_id is not null
  and not exists (
    select 1 from public.practices where practices.id = deletion_requests.practice_id
  );

alter table public.deletion_requests
add constraint deletion_requests_practice_id_fkey
foreign key (practice_id) references public.practices(id) on delete set null;
