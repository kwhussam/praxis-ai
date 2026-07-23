-- PERF-09: the reports list query (handleReportsList, workers/hono/src/index.ts) selects
--   reports where practice_id = ... and anonymized_at is null order by created_at desc limit N
-- The only existing index is reports_practice_id_idx (practice_id) — single column, so the
-- anonymized_at filter and created_at ordering are not covered. Add a composite index so the
-- planner can serve the filtered, ordered page directly. Naturally bounded today by
-- FREE_PLAN_DAILY_AI_REPORT_LIMIT, but the gap widens for paid users over time.
create index if not exists reports_practice_anonymized_created_at_idx
on public.reports (practice_id, anonymized_at, created_at desc);
