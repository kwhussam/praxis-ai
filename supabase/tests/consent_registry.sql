create schema if not exists extensions;
create extension if not exists pgtap with schema extensions;

begin;
set local search_path = public, extensions;
select plan(17);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values
  ('25000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'consent-a@example.test', 'x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('25000000-0000-4000-8000-0000000000b1', 'authenticated', 'authenticated', 'consent-b@example.test', 'x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;

insert into public.practices (id, owner_id, name, domain, email)
values
  ('25100000-0000-4000-8000-0000000000a1', '25000000-0000-4000-8000-0000000000a1', 'Consent A', 'consent-a.example.test', 'a@consent.example.test'),
  ('25100000-0000-4000-8000-0000000000b1', '25000000-0000-4000-8000-0000000000b1', 'Consent B', 'consent-b.example.test', 'b@consent.example.test')
on conflict (id) do nothing;

select ok(
  not has_function_privilege('authenticated', 'public.has_active_practice_consent(uuid,text,text,timestamptz)', 'EXECUTE'),
  'authenticated cannot execute the consent decision RPC'
);
select ok(
  has_function_privilege('service_role', 'public.has_active_practice_consent(uuid,text,text,timestamptz)', 'EXECUTE'),
  'service role can execute the consent decision RPC'
);
select ok(
  not has_function_privilege('authenticated', 'public.list_practices_with_active_consent(text,text,timestamptz)', 'EXECUTE'),
  'authenticated cannot enumerate practices with active consent'
);

set local role service_role;

insert into public.consent_log (
  id, practice_id, user_id, type, version, accepted, accepted_at, expires_at, scope
) values (
  '25200000-0000-4000-8000-0000000000a1',
  '25100000-0000-4000-8000-0000000000a1',
  '25000000-0000-4000-8000-0000000000a1',
  'external_provider_checks',
  '2026-08-12.v1',
  true,
  '2026-08-12T10:00:00Z',
  '2027-08-12T10:00:00Z',
  '{"target_kind":"practice_managed_domains"}'::jsonb
);

select is(
  public.has_active_practice_consent('25100000-0000-4000-8000-0000000000a1', 'external_provider_checks', '2026-08-12.v1', '2026-08-13T00:00:00Z'),
  true,
  'current version and unexpired grant is active'
);
select is(
  public.has_active_practice_consent('25100000-0000-4000-8000-0000000000a1', 'external_provider_checks', 'old-version', '2026-08-13T00:00:00Z'),
  false,
  'stale text version is never active'
);
select is(
  public.has_active_practice_consent('25100000-0000-4000-8000-0000000000a1', 'external_provider_checks', '2026-08-12.v1', '2028-08-13T00:00:00Z'),
  false,
  'expired consent is inactive'
);
select is(
  (select count(*) from public.list_practices_with_active_consent('external_provider_checks', '2026-08-12.v1', '2026-08-13T00:00:00Z')),
  1::bigint,
  'scheduler list includes only the actively consenting practice'
);

insert into public.consent_log (
  id, practice_id, user_id, type, version, accepted, accepted_at, withdrawn_at, scope
) values (
  '25200000-0000-4000-8000-0000000000a2',
  '25100000-0000-4000-8000-0000000000a1',
  '25000000-0000-4000-8000-0000000000a1',
  'external_provider_checks',
  '2026-08-12.v1',
  false,
  '2026-08-13T10:00:00Z',
  '2026-08-13T10:00:00Z',
  '{"target_kind":"practice_managed_domains"}'::jsonb
);

select is(
  (select supersedes_id from public.consent_log where id = '25200000-0000-4000-8000-0000000000a2'),
  '25200000-0000-4000-8000-0000000000a1'::uuid,
  'new event is automatically linked to its predecessor'
);

select is(
  public.has_active_practice_consent('25100000-0000-4000-8000-0000000000a1', 'external_provider_checks', '2026-08-12.v1', '2026-08-14T00:00:00Z'),
  false,
  'newest withdrawal overrides an older grant'
);
select is(
  (select count(*) from public.list_practices_with_active_consent('external_provider_checks', '2026-08-12.v1', '2026-08-14T00:00:00Z')),
  0::bigint,
  'withdrawn practice is removed from the scheduler list'
);
reset role;
select throws_ok(
  $$update public.consent_log set accepted = true where id = '25200000-0000-4000-8000-0000000000a2'$$,
  '42501',
  'consent_log is append-only',
  'consent events cannot be updated'
);
select throws_ok(
  $$delete from public.consent_log where id = '25200000-0000-4000-8000-0000000000a2'$$,
  '42501',
  'consent_log is append-only',
  'consent events cannot be deleted'
);
set local role service_role;
select throws_ok(
  $$insert into public.consent_log (practice_id, user_id, type, version, accepted, accepted_at)
    values ('25100000-0000-4000-8000-0000000000a1', '25000000-0000-4000-8000-0000000000a1', 'external_provider_checks', '2026-08-12.v1', false, now())$$,
  '23514',
  null,
  'withdrawal event must carry withdrawn_at'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '25000000-0000-4000-8000-0000000000a1', true);
select set_config('request.jwt.claims', '{"sub":"25000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);

select is(
  (select count(*) from public.consent_log where practice_id = '25100000-0000-4000-8000-0000000000a1'),
  2::bigint,
  'owner can read own consent history'
);
select is(
  (select count(*) from public.consent_log where practice_id = '25100000-0000-4000-8000-0000000000b1'),
  0::bigint,
  'owner cannot read another practice consent history'
);
select throws_ok(
  $$insert into public.consent_log (practice_id, user_id, type, version, accepted, accepted_at, scope)
    values ('25100000-0000-4000-8000-0000000000a1', '25000000-0000-4000-8000-0000000000a1', 'external_provider_checks', '2026-08-12.v1', true, now(), '{}'::jsonb)$$,
  '42501',
  null,
  'authenticated manager path cannot bypass Worker-owned consent recording'
);
select is(
  (select scope from public.consent_log where id = '25200000-0000-4000-8000-0000000000a1'),
  '{"target_kind":"practice_managed_domains"}'::jsonb,
  'purpose scope is stored as structured evidence'
);

select * from finish();
rollback;
