-- DB-02: ai_report_usage RLS policy is unreachable without a table grant, unlike the
-- structurally identical external_check_usage.
grant select on public.ai_report_usage to authenticated;

-- DB-13: both usage tables only have (user_id, usage_date desc); add practice_id as the
-- leading column for practice-centric lookups.
create index if not exists external_check_usage_practice_id_idx
on public.external_check_usage(practice_id);

create index if not exists ai_report_usage_practice_id_idx
on public.ai_report_usage(practice_id);
