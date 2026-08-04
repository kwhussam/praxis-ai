-- B4c (E-039) – Slice 1: create_or_get_own_practice darf keine Praxis mehr
-- selbst anlegen und nur eine bereits AKTIVE eigene Praxis zurückgeben.
create schema if not exists extensions;
create extension if not exists pgtap with schema extensions;
begin;
set local search_path = public, extensions;
select plan(4);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
('a0000000-0000-4000-8000-000000000001','authenticated','authenticated','b4c-nopractice@example.test','x',now(),now(),now(),'{}','{}'),
('a0000000-0000-4000-8000-000000000002','authenticated','authenticated','b4c-active@example.test','x',now(),now(),now(),'{}','{}'),
('a0000000-0000-4000-8000-000000000003','authenticated','authenticated','b4c-draft@example.test','x',now(),now(),now(),'{}','{}')
on conflict (id) do nothing;

insert into public.practices (id, owner_id, name, onboarding_status) values
('b0000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000002','B4c Active','active'),
('b0000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000003','B4c Draft','draft')
on conflict (id) do nothing;

-- Nutzer ohne Praxis: RPC legt NICHTS an und liefert 0 Zeilen.
set local role authenticated;
select set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is(
  (select count(*)::int from public.create_or_get_own_practice('neu.example.test','neu@example.test')),
  0,
  'Self-Service legt keine Praxis mehr an (0 Zeilen)'
);
reset role;
select is(
  (select count(*)::bigint from public.practices where owner_id='a0000000-0000-4000-8000-000000000001'),
  0::bigint,
  'Keine Praxis-Zeile fuer den Aufrufer erzeugt'
);

-- Aktiver Owner: bestehende aktive Praxis wird gelesen.
set local role authenticated;
select set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is(
  (select id from public.create_or_get_own_practice('egal.example.test',null)),
  'b0000000-0000-4000-8000-000000000002'::uuid,
  'Aktive eigene Praxis wird gelesen'
);
reset role;

-- Nur-Draft-Owner: keine aktive Praxis -> 0 Zeilen, kein Zugang.
set local role authenticated;
select set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"a0000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is(
  (select count(*)::int from public.create_or_get_own_practice('egal.example.test',null)),
  0,
  'Draft-Praxis wird nicht als Zugang zurueckgegeben'
);
reset role;

select * from finish();
rollback;
