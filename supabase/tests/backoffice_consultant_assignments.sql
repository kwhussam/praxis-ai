create schema if not exists extensions;
create extension if not exists pgtap with schema extensions;
begin;
set local search_path = public, extensions;
select plan(12);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
('10000000-0000-4000-8000-000000000001','authenticated','authenticated','assign-admin@example.test','x',now(),now(),now(),'{}','{}'),
('10000000-0000-4000-8000-000000000002','authenticated','authenticated','assign-consultant@example.test','x',now(),now(),now(),'{}','{}'),
('10000000-0000-4000-8000-000000000003','authenticated','authenticated','assign-other@example.test','x',now(),now(),now(),'{}','{}')
on conflict (id) do nothing;
insert into public.platform_staff (user_id, role, status) values
('10000000-0000-4000-8000-000000000001','platform_admin','active'),
('10000000-0000-4000-8000-000000000002','security_consultant','active')
on conflict (user_id) do update set role=excluded.role,status=excluded.status;
insert into public.practices (id, name, onboarding_status) values ('30000000-0000-4000-8000-000000000001','Assignment Test','draft') on conflict (id) do nothing;

select ok(public.backoffice_actor_can('10000000-0000-4000-8000-000000000001','assignment.manage',null),'admin manages assignments');
select is(public.backoffice_actor_can('10000000-0000-4000-8000-000000000002','assignment.manage',null),false,'consultant cannot manage assignments');
select is((select count(*) from public.backoffice_list_consultants('10000000-0000-4000-8000-000000000001')),1::bigint,'admin sees active consultant directory');
select is((select count(*) from public.backoffice_list_consultants('10000000-0000-4000-8000-000000000002')),0::bigint,'consultant cannot enumerate staff');

select is(public.backoffice_assign_consultant('10000000-0000-4000-8000-000000000001','assign-req-1','assign-key-1','30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','Quartalsprüfung')->>'ok','true','admin assigns active consultant');
select is((select count(*) from public.staff_practice_assignments where practice_id='30000000-0000-4000-8000-000000000001' and staff_user_id='10000000-0000-4000-8000-000000000002' and status='active'),1::bigint,'exactly one active assignment exists');
select is((select count(*) from public.backoffice_audit_events where request_id='assign-req-1' and action='assignment.grant' and result='success'),1::bigint,'grant writes exactly one success audit');
select is(public.backoffice_assign_consultant('10000000-0000-4000-8000-000000000001','assign-req-1','assign-key-1','30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','Quartalsprüfung')->>'ok','true','identical grant retry replays success');
select is(public.backoffice_assign_consultant('10000000-0000-4000-8000-000000000001','assign-req-2','assign-key-1','30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','Anderer Zweck')->>'error','idempotency_conflict','changed payload conflicts');
select is(public.backoffice_assign_consultant('10000000-0000-4000-8000-000000000002','assign-req-3','assign-key-2','30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003',null)->>'error','forbidden','consultant cannot assign staff');

select is(public.backoffice_revoke_consultant_assignment('10000000-0000-4000-8000-000000000001','revoke-req-1','revoke-key-1',(select id from public.staff_practice_assignments where practice_id='30000000-0000-4000-8000-000000000001' and staff_user_id='10000000-0000-4000-8000-000000000002' and status='active'))->>'ok','true','admin revokes active assignment');
select is((select count(*) from public.backoffice_audit_events where request_id='revoke-req-1' and action='assignment.revoke' and result='success'),1::bigint,'revoke writes exactly one success audit');

select * from finish();
rollback;
