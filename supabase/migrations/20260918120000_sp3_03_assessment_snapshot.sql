-- SP3-03: authoritative, immutable, multi-source assessment snapshots.
--
-- Public columns contain only D1 evaluation metadata. The complete v1 contract,
-- including control facts and any D2 evidence references, is stored solely in
-- encrypted_payload. A SHA-256 digest proves integrity after decryption but is
-- explicitly not an authenticity signature.

create table public.assessment_snapshots (
  id uuid primary key,
  practice_id uuid not null references public.practices(id) on delete cascade,
  schema_version text not null,
  assessment_profile text not null,
  captured_at timestamptz not null,
  facts_version text not null,
  scoring_version text not null,
  control_catalog_version text not null,
  policy_pack_version text not null,
  engine_version text not null,
  posture text not null,
  coverage_score numeric(5,2) not null,
  confidence_score numeric(5,2) not null,
  freshness text not null,
  review_status text not null,
  technical_score numeric(5,2) not null,
  domain_scores jsonb not null,
  gating_reason_codes text[] not null default '{}',
  component_count integer not null,
  payload_sha256 text not null,
  authenticity text not null,
  signature_algorithm text,
  signature_key_id text,
  signature text,
  encrypted_payload jsonb not null,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  constraint assessment_snapshots_id_practice_unique unique (id, practice_id),
  constraint assessment_snapshots_idempotency_unique unique (practice_id, idempotency_key),
  constraint assessment_snapshots_schema_version_check check (schema_version = '1.0.0'),
  constraint assessment_snapshots_profile_check check (assessment_profile in ('general', 'health')),
  constraint assessment_snapshots_posture_check check (posture in ('rot', 'gelb', 'grün')),
  constraint assessment_snapshots_percentage_check check (
    coverage_score between 0 and 100
    and confidence_score between 0 and 100
    and technical_score between 0 and 100
  ),
  constraint assessment_snapshots_freshness_check check (freshness in ('fresh', 'stale', 'unknown')),
  constraint assessment_snapshots_review_status_check check (review_status in ('ok', 'review_required')),
  constraint assessment_snapshots_component_count_check check (component_count > 0),
  constraint assessment_snapshots_hash_check check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  constraint assessment_snapshots_authenticity_check check (
    (authenticity = 'hash_only' and signature_algorithm is null and signature_key_id is null and signature is null)
    or
    (authenticity = 'signed' and signature_algorithm = 'ed25519'
      and length(signature_key_id) between 1 and 128 and length(signature) between 1 and 512)
  ),
  constraint assessment_snapshots_domain_scores_check check (
    jsonb_typeof(domain_scores) = 'object'
    and domain_scores ?& array['access_control', 'backup', 'email_security', 'network', 'dsgvo', 'updates']
  ),
  constraint assessment_snapshots_encrypted_payload_check check (
    jsonb_typeof(encrypted_payload) = 'object'
    and encrypted_payload ?& array['envelope_version', 'alg', 'key_version', 'iv', 'ciphertext', 'aad_sha256']
  ),
  constraint assessment_snapshots_idempotency_key_check check (length(idempotency_key) between 1 and 128)
);

create index assessment_snapshots_practice_captured_at_idx
on public.assessment_snapshots (practice_id, captured_at desc);

create table public.assessment_snapshot_components (
  id uuid primary key,
  snapshot_id uuid not null,
  practice_id uuid not null,
  component_order integer not null,
  kind text not null,
  source_id text not null,
  source_version text not null,
  collection_status text not null,
  freshness text not null,
  observed_at timestamptz not null,
  expires_at timestamptz,
  payload_sha256 text not null,
  control_ids text[] not null default '{}',
  created_at timestamptz not null default now(),
  constraint assessment_snapshot_components_snapshot_fkey
    foreign key (snapshot_id, practice_id)
    references public.assessment_snapshots(id, practice_id)
    on delete cascade,
  constraint assessment_snapshot_components_order_unique unique (snapshot_id, component_order),
  constraint assessment_snapshot_components_kind_check check (
    kind in ('questionnaire', 'external_monitoring', 'wlan', 'mobile', 'desktop_agent', 'router', 'manual_attestation')
  ),
  constraint assessment_snapshot_components_collection_check check (
    collection_status in ('collected', 'not_checked', 'unsupported', 'permission_denied', 'timeout', 'error', 'unavailable')
  ),
  constraint assessment_snapshot_components_freshness_check check (freshness in ('fresh', 'stale', 'unknown')),
  constraint assessment_snapshot_components_time_check check (expires_at is null or expires_at >= observed_at),
  constraint assessment_snapshot_components_hash_check check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  constraint assessment_snapshot_components_source_check check (length(source_id) between 1 and 256)
);

