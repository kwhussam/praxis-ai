create schema if not exists extensions;
create extension if not exists pgtap with schema extensions;

begin;
set local search_path = public, extensions;
select plan(18);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values
 ('a5000000-0000-4000-8000-000000000001','authenticated','authenticated','reset-admin@example.test','x',now(),now(),now(),'{}','{}'),
 ('a5000000-0000-4000-8000-000000000002','authenticated','authenticated','reset-consultant@example.test','x',now(),now(),now(),'{}','{}'),
 ('a5000000-0000-4000-8000-000000000003','authenticated','authenticated','reset-target@example.test','x',now(),now(),now(),'{}','{}')
on conflict (id) do nothing;
insert into public.platform_staff (user_id, role, status) values
 ('a5000000-0000-4000-8000-000000000001','platform_admin','active'),
 ('a5000000-0000-4000-8000-000000000002','security_consultant','active')
on conflict (user_id) do update set role=excluded.role,status=excluded.status;
insert into public.practices (id, owner_id, name) values
 ('b5000000-0000-4000-8000-000000000001','a5000000-0000-4000-8000-000000000003','Reset Practice')
on conflict (id) do nothing;

select ok(public.backoffice_actor_can('a5000000-0000-4000-8000-000000000001','user.password_reset.initiate','b5000000-0000-4000-8000-000000000001'),'admin has reset capability');
select is(public.backoffice_actor_can('a5000000-0000-4000-8000-000000000002','user.password_reset.initiate','b5000000-0000-4000-8000-000000000001'),false,'consultant lacks reset capability');
select ok(public.password_reset_consume_rate_limit('target',repeat('a',64),15,1),'first target attempt allowed');
select is(public.password_reset_consume_rate_limit('target',repeat('a',64),15,1),false,'target rate limit is atomic');
select is(public.password_reset_consume_rate_limit('target','raw-ip',15,1),false,'unhashed limiter subject rejected');

select is((public.backoffice_reserve('a5000000-0000-4000-8000-000000000001','user.password_reset.initiate','reset-key',repeat('b',64))->>'reserved'),'true','idempotency slot reserved');
select is((public.password_reset_finalize(
 'a5000000-0000-4000-8000-000000000001','reset-key','c5000000-0000-4000-8000-000000000001',
 'a5000000-0000-4000-8000-000000000003','b5000000-0000-4000-8000-000000000001','in_person','request-1',now()+interval '10 minutes'
)->>'ok'),'true','finalize succeeds for admin');
select is((select count(*) from public.password_reset_audit_events where reset_request_id='c5000000-0000-4000-8000-000000000001' and result='success'),1::bigint,'exactly one specialized success audit');
select ok((select to_jsonb(e)::text not like '%reset-target@example.test%' and to_jsonb(e)::text not like '%123456%' from public.password_reset_audit_events e where reset_request_id='c5000000-0000-4000-8000-000000000001'),'audit contains no email or OTP');
select is((select result->>'reset_request_id' from public.backoffice_idempotency_keys where actor_user_id='a5000000-0000-4000-8000-000000000001' and action='user.password_reset.initiate' and key='reset-key'),'c5000000-0000-4000-8000-000000000001','idempotency result stores only non-secret request reference');

update public.password_reset_audit_events set created_at=now()-interval '200 days',retention_until=now()-interval '17 days'
where reset_request_id='c5000000-0000-4000-8000-000000000001';
select is(public.anonymize_password_reset_audit_events(183,500),1,'expired reset audit anonymized');
select ok((select actor_user_id is null and target_user_id is null and practice_id is null and request_id is null and expires_at is null from public.password_reset_audit_events where id=(select id from public.password_reset_audit_events limit 1)),'direct identifiers removed');
select ok((select created_at=date_trunc('day',created_at) and retention_until-interval '183 days'=created_at from public.password_reset_audit_events limit 1),'timestamps cannot reconstruct sub-day event time');
select ok(not has_table_privilege('authenticated','public.password_reset_audit_events','INSERT,UPDATE,DELETE'),'authenticated cannot mutate reset audit');
select ok(not has_function_privilege('authenticated','public.password_reset_finalize(uuid,text,uuid,uuid,uuid,text,text,timestamptz)','EXECUTE'),'authenticated cannot finalize reset audit');
select ok(has_function_privilege('service_role','public.password_reset_finalize(uuid,text,uuid,uuid,uuid,text,text,timestamptz)','EXECUTE'),'service_role can finalize reset audit');
insert into public.password_reset_rate_limit (dimension,subject_hash,window_start,count,updated_at)
values ('ip',repeat('c',64),now()-interval '2 days',1,now()-interval '2 days');
select is(public.anonymize_password_reset_audit_events(183,500),0,'retention rerun is idempotent');
select is((select count(*) from public.password_reset_rate_limit where subject_hash=repeat('c',64)),0::bigint,'pseudonymous limiter subjects are deleted after 24 hours');

select * from finish();
rollback;
