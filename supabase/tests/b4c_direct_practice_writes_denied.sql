create schema if not exists extensions;
create extension if not exists pgtap with schema extensions;
begin;
set local search_path = public, extensions;
select plan(2);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values ('a0000000-0000-4000-8000-0000000000c4','authenticated','authenticated','b4c-lock@example.test','x',now(),now(),now(),'{}','{}')
on conflict (id) do nothing;

set local role authenticated;
select set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-0000000000c4',true);
select set_config('request.jwt.claims','{"sub":"a0000000-0000-4000-8000-0000000000c4","role":"authenticated"}',true);

select throws_ok(
  $$insert into public.practices (owner_id, name, onboarding_status) values ('a0000000-0000-4000-8000-0000000000c4','Bypass','active')$$,
  '42501', null, 'authenticated darf keine Praxis direkt anlegen'
);
select throws_ok(
  $$update public.practices set onboarding_status = 'active' where id = '20000000-0000-4000-8000-0000000000a1'$$,
  '42501', null, 'authenticated darf keinen Aktivierungsstatus direkt ändern'
);
reset role;
select * from finish();
rollback;