create index assessment_snapshot_components_snapshot_idx
on public.assessment_snapshot_components (snapshot_id, component_order);

create table public.assessment_snapshot_score_explanations (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null,
  practice_id uuid not null,
  explanation_order integer not null,
  code text not null,
  severity text not null,
  effect text not null,
  category text,
  control_ids text[] not null default '{}',
  points_delta numeric,
  created_at timestamptz not null default now(),
  constraint assessment_snapshot_explanations_snapshot_fkey
    foreign key (snapshot_id, practice_id)
    references public.assessment_snapshots(id, practice_id)
    on delete cascade,
  constraint assessment_snapshot_explanations_order_unique unique (snapshot_id, explanation_order),
  constraint assessment_snapshot_explanations_code_unique unique (snapshot_id, code),
  constraint assessment_snapshot_explanations_severity_check check (severity in ('info', 'warning', 'critical')),
  constraint assessment_snapshot_explanations_effect_check check (
    effect in ('blocks_green', 'reduces_score', 'coverage_only', 'informational')
  ),
  constraint assessment_snapshot_explanations_category_check check (
    category is null or category in ('access_control', 'backup', 'email_security', 'network', 'dsgvo', 'updates')
  ),
  constraint assessment_snapshot_explanations_code_check check (code ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$')
);

create index assessment_snapshot_explanations_snapshot_idx
on public.assessment_snapshot_score_explanations (snapshot_id, explanation_order);

alter table public.assessment_snapshots enable row level security;
alter table public.assessment_snapshots force row level security;
alter table public.assessment_snapshot_components enable row level security;
alter table public.assessment_snapshot_components force row level security;
alter table public.assessment_snapshot_score_explanations enable row level security;
alter table public.assessment_snapshot_score_explanations force row level security;

create policy "assessment snapshots are tenant readable"
on public.assessment_snapshots for select
using (public.current_user_can_access_practice(practice_id, 'viewer'));

create policy "assessment snapshot components are tenant readable"
on public.assessment_snapshot_components for select
using (
  public.current_user_can_access_practice(practice_id, 'viewer')
  and exists (
    select 1 from public.assessment_snapshots
    where assessment_snapshots.id = assessment_snapshot_components.snapshot_id
      and assessment_snapshots.practice_id = assessment_snapshot_components.practice_id
  )
);

create policy "assessment snapshot explanations are tenant readable"
on public.assessment_snapshot_score_explanations for select
using (
  public.current_user_can_access_practice(practice_id, 'viewer')
  and exists (
    select 1 from public.assessment_snapshots
    where assessment_snapshots.id = assessment_snapshot_score_explanations.snapshot_id
      and assessment_snapshots.practice_id = assessment_snapshot_score_explanations.practice_id
  )
);

revoke all on public.assessment_snapshots from public, anon, authenticated, service_role;
revoke all on public.assessment_snapshot_components from public, anon, authenticated, service_role;
revoke all on public.assessment_snapshot_score_explanations from public, anon, authenticated, service_role;
grant select (
  id, practice_id, schema_version, assessment_profile, captured_at,
  facts_version, scoring_version, control_catalog_version, policy_pack_version, engine_version,
  posture, coverage_score, confidence_score, freshness, review_status,
  technical_score, domain_scores, gating_reason_codes, component_count,
  payload_sha256, authenticity, signature_algorithm, signature_key_id, signature, created_at
) on public.assessment_snapshots to authenticated;
grant select on public.assessment_snapshots to service_role;
grant select on public.assessment_snapshot_components to authenticated, service_role;
grant select on public.assessment_snapshot_score_explanations to authenticated, service_role;

create or replace function public.reject_assessment_snapshot_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'assessment snapshots are immutable' using errcode = '42501';
end;
$$;

revoke execute on function public.reject_assessment_snapshot_mutation() from public, anon, authenticated, service_role;

create trigger assessment_snapshots_immutable
before update on public.assessment_snapshots
for each row execute function public.reject_assessment_snapshot_mutation();

create trigger assessment_snapshot_components_immutable
before update on public.assessment_snapshot_components
for each row execute function public.reject_assessment_snapshot_mutation();

create trigger assessment_snapshot_explanations_immutable
before update on public.assessment_snapshot_score_explanations
for each row execute function public.reject_assessment_snapshot_mutation();

create or replace function public.persist_assessment_snapshot(
  p_snapshot jsonb,
  p_encrypted_payload jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_snapshot_id uuid;
  v_practice_id uuid;
  v_payload_sha256 text;
  v_existing public.assessment_snapshots%rowtype;
  v_component jsonb;
  v_control jsonb;
  v_explanation jsonb;
  v_ordinality bigint;
  v_component_count integer;
  v_signature jsonb;
begin
  if jsonb_typeof(p_snapshot) <> 'object' then
    raise exception 'assessment_snapshot_invalid' using errcode = '22023';
  end if;

  begin
    v_snapshot_id := (p_snapshot ->> 'snapshot_id')::uuid;
    v_practice_id := (p_snapshot ->> 'practice_id')::uuid;
  exception when invalid_text_representation then
    raise exception 'assessment_snapshot_invalid_identity' using errcode = '22023';
  end;

  if jsonb_typeof(p_snapshot -> 'components') <> 'array' then
    raise exception 'assessment_snapshot_invalid_contract' using errcode = '22023';
  end if;

  v_payload_sha256 := p_snapshot #>> '{integrity,payload_sha256}';
  v_component_count := jsonb_array_length(p_snapshot -> 'components');
  v_signature := p_snapshot #> '{integrity,signature}';

  if p_snapshot ->> 'schema_version' <> '1.0.0'
     or not (p_snapshot ?& array[
       'schema_version', 'snapshot_id', 'practice_id', 'captured_at', 'assessment_profile',
       'versions', 'posture', 'evidence', 'technical_scores', 'components', 'controls',
       'score_explanations', 'integrity'
     ])
     or p_snapshot - array[
       'schema_version', 'snapshot_id', 'practice_id', 'captured_at', 'assessment_profile',
       'versions', 'posture', 'evidence', 'technical_scores', 'components', 'controls',
       'score_explanations', 'integrity'
     ] <> '{}'::jsonb
     or v_component_count < 1
     or jsonb_typeof(p_snapshot -> 'controls') <> 'array'
     or jsonb_typeof(p_snapshot -> 'score_explanations') <> 'array'
     or (p_snapshot #> '{versions}') - array['facts', 'scoring', 'control_catalog', 'policy_pack', 'engine'] <> '{}'::jsonb
     or (p_snapshot #> '{posture}') - array['ampel', 'gating_reason_codes'] <> '{}'::jsonb
     or (p_snapshot #> '{evidence}') - array['coverage_score', 'confidence_score', 'freshness', 'review_status'] <> '{}'::jsonb
     or (p_snapshot #> '{technical_scores}') - array['overall', 'by_category'] <> '{}'::jsonb
     or (p_snapshot #> '{technical_scores,by_category}') - array[
       'access_control', 'backup', 'email_security', 'network', 'dsgvo', 'updates'
     ] <> '{}'::jsonb
     or (p_snapshot #> '{integrity}') - array['payload_sha256', 'authenticity', 'signature'] <> '{}'::jsonb
     or v_payload_sha256 !~ '^[0-9a-f]{64}$'
     or p_idempotency_key is null
     or length(p_idempotency_key) not between 1 and 128
     or jsonb_typeof(p_encrypted_payload) <> 'object'
     or not (p_encrypted_payload ?& array['envelope_version', 'alg', 'key_version', 'iv', 'ciphertext', 'aad_sha256'])
     or (
       p_snapshot #>> '{posture,ampel}' = 'grün'
       and (
         jsonb_array_length(p_snapshot #> '{posture,gating_reason_codes}') > 0
         or p_snapshot #>> '{evidence,freshness}' <> 'fresh'
         or p_snapshot #>> '{evidence,review_status}' <> 'ok'
       )
     )
  then
    raise exception 'assessment_snapshot_invalid_contract' using errcode = '22023';
  end if;

  select * into v_existing
  from public.assessment_snapshots
  where practice_id = v_practice_id and idempotency_key = p_idempotency_key;

  if found then
    if v_existing.payload_sha256 <> v_payload_sha256 then
      raise exception 'assessment_snapshot_idempotency_conflict' using errcode = '23505';
    end if;
    return jsonb_build_object('snapshot_id', v_existing.id, 'payload_sha256', v_existing.payload_sha256);
  end if;

  begin
    insert into public.assessment_snapshots (
      id, practice_id, schema_version, assessment_profile, captured_at,
      facts_version, scoring_version, control_catalog_version, policy_pack_version, engine_version,
      posture, coverage_score, confidence_score, freshness, review_status,
      technical_score, domain_scores, gating_reason_codes, component_count,
      payload_sha256, authenticity, signature_algorithm, signature_key_id, signature,
      encrypted_payload, idempotency_key
    ) values (
      v_snapshot_id,
      v_practice_id,
      p_snapshot ->> 'schema_version',
      p_snapshot ->> 'assessment_profile',
      (p_snapshot ->> 'captured_at')::timestamptz,
      p_snapshot #>> '{versions,facts}',
      p_snapshot #>> '{versions,scoring}',
      p_snapshot #>> '{versions,control_catalog}',
      p_snapshot #>> '{versions,policy_pack}',
      p_snapshot #>> '{versions,engine}',
      p_snapshot #>> '{posture,ampel}',
      (p_snapshot #>> '{evidence,coverage_score}')::numeric,
      (p_snapshot #>> '{evidence,confidence_score}')::numeric,
      p_snapshot #>> '{evidence,freshness}',
      p_snapshot #>> '{evidence,review_status}',
      (p_snapshot #>> '{technical_scores,overall}')::numeric,
      p_snapshot #> '{technical_scores,by_category}',
      array(select jsonb_array_elements_text(p_snapshot #> '{posture,gating_reason_codes}')),
      v_component_count,
      v_payload_sha256,
      p_snapshot #>> '{integrity,authenticity}',
      case when v_signature = 'null'::jsonb then null else v_signature ->> 'algorithm' end,
      case when v_signature = 'null'::jsonb then null else v_signature ->> 'key_id' end,
      case when v_signature = 'null'::jsonb then null else v_signature ->> 'value' end,
      p_encrypted_payload,
      p_idempotency_key
    );

    for v_component, v_ordinality in
      select value, ordinality
      from jsonb_array_elements(p_snapshot -> 'components') with ordinality
    loop
      if jsonb_typeof(v_component) <> 'object'
         or not (v_component ?& array[
           'id', 'kind', 'source_id', 'source_version', 'collection_status', 'freshness',
           'observed_at', 'expires_at', 'payload_sha256', 'control_ids'
         ])
         or v_component - array[
           'id', 'kind', 'source_id', 'source_version', 'collection_status', 'freshness',
           'observed_at', 'expires_at', 'payload_sha256', 'control_ids'
         ] <> '{}'::jsonb
         or jsonb_typeof(v_component -> 'control_ids') <> 'array'
         or (v_component ->> 'observed_at')::timestamptz > (p_snapshot ->> 'captured_at')::timestamptz
         or (v_component ->> 'collection_status' <> 'collected' and v_component ->> 'freshness' <> 'unknown')
      then
        raise exception 'assessment_snapshot_invalid_component' using errcode = '22023';
      end if;

      insert into public.assessment_snapshot_components (
        id, snapshot_id, practice_id, component_order, kind, source_id, source_version,
        collection_status, freshness, observed_at, expires_at, payload_sha256, control_ids
      ) values (
        (v_component ->> 'id')::uuid,
        v_snapshot_id,
        v_practice_id,
        v_ordinality::integer,
        v_component ->> 'kind',
        v_component ->> 'source_id',
        v_component ->> 'source_version',
        v_component ->> 'collection_status',
        v_component ->> 'freshness',
        (v_component ->> 'observed_at')::timestamptz,
        nullif(v_component ->> 'expires_at', '')::timestamptz,
        v_component ->> 'payload_sha256',
        array(select jsonb_array_elements_text(v_component -> 'control_ids'))
      );
    end loop;

    for v_control in
      select value from jsonb_array_elements(p_snapshot -> 'controls')
    loop
      if jsonb_typeof(v_control) <> 'object'
         or not (v_control ?& array[
           'rule_id', 'category', 'applicability', 'status', 'collection_status',
           'points_earned', 'points_max'
         ])
         or v_control - array[
           'rule_id', 'category', 'applicability', 'status', 'collection_status',
           'points_earned', 'points_max'
         ] <> '{}'::jsonb
         or (v_control ->> 'points_earned')::numeric < 0
         or (v_control ->> 'points_max')::numeric < 0
         or (v_control ->> 'points_earned')::numeric > (v_control ->> 'points_max')::numeric
         or v_control ->> 'category' not in ('access_control', 'backup', 'email_security', 'network', 'dsgvo', 'updates')
         or v_control ->> 'applicability' not in ('applicable', 'not_applicable', 'conditional')
         or v_control ->> 'status' not in ('met', 'partially_met', 'not_met', 'unknown', 'not_applicable')
         or v_control ->> 'collection_status' not in ('collected', 'not_checked', 'unsupported', 'permission_denied', 'timeout', 'error', 'unavailable')
         or (v_control ->> 'applicability' = 'conditional' and v_control ->> 'status' <> 'unknown')
         or (v_control ->> 'applicability' = 'not_applicable' and v_control ->> 'status' <> 'not_applicable')
         or (v_control ->> 'applicability' <> 'not_applicable' and v_control ->> 'status' = 'not_applicable')
         or (
           v_control ->> 'collection_status' <> 'collected'
           and v_control ->> 'status' not in ('unknown', 'not_applicable')
         )
      then
        raise exception 'assessment_snapshot_invalid_control' using errcode = '22023';
      end if;
    end loop;

    for v_explanation, v_ordinality in
      select value, ordinality
      from jsonb_array_elements(p_snapshot -> 'score_explanations') with ordinality
    loop
      if jsonb_typeof(v_explanation) <> 'object'
         or not (v_explanation ?& array[
           'code', 'severity', 'effect', 'category', 'control_ids', 'points_delta'
         ])
         or v_explanation - array[
           'code', 'severity', 'effect', 'category', 'control_ids', 'points_delta'
         ] <> '{}'::jsonb
         or jsonb_typeof(v_explanation -> 'control_ids') <> 'array'
      then
        raise exception 'assessment_snapshot_invalid_explanation' using errcode = '22023';
      end if;

      insert into public.assessment_snapshot_score_explanations (
        snapshot_id, practice_id, explanation_order, code, severity, effect,
        category, control_ids, points_delta
      ) values (
        v_snapshot_id,
        v_practice_id,
        v_ordinality::integer,
        v_explanation ->> 'code',
        v_explanation ->> 'severity',
        v_explanation ->> 'effect',
        nullif(v_explanation ->> 'category', ''),
        array(select jsonb_array_elements_text(v_explanation -> 'control_ids')),
        nullif(v_explanation ->> 'points_delta', '')::numeric
      );
    end loop;
  exception when unique_violation then
    select * into v_existing
    from public.assessment_snapshots
    where practice_id = v_practice_id and idempotency_key = p_idempotency_key;
    if not found or v_existing.payload_sha256 <> v_payload_sha256 then raise; end if;
    return jsonb_build_object('snapshot_id', v_existing.id, 'payload_sha256', v_existing.payload_sha256);
  end;

  return jsonb_build_object('snapshot_id', v_snapshot_id, 'payload_sha256', v_payload_sha256);
exception
  when invalid_text_representation or datetime_field_overflow or numeric_value_out_of_range then
    raise exception 'assessment_snapshot_invalid_contract' using errcode = '22023';
end;
$$;

revoke execute on function public.persist_assessment_snapshot(jsonb, jsonb, text)
from public, anon, authenticated;
grant execute on function public.persist_assessment_snapshot(jsonb, jsonb, text)
to service_role;

-- Report manifests remain a report-specific derivative. This nullable binding
-- enables a staged cutover without rewriting historical SP2-04 artifacts.
alter table public.assessment_manifests
add column assessment_snapshot_id uuid;

alter table public.assessment_manifests
add constraint assessment_manifests_snapshot_practice_fkey
foreign key (assessment_snapshot_id, practice_id)
references public.assessment_snapshots(id, practice_id)
on delete set null (assessment_snapshot_id);

-- Snapshots contain assessment evidence and are erased with the practice. The
-- retained legal receipt records the collection name, never its contents.
create or replace function public.complete_privacy_deletion(
  p_practice_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deletion_id uuid := gen_random_uuid();
  v_now timestamptz := now();
  v_legal_retention_until timestamptz := v_now + interval '6 years';
  v_monitoring_retention_until timestamptz := v_now + interval '1 year';
  v_report jsonb;
begin
  delete from public.inventory_items where practice_id = p_practice_id;
  delete from public.inventory_known_devices where practice_id = p_practice_id;
  delete from public.inventory_access_points where practice_id = p_practice_id;
  delete from public.router_wifi_configurations where practice_id = p_practice_id;
  delete from public.router_firewall_rules where practice_id = p_practice_id;
  delete from public.monitoring_targets where practice_id = p_practice_id;
  delete from public.wlan_scans where practice_id = p_practice_id;
  delete from public.assessment_snapshots where practice_id = p_practice_id;
  delete from public.assessment_manifests where practice_id = p_practice_id;

  update public.practices
  set name = '[GELOESCHT]', domain = null, email = null, deleted_at = v_now
  where id = p_practice_id;

  update public.security_checks
  set results = jsonb_build_object('anonymized', true),
      encrypted_payload = '{}'::jsonb,
      anonymized_at = v_now
  where practice_id = p_practice_id;

  update public.reports
  set content = jsonb_build_object('anonymized', true),
      encrypted_content = '{}'::jsonb,
      report_manifest = null,
      report_manifest_sha256 = null,
      anonymized_at = v_now
  where practice_id = p_practice_id;

  update public.monitoring_events
  set title = '[GELOESCHT]', message = '', details = '{}'::jsonb, anonymized_at = v_now
  where practice_id = p_practice_id and anonymized_at is null;

  update public.monitoring_snapshots
  set ssl = '{}'::jsonb, email_security = '{}'::jsonb, devices = '{}'::jsonb,
      checks = '{}'::jsonb, encrypted_checks = '{}'::jsonb, payload_sha256 = null,
      anonymized_at = v_now
  where practice_id = p_practice_id and anonymized_at is null;

  v_report := jsonb_build_object(
    'deletion_id', v_deletion_id,
    'practice_id', p_practice_id,
    'requested_at', v_now,
    'state', 'completed',
    'immediate_deletions', jsonb_build_array(
      'personal_data',
      'wlan_scans',
      'assessment_snapshots',
      'assessment_manifests',
      'inventory_items',
      'inventory_known_devices',
      'inventory_access_points',
      'router_wifi_configurations',
      'router_firewall_rules',
      'monitoring_targets'
    ),
    'anonymizations', jsonb_build_array(
      'security_checks', 'reports', 'monitoring_events', 'monitoring_snapshots'
    ),
    'retained_for_legal', jsonb_build_array(
      'practice_access_audit', 'deletion_requests', 'consent_log', 'data_processing_agreements'
    ),
    'retention_until', v_legal_retention_until,
    'monitoring_retention_until', v_monitoring_retention_until,
    'completed_by', 'system'
  );

  insert into public.deletion_requests (
    id, practice_id, user_id, requested_by, status, state, requested_at, completed_at, report, metadata
  ) values (
    v_deletion_id, p_practice_id, p_user_id, p_user_id, 'completed', 'completed', v_now, v_now, v_report,
    jsonb_build_object('reason', 'user_requested_erasure')
  );

  return v_report;
end;
$$;

revoke execute on function public.complete_privacy_deletion(uuid, uuid) from public, anon, authenticated;
grant execute on function public.complete_privacy_deletion(uuid, uuid) to service_role;
