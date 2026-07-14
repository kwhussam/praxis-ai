create table if not exists public.ai_report_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  practice_id uuid references public.practices(id) on delete cascade,
  usage_date date not null default current_date,
  count integer not null default 0 check (count >= 0),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, practice_id, usage_date)
);

create index if not exists ai_report_usage_user_date_idx
on public.ai_report_usage(user_id, usage_date desc);

alter table public.ai_report_usage enable row level security;
alter table public.ai_report_usage force row level security;

drop policy if exists "tenant guard: ai report usage practice and user" on public.ai_report_usage;
create policy "tenant guard: ai report usage practice and user"
on public.ai_report_usage
for select
using (
  user_id = auth.uid()
  and public.current_user_can_access_practice(practice_id, 'viewer')
);

create or replace function public.consume_ai_report_quota(
  p_user_id uuid,
  p_practice_id uuid,
  p_usage_date date,
  p_limit integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_count integer;
begin
  insert into public.ai_report_usage (user_id, practice_id, usage_date, count)
  values (p_user_id, p_practice_id, p_usage_date, 0)
  on conflict (user_id, practice_id, usage_date) do nothing;

  select count into current_count
  from public.ai_report_usage
  where user_id = p_user_id
    and practice_id = p_practice_id
    and usage_date = p_usage_date
  for update;

  if current_count >= p_limit then
    return false;
  end if;

  update public.ai_report_usage
  set count = count + 1,
      updated_at = now()
  where user_id = p_user_id
    and practice_id = p_practice_id
    and usage_date = p_usage_date;

  return true;
end;
$$;

revoke execute on function public.consume_ai_report_quota(uuid, uuid, date, integer) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on function public.consume_ai_report_quota(uuid, uuid, date, integer) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke execute on function public.consume_ai_report_quota(uuid, uuid, date, integer) from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.consume_ai_report_quota(uuid, uuid, date, integer) to service_role';
  end if;
end
$$;
