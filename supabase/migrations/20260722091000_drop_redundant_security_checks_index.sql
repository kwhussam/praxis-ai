-- DB-11: security_checks_practice_id_idx (practice_id) is redundant now that
-- security_checks_practice_type_completed_at_idx (practice_id, type, completed_at desc) exists
-- with practice_id as its leading column — Postgres can use the composite index for any pure
-- "where practice_id = ..." query just as efficiently. No live production project exists yet
-- in this repo to confirm via pg_stat_user_indexes, so this is based on static index-structure
-- analysis rather than production usage stats; re-verify with EXPLAIN ANALYZE / pg_stat_user_indexes
-- once real production traffic exists before relying on this reasoning for a busier table.
drop index if exists public.security_checks_practice_id_idx;
