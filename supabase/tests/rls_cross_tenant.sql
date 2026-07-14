create schema if not exists extensions;
create extension if not exists pgtap with schema extensions;

begin;

set local search_path = public, extensions;

select plan(37);

select set_config('request.jwt.claim.sub', '', false);
select set_config('request.jwt.claims', '{}', false);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values
  ('00000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'owner-a@example.test', 'x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-4000-8000-0000000000b1', 'authenticated', 'authenticated', 'owner-b@example.test', 'x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-4000-8000-0000000000c1', 'authenticated', 'authenticated', 'partner@example.test', 'x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;

insert into public.white_label_partners (id, owner_id, company_name)
values
  ('10000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a1', 'Partner A'),
  ('10000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000b1', 'Partner B')
on conflict (id) do nothing;

insert into public.practices (id, owner_id, name, domain, email, white_label_partner_id)
values
  ('20000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a1', 'Praxis A', 'a.example.test', 'a@example.test', '10000000-0000-4000-8000-0000000000a1'),
  ('20000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000b1', 'Praxis B', 'b.example.test', 'b@example.test', '10000000-0000-4000-8000-0000000000b1')
on conflict (id) do nothing;

insert into public.partner_practices (id, partner_id, practice_id, role, granted_by)
values ('30000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1', '20000000-0000-4000-8000-0000000000a1', 'viewer', '00000000-0000-4000-8000-0000000000a1')
on conflict (partner_id, practice_id) do nothing;

insert into public.security_checks (id, practice_id, type, score, results)
values
  ('40000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-0000000000a1', 'external', 80, '{}'::jsonb),
  ('40000000-0000-4000-8000-0000000000b1', '20000000-0000-4000-8000-0000000000b1', 'external', 50, '{}'::jsonb)
on conflict (id) do nothing;

insert into public.reports (id, practice_id, check_id, content)
values
  ('50000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-0000000000a1', '40000000-0000-4000-8000-0000000000a1', '{}'::jsonb),
  ('50000000-0000-4000-8000-0000000000b1', '20000000-0000-4000-8000-0000000000b1', '40000000-0000-4000-8000-0000000000b1', '{}'::jsonb)
on conflict (id) do nothing;

insert into public.monitoring_events (id, practice_id, type, severity, title, message)
values
  ('60000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-0000000000a1', 'monitoring_run', 'info', 'A', 'A'),
  ('60000000-0000-4000-8000-0000000000b1', '20000000-0000-4000-8000-0000000000b1', 'monitoring_run', 'info', 'B', 'B')
on conflict (id) do nothing;

insert into public.monitoring_snapshots (id, practice_id, source, score)
values
  ('70000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-0000000000a1', 'manual', 80),
  ('70000000-0000-4000-8000-0000000000b1', '20000000-0000-4000-8000-0000000000b1', 'manual', 50)
on conflict (id) do nothing;

insert into public.wlan_scans (id, practice_id, network_info)
values
  ('80000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-0000000000a1', '{}'::jsonb),
  ('80000000-0000-4000-8000-0000000000b1', '20000000-0000-4000-8000-0000000000b1', '{}'::jsonb)
on conflict (id) do nothing;

insert into public.external_check_usage (id, user_id, practice_id, usage_date, count)
values
  ('90000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-0000000000a1', current_date, 1),
  ('90000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-0000000000b1', current_date, 1)
on conflict (id) do nothing;

insert into public.ai_report_usage (id, user_id, practice_id, usage_date, count)
values
  ('91000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-0000000000a1', current_date, 1),
  ('91000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-0000000000b1', current_date, 1)
on conflict (id) do nothing;

insert into public.practice_access_audit (id, practice_id, user_id, action, resource)
values
  ('a0000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a1', 'access', 'test'),
  ('a0000000-0000-4000-8000-0000000000b1', '20000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1', 'access', 'test')
on conflict (id) do nothing;

insert into public.data_processing_agreements (id, practice_id, user_id, version)
values
  ('b0000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a1', 'rls-test-a'),
  ('b0000000-0000-4000-8000-0000000000b1', '20000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1', 'rls-test-b')
on conflict (practice_id, version) do nothing;

insert into public.deletion_requests (id, practice_id, user_id, status)
values
  ('c0000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a1', 'completed'),
  ('c0000000-0000-4000-8000-0000000000b1', '20000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1', 'completed')
on conflict (id) do nothing;

insert into public.consent_log (id, practice_id, user_id, type, version, accepted, accepted_at)
values
  ('d0000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a1', 'privacy_policy', 'rls-test-a', true, now()),
  ('d0000000-0000-4000-8000-0000000000b1', '20000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1', 'privacy_policy', 'rls-test-b', true, now())
on conflict (id) do nothing;

grant usage on schema public to authenticated;
grant select on
  public.white_label_partners,
  public.practices,
  public.partner_practices,
  public.security_checks,
  public.reports,
  public.monitoring_events,
  public.monitoring_snapshots,
  public.wlan_scans,
  public.external_check_usage,
  public.ai_report_usage,
  public.practice_access_audit,
  public.data_processing_agreements,
  public.deletion_requests,
  public.consent_log
to authenticated;
grant insert on public.practices, public.reports, public.wlan_scans to authenticated;

select ok(
  public.can_access_practice('00000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-0000000000a1', 'owner'),
  'direct practice owner satisfies owner role'
);

select ok(
  public.can_access_practice('00000000-0000-4000-8000-0000000000c1', '20000000-0000-4000-8000-0000000000a1', 'viewer'),
  'granted viewer partner satisfies viewer role'
);

select is(
  public.can_access_practice('00000000-0000-4000-8000-0000000000c1', '20000000-0000-4000-8000-0000000000a1', 'manager'),
  false,
  'viewer partner does not satisfy manager role'
);

select is(
  public.can_access_practice('00000000-0000-4000-8000-0000000000c1', '20000000-0000-4000-8000-0000000000b1', 'viewer'),
  false,
  'partner cannot pass can_access_practice with exchanged practice_id'
);

select lives_ok(
  $$select public.audit_partner_practice_access(
    '00000000-0000-4000-8000-0000000000c1',
    '20000000-0000-4000-8000-0000000000a1',
    'read',
    'report',
    '{"report_id":"50000000-0000-4000-8000-0000000000a1"}'::jsonb
  )$$,
  'service-side audit function logs granted partner access without error'
);

select is(
  (
    select count(*)
    from public.practice_access_audit
    where user_id = '00000000-0000-4000-8000-0000000000c1'
      and practice_id = '20000000-0000-4000-8000-0000000000a1'
      and action = 'read'
      and resource = 'report'
      and metadata->>'partner_role' = 'viewer'
  ),
  1::bigint,
  'partner audit access is written to practice_access_audit with role metadata'
);

select lives_ok(
  $$select public.audit_partner_practice_access(
    '00000000-0000-4000-8000-0000000000a1',
    '20000000-0000-4000-8000-0000000000a1',
    'read',
    'report',
    '{}'::jsonb
  )$$,
  'audit function ignores direct practice owner access'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);

select is((select count(*) from public.practices where id = '20000000-0000-4000-8000-0000000000a1'), 1::bigint, 'owner A can select own practice');
select is((select count(*) from public.security_checks where practice_id = '20000000-0000-4000-8000-0000000000a1'), 1::bigint, 'owner A can select own practice security checks');
select is((select count(*) from public.practices where id = '20000000-0000-4000-8000-0000000000b1'), 0::bigint, 'owner A cannot select practice B directly');
select is((select count(*) from public.security_checks where practice_id = '20000000-0000-4000-8000-0000000000b1'), 0::bigint, 'owner A cannot select practice B security checks');
select is((select count(*) from public.reports where practice_id = '20000000-0000-4000-8000-0000000000b1'), 0::bigint, 'owner A cannot select practice B reports');
select is((select count(*) from public.reports where id = '50000000-0000-4000-8000-0000000000b1'), 0::bigint, 'owner A cannot select practice B report by exchanged report_id');
select is((select count(*) from public.monitoring_events where practice_id = '20000000-0000-4000-8000-0000000000b1'), 0::bigint, 'owner A cannot select practice B monitoring events');
select is((select count(*) from public.monitoring_snapshots where practice_id = '20000000-0000-4000-8000-0000000000b1'), 0::bigint, 'owner A cannot select practice B monitoring snapshots');
select is((select count(*) from public.monitoring_snapshots where id = '70000000-0000-4000-8000-0000000000b1'), 0::bigint, 'owner A cannot select practice B snapshot by exchanged snapshot_id');
select is((select count(*) from public.wlan_scans where practice_id = '20000000-0000-4000-8000-0000000000b1'), 0::bigint, 'owner A cannot select practice B wlan scans');
select is((select count(*) from public.external_check_usage where practice_id = '20000000-0000-4000-8000-0000000000b1'), 0::bigint, 'owner A cannot select usage row for practice B even with matching user_id');
select is((select count(*) from public.ai_report_usage where practice_id = '20000000-0000-4000-8000-0000000000b1'), 0::bigint, 'owner A cannot select AI report usage row for practice B even with matching user_id');
select is((select count(*) from public.practice_access_audit where practice_id = '20000000-0000-4000-8000-0000000000b1'), 0::bigint, 'owner A cannot select audit row for practice B even with matching user_id');
select is((select count(*) from public.data_processing_agreements where practice_id = '20000000-0000-4000-8000-0000000000b1'), 0::bigint, 'owner A cannot select AVV row for practice B even with matching user_id');
select is((select count(*) from public.deletion_requests where practice_id = '20000000-0000-4000-8000-0000000000b1'), 0::bigint, 'owner A cannot select deletion request for practice B even with matching user_id');
select is((select count(*) from public.consent_log where practice_id = '20000000-0000-4000-8000-0000000000b1'), 0::bigint, 'owner A cannot select consent log for practice B');

select throws_ok(
  $$insert into public.reports (practice_id, check_id, content)
    values ('20000000-0000-4000-8000-0000000000a1', '40000000-0000-4000-8000-0000000000b1', '{}'::jsonb)$$,
  '42501',
  null,
  'owner A cannot insert report for practice A with practice B check_id'
);

select throws_ok(
  $$insert into public.wlan_scans (practice_id, network_info, client_sync_id)
    values ('20000000-0000-4000-8000-0000000000b1', '{}'::jsonb, 'foreign-practice-replay')$$,
  '42501',
  null,
  'owner A cannot sync WLAN scan with exchanged practice_id'
);

select lives_ok(
  $$insert into public.wlan_scans (practice_id, network_info, client_sync_id)
    values ('20000000-0000-4000-8000-0000000000a1', '{}'::jsonb, 'owner-a-replay-guard')$$,
  'owner A can sync WLAN scan for own practice'
);

select throws_ok(
  $$insert into public.wlan_scans (practice_id, network_info, client_sync_id)
    values ('20000000-0000-4000-8000-0000000000a1', '{}'::jsonb, 'owner-a-replay-guard')$$,
  '23505',
  null,
  'replayed WLAN sync with same client_sync_id is rejected server-side'
);

select throws_ok(
  $$insert into public.practices (owner_id, name, white_label_partner_id)
    values ('00000000-0000-4000-8000-0000000000a1', 'Bad tenant link', '10000000-0000-4000-8000-0000000000b1')$$,
  '42501',
  null,
  'owner A cannot attach a practice to partner B white-label profile'
);

select throws_ok(
  $$select public.consume_external_check_quota('00000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-0000000000b1', current_date, 3)$$,
  '42501',
  null,
  'authenticated users cannot invoke service-role quota RPC directly'
);

select throws_ok(
  $$select public.consume_ai_report_quota('00000000-0000-4000-8000-0000000000a1', '20000000-0000-4000-8000-0000000000b1', current_date, 3)$$,
  '42501',
  null,
  'authenticated users cannot invoke service-role AI report quota RPC directly'
);

select throws_ok(
  $$select public.audit_partner_practice_access(
    '00000000-0000-4000-8000-0000000000c1',
    '20000000-0000-4000-8000-0000000000a1',
    'read',
    'report',
    '{}'::jsonb
  )$$,
  '42501',
  null,
  'authenticated users cannot invoke partner access audit RPC directly'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000c1', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c1","role":"authenticated"}', true);

select is((select count(*) from public.security_checks where practice_id = '20000000-0000-4000-8000-0000000000a1'), 1::bigint, 'granted partner can select practice A checks');
select is((select count(*) from public.reports where id = '50000000-0000-4000-8000-0000000000a1'), 1::bigint, 'granted partner can select practice A report by report_id');
select is((select count(*) from public.monitoring_snapshots where id = '70000000-0000-4000-8000-0000000000a1'), 1::bigint, 'granted partner can select practice A snapshot by snapshot_id');
select is((select count(*) from public.security_checks where practice_id = '20000000-0000-4000-8000-0000000000b1'), 0::bigint, 'partner cannot select ungranted practice B checks');
select is((select count(*) from public.reports where id = '50000000-0000-4000-8000-0000000000b1'), 0::bigint, 'partner cannot select ungranted practice B report by exchanged report_id');
select is((select count(*) from public.monitoring_snapshots where id = '70000000-0000-4000-8000-0000000000b1'), 0::bigint, 'partner cannot select ungranted practice B snapshot by exchanged snapshot_id');

select * from finish();

rollback;
