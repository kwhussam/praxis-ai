-- B2 (Slice 2): akteur-gebundenes Rate-Limit fuer die Backoffice-Mutations-RPCs.
-- Fachplan docs/WEB_BACKOFFICE_FOUNDATION.md, Freigabe E-027.
--
-- Der bestehende endpoint_rate_limit ist an practice_id (FK) gebunden. Backoffice-
-- Mutationen wie practice.create haben aber (noch) keine Praxis; der eigentliche
-- Missbrauchsvektor ist ohnehin ein einzelner Staff-Akteur, der viele Praxen
-- bearbeitet. Dieses Limit ist daher an (actor_user_id, endpoint, window) gebunden
-- und laeuft VOR jeder mutierenden bzw. codeerzeugenden RPC im Worker.
create table if not exists public.backoffice_rate_limit (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  window_start timestamptz not null,
  count integer not null default 0 check (count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (actor_user_id, endpoint, window_start)
);

alter table public.backoffice_rate_limit enable row level security;
alter table public.backoffice_rate_limit force row level security;
-- Keine Policy: deny-by-default. Zugriff ausschliesslich ueber die RPC unten.

create index if not exists backoffice_rate_limit_actor_endpoint_idx
  on public.backoffice_rate_limit (actor_user_id, endpoint, window_start desc);

-- Atomar: reserviert das aktuelle Zeitfenster und zaehlt hoch. Gibt true zurueck,
-- solange das Limit nicht ueberschritten ist, sonst false (fail-closed beim Aufrufer).
create or replace function public.backoffice_consume_rate_limit(
  p_actor uuid,
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
  if p_actor is null or coalesce(btrim(p_endpoint), '') = ''
     or p_window_minutes is null or p_window_minutes <= 0
     or p_limit is null or p_limit < 0 then
    return false;
  end if;

  bucket := to_timestamp(floor(extract(epoch from now()) / (p_window_minutes * 60)) * (p_window_minutes * 60));

  insert into public.backoffice_rate_limit (actor_user_id, endpoint, window_start, count)
  values (p_actor, p_endpoint, bucket, 0)
  on conflict (actor_user_id, endpoint, window_start) do nothing;

  select count into current_count
  from public.backoffice_rate_limit
  where actor_user_id = p_actor
    and endpoint = p_endpoint
    and window_start = bucket
  for update;

  if current_count >= p_limit then
    return false;
  end if;

  update public.backoffice_rate_limit
  set count = count + 1,
      updated_at = now()
  where actor_user_id = p_actor
    and endpoint = p_endpoint
    and window_start = bucket;

  return true;
end $$;

-- Nur service_role (der Worker) darf konsumieren.
revoke all on function public.backoffice_consume_rate_limit(uuid, text, integer, integer) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.backoffice_consume_rate_limit(uuid, text, integer, integer) from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function public.backoffice_consume_rate_limit(uuid, text, integer, integer) from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.backoffice_consume_rate_limit(uuid, text, integer, integer) to service_role';
  end if;
end $$;
