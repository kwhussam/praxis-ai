with user_practice_access as (
  select
    practices.id as practice_id,
    practices.owner_id as user_id
  from public.practices
  where practices.owner_id is not null

  union

  select
    partner_practices.practice_id,
    partner_practices.partner_id as user_id
  from public.partner_practices
)
select *
from (
  select
    'reports.check_id belongs to a different practice_id' as issue,
    'reports' as table_name,
    reports.id as record_id,
    reports.practice_id,
    reports.check_id as related_id,
    jsonb_build_object(
      'report_practice_id', reports.practice_id,
      'check_practice_id', security_checks.practice_id
    ) as details
  from public.reports
  join public.security_checks
    on security_checks.id = reports.check_id
  where reports.check_id is not null
    and security_checks.practice_id is distinct from reports.practice_id

  union all

  select
    'practices.white_label_partner_id is owned by a different user' as issue,
    'practices' as table_name,
    practices.id as record_id,
    practices.id as practice_id,
    practices.white_label_partner_id as related_id,
    jsonb_build_object(
      'practice_owner_id', practices.owner_id,
      'white_label_partner_owner_id', white_label_partners.owner_id
    ) as details
  from public.practices
  join public.white_label_partners
    on white_label_partners.id = practices.white_label_partner_id
  where practices.white_label_partner_id is not null
    and white_label_partners.owner_id is distinct from practices.owner_id

  union all

  select
    'external_check_usage.user_id has no owner/partner access to practice_id' as issue,
    'external_check_usage' as table_name,
    external_check_usage.id as record_id,
    external_check_usage.practice_id,
    external_check_usage.user_id as related_id,
    jsonb_build_object('user_id', external_check_usage.user_id) as details
  from public.external_check_usage
  where external_check_usage.user_id is null
    or not exists (
      select 1
      from user_practice_access
      where user_practice_access.practice_id = external_check_usage.practice_id
        and user_practice_access.user_id = external_check_usage.user_id
    )

  union all

  select
    'practice_access_audit.user_id has no owner/partner access to practice_id' as issue,
    'practice_access_audit' as table_name,
    practice_access_audit.id as record_id,
    practice_access_audit.practice_id,
    practice_access_audit.user_id as related_id,
    jsonb_build_object('user_id', practice_access_audit.user_id) as details
  from public.practice_access_audit
  where practice_access_audit.practice_id is not null
    and (
      practice_access_audit.user_id is null
      or not exists (
        select 1
        from user_practice_access
        where user_practice_access.practice_id = practice_access_audit.practice_id
          and user_practice_access.user_id = practice_access_audit.user_id
      )
    )

  union all

  select
    'data_processing_agreements.user_id has no owner/partner access to practice_id' as issue,
    'data_processing_agreements' as table_name,
    data_processing_agreements.id as record_id,
    data_processing_agreements.practice_id,
    data_processing_agreements.user_id as related_id,
    jsonb_build_object('user_id', data_processing_agreements.user_id) as details
  from public.data_processing_agreements
  where data_processing_agreements.user_id is null
    or not exists (
      select 1
      from user_practice_access
      where user_practice_access.practice_id = data_processing_agreements.practice_id
        and user_practice_access.user_id = data_processing_agreements.user_id
    )

  union all

  select
    'deletion_requests.user_id has no owner/partner access to practice_id' as issue,
    'deletion_requests' as table_name,
    deletion_requests.id as record_id,
    deletion_requests.practice_id,
    deletion_requests.user_id as related_id,
    jsonb_build_object(
      'user_id', deletion_requests.user_id,
      'requested_by', deletion_requests.requested_by
    ) as details
  from public.deletion_requests
  where deletion_requests.practice_id is not null
    and (
      deletion_requests.user_id is null
      or not exists (
        select 1
        from user_practice_access
        where user_practice_access.practice_id = deletion_requests.practice_id
          and user_practice_access.user_id = deletion_requests.user_id
      )
    )
) as tenant_preflight_issues
order by table_name, record_id;
