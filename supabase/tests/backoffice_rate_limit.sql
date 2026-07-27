create schema if not exists extensions;
create extension if not exists pgtap with schema extensions;

begin;
set local search_path = public, extensions;

select plan(10);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values
  ('00000000-0000-4000-8000-0000000000f1', 'authenticated', 'authenticated', 'rl-actor-1@example.test', 'x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb),
  ('00000000-0000-4000-8000-0000000000f2', 'authenticated', 'authenticated', 'rl-actor-2@example.test', 'x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb)
on conflict (id) do nothing;

-- Limit = 2: the first two calls in the window pass, the third is denied.
select is(public.backoffice_consume_rate_limit('00000000-0000-4000-8000-0000000000f1', 'practice.create', 5, 2), true, 'first call within limit is allowed');
select is(public.backoffice_consume_rate_limit('00000000-0000-4000-8000-0000000000f1', 'practice.create', 5, 2), true, 'second call at the limit boundary is allowed');
select is(public.backoffice_consume_rate_limit('00000000-0000-4000-8000-0000000000f1', 'practice.create', 5, 2), false, 'third call over the limit is denied');

-- A denied call does not increment: the stored count stays at the limit.
select is((select count from public.backoffice_rate_limit where actor_user_id = '00000000-0000-4000-8000-0000000000f1' and endpoint = 'practice.create'), 2, 'denied call does not increment the counter');

-- Buckets are independent per endpoint and per actor.
select is(public.backoffice_consume_rate_limit('00000000-0000-4000-8000-0000000000f1', 'invitation.create', 5, 2), true, 'a different endpoint has its own window');
select is(public.backoffice_consume_rate_limit('00000000-0000-4000-8000-0000000000f2', 'practice.create', 5, 2), true, 'a different actor has its own window');

-- Defensive input handling: fail-closed on invalid parameters.
select is(public.backoffice_consume_rate_limit('00000000-0000-4000-8000-0000000000f1', 'practice.create', 0, 2), false, 'non-positive window is rejected');
select is(public.backoffice_consume_rate_limit('00000000-0000-4000-8000-0000000000f1', '   ', 5, 2), false, 'blank endpoint is rejected');

-- Only service_role may consume the limiter.
select ok(not has_function_privilege('authenticated', 'public.backoffice_consume_rate_limit(uuid,text,integer,integer)', 'EXECUTE'), 'authenticated cannot execute the rate-limit RPC');
select ok(has_function_privilege('service_role', 'public.backoffice_consume_rate_limit(uuid,text,integer,integer)', 'EXECUTE'), 'service_role can execute the rate-limit RPC');

select * from finish();
rollback;
