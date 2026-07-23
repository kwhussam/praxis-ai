-- PERF-08: the dashboard history query (handleDashboard, workers/hono/src/index.ts) selects
--   security_checks where practice_id = ... order by completed_at desc limit 30
-- WITHOUT a type filter. The existing composite index
--   security_checks_practice_type_completed_at_idx (practice_id, type, completed_at desc)
-- has `type` as its second column, so Postgres cannot use its sort order across mixed type
-- values for this untyped query. Add a matching (practice_id, completed_at desc) index so the
-- planner can satisfy the ordered limit without a sort step.
create index if not exists security_checks_practice_completed_at_idx
on public.security_checks (practice_id, completed_at desc);
