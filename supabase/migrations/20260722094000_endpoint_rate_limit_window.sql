-- DB-06: paid plans currently skip quota checks entirely for external checks, monitoring
-- runs, and report generation. Beyond raising their daily caps (app-side change), add a
-- short rolling window limit shared across all plans so a compromised/abused account can't
-- burst through the daily cap's worth of paid provider calls in a few seconds.
create table if not exists public.endpoint_rate_limit (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid references public.practices(id) on delete cascade,
  endpoint text not null,
  window_start timestamptz not null,
  count integer not null default 0 check (count >= 0),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (practice_id, endpoint, window_start)
);

alter table public.endpoint_rate_limit enable row level security;
alter table public.endpoint_rate_limit force row level security;
-- No grants to authenticated: only the service-role-executed consume_rate_limit_window RPC
-- below touches this table, matching external_check_usage/ai_report_usage's write path.

create or replace function public.consume_rate_limit_window(
  p_practice_id uuid,
  p_endpoint text,
  p_window_minutes integer,
  p_limit integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_count integer;
  bucket timestamptz;
begin
  bucket := to_timestamp(floor(extract(epoch from now()) / (p_window_minutes * 60)) * (p_window_minutes * 60));

  insert into public.endpoint_rate_limit (practice_id, endpoint, window_start, count)
  values (p_practice_id, p_endpoint, bucket, 0)
  on conflict (practice_id, endpoint, window_start) do nothing;

  select count into current_count
  from public.endpoint_rate_limit
  where practice_id = p_practice_id
    and endpoint = p_endpoint
    and window_start = bucket
  for update;

  if current_count >= p_limit then
    return false;
  end if;

  update public.endpoint_rate_limit
  set count = count + 1,
      updated_at = now()
  where practice_id = p_practice_id
    and endpoint = p_endpoint
    and window_start = bucket;

  return true;
end;
$$;

revoke all on function public.consume_rate_limit_window(uuid, text, integer, integer) from public;
grant execute on function public.consume_rate_limit_window(uuid, text, integer, integer) to service_role;

create index if not exists endpoint_rate_limit_practice_endpoint_idx
on public.endpoint_rate_limit(practice_id, endpoint, window_start desc);
