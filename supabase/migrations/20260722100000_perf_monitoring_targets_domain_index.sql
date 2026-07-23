-- PERF-04: fetchMonitoringTargets (workers/hono/src/index.ts) runs
--   select id,domain,email from practices where domain is not null
-- on every cron tick with no supporting index — only practices_owner_id_idx exists, so this
-- degrades to a full table scan as the practices table grows. Add a partial index on the
-- filtered column so the planner can serve the "domain is not null" set directly.
--
-- Follow-up (NOT in this migration): the cron path still fetches the full target set without
-- LIMIT/pagination. Batching the cron over a cursor is a separate, larger change that needs a
-- design review of runScheduledMonitoring and its snapshot/comparison flow — tracked as PERF-04
-- pagination follow-up, deliberately deferred here per instruction.
create index if not exists practices_domain_not_null_idx
on public.practices (domain)
where domain is not null;
