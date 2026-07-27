-- B1b: six-month retention, bounded irreversible anonymization and legal hold
-- for append-only backoffice audit events.

alter table public.backoffice_audit_events
  add column if not exists retention_until timestamptz,
  add column if not exists legal_hold_until timestamptz,
  add column if not exists legal_hold_reason text,
  add column if not exists legal_hold_set_at timestamptz,
  add column if not exists legal_hold_set_by uuid references auth.users(id) on delete set null,
  add column if not exists anonymized_at timestamptz;

update public.backoffice_audit_events
set retention_until = created_at + interval '183 days'
where retention_until is null;

alter table public.backoffice_audit_events
  alter column retention_until set default (now() + interval '183 days'),
  alter column retention_until set not null;

alter table public.backoffice_audit_events
  drop constraint if exists backoffice_audit_legal_hold_documented,
  add constraint backoffice_audit_legal_hold_documented check (
    legal_hold_until is null
    or (
      legal_hold_reason is not null
      and length(btrim(legal_hold_reason)) > 0
      and legal_hold_set_at is not null
    )
  );

create index if not exists backoffice_audit_retention_pending_idx
  on public.backoffice_audit_events (retention_until, created_at)
  where anonymized_at is null;

create or replace function public.anonymize_backoffice_audit_events(
  retention_days integer default 183,
  batch_size integer default 500
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  anonymized_count integer;
begin
  if retention_days < 183 or retention_days > 3650 then
    raise exception 'retention_days must be between 183 and 3650';
  end if;
  if batch_size < 1 or batch_size > 5000 then
    raise exception 'batch_size must be between 1 and 5000';
  end if;

  with eligible as (
    select id
    from public.backoffice_audit_events
    where anonymized_at is null
      and retention_until <= now()
      and created_at < now() - make_interval(days => retention_days)
      and (legal_hold_until is null or legal_hold_until <= now())
    order by retention_until, id
    for update skip locked
    limit batch_size
  )
  update public.backoffice_audit_events event
  set actor_user_id = null,
      action = 'anonymized',
      target_type = 'anonymized',
      target_id = null,
      practice_id = null,
      request_id = null,
      metadata = jsonb_build_object('anonymized', true),
      created_at = date_trunc('day', event.created_at),
      legal_hold_until = null,
      legal_hold_reason = null,
      legal_hold_set_at = null,
      legal_hold_set_by = null,
      anonymized_at = now()
  from eligible
  where event.id = eligible.id;

  get diagnostics anonymized_count = row_count;
  return anonymized_count;
end;
$$;

revoke all on function public.anonymize_backoffice_audit_events(integer, integer) from public;
revoke all on function public.anonymize_backoffice_audit_events(integer, integer) from anon;
revoke all on function public.anonymize_backoffice_audit_events(integer, integer) from authenticated;
grant execute on function public.anonymize_backoffice_audit_events(integer, integer) to service_role;

