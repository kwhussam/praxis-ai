create schema if not exists extensions;
create extension if not exists pgtap with schema extensions;
begin;
set local search_path = public, extensions;
select plan(13);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values
  ('a0000000-0000-4000-8000-0000000000d4','authenticated','authenticated','Bound.Owner@Example.test','x',now(),now(),now(),'{}','{}'),
  ('a0000000-0000-4000-8000-0000000000e4','authenticated','authenticated','admin-b4c@example.test','x',now(),now(),now(),'{}','{}'),
  ('a0000000-0000-4000-8000-0000000000f4','authenticated','authenticated','consultant-b4c@example.test','x',now(),now(),now(),'{}','{}')
on conflict (id) do nothing;

insert into public.platform_staff (user_id, role, status) values
  ('a0000000-0000-4000-8000-0000000000e4','platform_admin','active'),
  ('a0000000-0000-4000-8000-0000000000f4','security_consultant','active')
on conflict (user_id) do update set role = excluded.role, status = excluded.status;

set local role authenticated;
select set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-0000000000d4',true);
select set_config('request.jwt.claims','{"sub":"a0000000-0000-4000-8000-0000000000d4","role":"authenticated"}',true);

select is(
  public.request_practice_activation('health','Legal Health','Praxis Health','Ada','Muster','+4930123','Markt 1','10115','Berlin','DE','Example.DE')->>'status',
  'pending', 'authenticated user can submit a pending request'
);
select is((select contact_email from public.practice_activation_requests where requester_user_id = auth.uid()), 'bound.owner@example.test', 'contact email is bound to the authenticated account');
select is((select domain from public.practice_activation_requests where requester_user_id = auth.uid()), 'example.de', 'domain is normalized');
select is((select count(*) from public.practices where lower(contact_email) = 'bound.owner@example.test'), 0::bigint, 'request creates no practice');
select throws_ok(
  $$select public.request_practice_activation('health','Again','Again','Ada','Muster','+4930123','Markt 1','10115','Berlin','DE',null)$$,
  '23505', null, 'only one pending request per account is accepted'
);
reset role;
select is((select count(*) from public.backoffice_audit_events where actor_user_id = 'a0000000-0000-4000-8000-0000000000d4' and action = 'practice.activation_requested'), 1::bigint, 'request is audited once');

select is(
  public.backoffice_approve_practice_request(
    'a0000000-0000-4000-8000-0000000000f4','b4c-consultant','b4c-consultant-key',
    (select id from public.practice_activation_requests where requester_user_id = 'a0000000-0000-4000-8000-0000000000d4'),
    'hmac:v1:' || repeat('a', 64), now() + interval '1 day'
  )->>'error', 'forbidden', 'consultant cannot approve activation requests'
);

select is(
  public.backoffice_approve_practice_request(
    'a0000000-0000-4000-8000-0000000000e4','b4c-approve','b4c-approve-key',
    (select id from public.practice_activation_requests where requester_user_id = 'a0000000-0000-4000-8000-0000000000d4'),
    'hmac:v1:' || repeat('b', 64), now() + interval '1 day'
  )->>'onboarding_status', 'invited', 'platform admin approves into invited status'
);
select is((select status from public.practice_activation_requests where requester_user_id = 'a0000000-0000-4000-8000-0000000000d4'), 'approved', 'request is marked approved');
select ok((select practice_id is not null from public.practice_activation_requests where requester_user_id = 'a0000000-0000-4000-8000-0000000000d4'), 'approved request is linked to its practice');
select is((select onboarding_status from public.practices where contact_email = 'bound.owner@example.test'), 'invited', 'approved practice is not active before code redemption');
select is((select count(*) from public.practice_invitations where target_email = 'bound.owner@example.test' and status = 'pending'), 1::bigint, 'approval atomically creates one bound owner invitation');
select is((select count(*) from public.backoffice_audit_events where action = 'practice.activation_request.approve' and result = 'success'), 1::bigint, 'approval writes exactly one success audit');

select * from finish();
rollback;
