-- F-088: PostgREST requests always need SELECT on the affected table, not
-- just the write verb, whenever the statement involves reading back rows:
-- a WHERE-filtered UPDATE/DELETE (?column=eq.value) needs SELECT on the
-- filter column, and an INSERT ... ON CONFLICT DO UPDATE (upsert) needs
-- SELECT for the conflict/update path. Both were confirmed empirically
-- against local Postgres with a role holding only insert/update: filtered
-- PATCH and on_conflict upserts fail with "permission denied for table"
-- until SELECT is also granted.
--
-- deletion_requests is PATCHed with ?id=eq. in handlePrivacyDelete, and
-- data_processing_agreements is upserted with on_conflict=practice_id,version
-- in handleAvvAccept. Both tables only had insert/update from
-- 20260717120000_worker_grants_and_security_checks_index.sql, so
-- service_role was missing SELECT on exactly these two.
grant select on public.deletion_requests to service_role;
grant select on public.data_processing_agreements to service_role;
