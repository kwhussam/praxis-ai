create schema if not exists extensions;
create extension if not exists pgtap with schema extensions;

begin;
set local search_path = public, extensions;

select plan(16);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values
  ('00000000-0000-4000-8000-0000000000e8', 'authenticated', 'authenticated', 'audit-actor@example.test', 'x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-4000-8000-0000000000e9', 'authenticated', 'authenticated', 'hold-actor@example.test', 'x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;

insert into public.practices (id, owner_id, name)
values ('20000000-0000-4000-8000-0000000000e8', '00000000-0000-4000-8000-0000000000e8', 'Audit Retention Test')
on conflict (id) do nothing;

insert into public.backoffice_audit_events (
  id, actor_user_id, action, target_type, target_id, practice_id, request_id,
  metadata, created_at, retention_until, legal_hold_until, legal_hold_reason,
  legal_hold_set_at, legal_hold_set_by
)
values
  ('e2000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000e8', 'practice.update', 'practice', '00000000-0000-4000-8000-0000000000e8', '20000000-0000-4000-8000-0000000000e8', 'request-person-1', '{"ip":"192.0.2.10","user_agent":"Named Browser","email":"person@example.test"}', now() - interval '200 days' + interval '12 hours', now() - interval '17 days', null, null, null, null),
  ('e2000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-0000000000e8', 'practice.read', 'practice', '00000000-0000-4000-8000-0000000000e8', '20000000-0000-4000-8000-0000000000e8', 'request-person-2', '{"email":"held@example.test"}', now() - interval '200 days', now() - interval '17 days', now() + interval '30 days', 'Laufender Sicherheitsvorfall', now(), '00000000-0000-4000-8000-0000000000e9'),
  ('e2000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-0000000000e8', 'practice.read', 'practice', '00000000-0000-4000-8000-0000000000e8', '20000000-0000-4000-8000-0000000000e8', 'request-person-3', '{"email":"recent@example.test"}', now() - interval '30 days', now() + interval '153 days', null, null, null, null),
  ('e2000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-0000000000e8', 'practice.update', 'practice', '00000000-0000-4000-8000-0000000000e8', '20000000-0000-4000-8000-0000000000e8', 'request-person-4', '{"email":"second@example.test"}', now() - interval '200 days', now() - interval '17 days', null, null, null, null);

select throws_ok(
  $$select public.anonymize_backoffice_audit_events(182, 500)$$,
  'P0001', null, 'retention shorter than six months is rejected'
);
select throws_ok(
  $$select public.anonymize_backoffice_audit_events(183, 0)$$,
  'P0001', null, 'invalid batch size is rejected'
);

select is(public.anonymize_backoffice_audit_events(183, 1), 1, 'bounded batch anonymizes only one eligible event');
select is((select count(*) from public.backoffice_audit_events where id in ('e2000000-0000-4000-8000-000000000001', 'e2000000-0000-4000-8000-000000000004') and anonymized_at is null), 1::bigint, 'one eligible event remains after first batch');
select is(public.anonymize_backoffice_audit_events(183, 500), 1, 'second batch anonymizes the remaining eligible event');
select is(public.anonymize_backoffice_audit_events(183, 500), 0, 'repeated run is idempotent');

select is((select count(*) from public.backoffice_audit_events where id = 'e2000000-0000-4000-8000-000000000002' and anonymized_at is null), 1::bigint, 'active documented legal hold prevents anonymization');
select is((select count(*) from public.backoffice_audit_events where id = 'e2000000-0000-4000-8000-000000000003' and anonymized_at is null), 1::bigint, 'recent event remains personal');

select ok((select actor_user_id is null and target_id is null and practice_id is null and request_id is null from public.backoffice_audit_events where id = 'e2000000-0000-4000-8000-000000000001'), 'direct and foreign/correlation identifiers are removed');
select is((select metadata from public.backoffice_audit_events where id = 'e2000000-0000-4000-8000-000000000001'), '{"anonymized":true}'::jsonb, 'identifying metadata is replaced, not filtered selectively');
select ok((select action = 'anonymized' and target_type = 'anonymized' from public.backoffice_audit_events where id = 'e2000000-0000-4000-8000-000000000001'), 'free-text classification fields cannot retain identifying content');
select ok((select created_at = date_trunc('day', created_at) from public.backoffice_audit_events where id = 'e2000000-0000-4000-8000-000000000001'), 'exact event timestamp is reduced to day precision');
select ok((select legal_hold_until is null and legal_hold_reason is null and legal_hold_set_at is null and legal_hold_set_by is null from public.backoffice_audit_events where id = 'e2000000-0000-4000-8000-000000000001'), 'legal-hold identifiers are removed on anonymization');
select ok((select to_jsonb(event)::text not like '%person@example.test%' and to_jsonb(event)::text not like '%192.0.2.10%' and to_jsonb(event)::text not like '%request-person-1%' and to_jsonb(event)::text not like '%20000000-0000-4000-8000-0000000000e8%' from public.backoffice_audit_events event where id = 'e2000000-0000-4000-8000-000000000001'), 'serialized anonymized row contains no original direct or indirect identifier');

select ok(not has_function_privilege('authenticated', 'public.anonymize_backoffice_audit_events(integer,integer)', 'EXECUTE'), 'authenticated cannot execute anonymization RPC');
select ok(has_function_privilege('service_role', 'public.anonymize_backoffice_audit_events(integer,integer)', 'EXECUTE'), 'service_role alone can execute anonymization RPC');

select * from finish();
rollback;
