-- DB-10: email_outbox stores recipient email addresses + full report payloads indefinitely
-- and is never touched by complete_privacy_deletion(). Add a retention RPC the Worker cron
-- can call daily to delete rows past a configurable cutoff, independent of any specific
-- deletion request.
create or replace function public.cleanup_email_outbox(retention_days integer default 30)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  delete from public.email_outbox
  where status in ('sent', 'failed')
    and coalesce(sent_at, created_at) < now() - make_interval(days => retention_days);

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.cleanup_email_outbox(integer) from public;
grant execute on function public.cleanup_email_outbox(integer) to service_role;
