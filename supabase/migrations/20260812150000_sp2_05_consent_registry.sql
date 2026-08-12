-- SP2-05: append-only, purpose-bound consent registry.
-- Request flags may express intent, but only this registry authorizes provider execution.

alter table public.consent_log
  add column if not exists scope jsonb not null default '{}'::jsonb,
  add column if not exists expires_at timestamptz,
  add column if not exists supersedes_id uuid references public.consent_log(id) on delete restrict;

alter table public.consent_log
  drop constraint if exists consent_log_type_check;

alter table public.consent_log
  add constraint consent_log_type_check
  check (
    type in (
      'avv',
      'privacy_policy',
      'wlan_scan',
      'ai_processing',
      'wlan_audit_scan',
      'wlan_ipv6_reachability_scan',
      'external_provider_checks',
      'hibp_email_leak_check'
    )
  );

alter table public.consent_log
  add constraint consent_log_registry_event_check
  check (
    (accepted = true and withdrawn_at is null)
    or (accepted = false and withdrawn_at is not null)
  ) not valid;

alter table public.consent_log validate constraint consent_log_registry_event_check;

alter table public.consent_log
  add constraint consent_log_registry_evidence_check
  check (
    type not in ('external_provider_checks', 'hibp_email_leak_check')
    or (
      jsonb_typeof(scope) = 'object'
      and scope <> '{}'::jsonb
      and (accepted = false or expires_at is not null)
    )
  ) not valid;

alter table public.consent_log validate constraint consent_log_registry_evidence_check;

create index if not exists consent_log_practice_type_latest_idx
on public.consent_log(practice_id, type, accepted_at desc, created_at desc, id desc);

create or replace function public.has_active_practice_consent(
  p_practice_id uuid,
  p_type text,
  p_version text,
  p_at timestamptz default now()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select
      consent_log.accepted
      and consent_log.withdrawn_at is null
      and consent_log.version = p_version
      and consent_log.expires_at is not null
      and consent_log.expires_at > p_at
    from public.consent_log
    where consent_log.practice_id = p_practice_id
      and consent_log.type = p_type
    order by consent_log.accepted_at desc, consent_log.created_at desc, consent_log.id desc
    limit 1
  ), false);
$$;

create or replace function public.list_practices_with_active_consent(
  p_type text,
  p_version text,
  p_at timestamptz default now()
)
returns table(practice_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select latest.practice_id
  from (
    select distinct on (consent_log.practice_id)
      consent_log.practice_id,
      consent_log.accepted,
      consent_log.withdrawn_at,
      consent_log.version,
      consent_log.expires_at
    from public.consent_log
    where consent_log.type = p_type
      and consent_log.practice_id is not null
    order by consent_log.practice_id, consent_log.accepted_at desc, consent_log.created_at desc, consent_log.id desc
  ) as latest
  where latest.accepted
    and latest.withdrawn_at is null
    and latest.version = p_version
    and latest.expires_at is not null
    and latest.expires_at > p_at;
$$;

revoke execute on function public.has_active_practice_consent(uuid, text, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.list_practices_with_active_consent(text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.has_active_practice_consent(uuid, text, text, timestamptz) to service_role;
grant execute on function public.list_practices_with_active_consent(text, text, timestamptz) to service_role;

create or replace function public.link_previous_consent_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.practice_id is null then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.practice_id::text || ':' || new.type, 0)
  );

  if new.supersedes_id is null then
    select consent_log.id
      into new.supersedes_id
    from public.consent_log
    where consent_log.practice_id = new.practice_id
      and consent_log.type = new.type
    order by consent_log.accepted_at desc, consent_log.created_at desc, consent_log.id desc
    limit 1;
  end if;

  return new;
end;
$$;

revoke execute on function public.link_previous_consent_event() from public, anon, authenticated, service_role;

drop trigger if exists consent_log_link_previous on public.consent_log;
create trigger consent_log_link_previous
before insert on public.consent_log
for each row execute function public.link_previous_consent_event();

create or replace function public.reject_consent_log_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'consent_log is append-only' using errcode = '42501';
end;
$$;

drop trigger if exists consent_log_append_only on public.consent_log;
create trigger consent_log_append_only
before update or delete on public.consent_log
for each row execute function public.reject_consent_log_mutation();

revoke update, delete, truncate on public.consent_log from public, anon, authenticated, service_role;
