create schema if not exists extensions;
create extension if not exists pgtap with schema extensions;
begin;
set local search_path = public, extensions;
select plan(13);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
('20000000-0000-4000-8000-000000000001','authenticated','authenticated','redeem-owner@example.test','x',now(),now(),now(),'{}','{}'),
('20000000-0000-4000-8000-000000000002','authenticated','authenticated','redeem-member@example.test','x',now(),now(),now(),'{}','{}'),
('20000000-0000-4000-8000-000000000003','authenticated','authenticated','redeem-stranger@example.test','x',now(),now(),now(),'{}','{}')
on conflict (id) do nothing;

-- P1: Owner-Redeem aktiviert eine Onboarding-Praxis ohne Owner.
insert into public.practices (id, name, onboarding_status) values ('40000000-0000-4000-8000-000000000001','Redeem Owner Praxis','draft') on conflict (id) do nothing;
-- P2: bereits aktive Praxis fuer Nicht-Owner-Beitritt.
insert into public.practices (id, name, onboarding_status) values ('40000000-0000-4000-8000-000000000002','Redeem Member Praxis','active') on conflict (id) do nothing;
-- P3: Onboarding-Praxis fuer Nicht-Owner-Redeem (muss scheitern).
insert into public.practices (id, name, onboarding_status) values ('40000000-0000-4000-8000-000000000003','Redeem Draft Praxis','draft') on conflict (id) do nothing;

insert into public.practice_invitations (id, practice_id, target_email, intended_role, delivery_channel, status, proof_reference, expires_at) values
('50000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','redeem-owner@example.test','practice_owner','in_person_code','pending', 'hmac:v1:' || repeat('a',64), now() + interval '2 days'),
('50000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','redeem-member@example.test','assessor','in_person_code','pending', 'hmac:v1:' || repeat('b',64), now() + interval '2 days'),
('50000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000003','redeem-member@example.test','assessor','in_person_code','pending', 'hmac:v1:' || repeat('c',64), now() + interval '2 days'),
('50000000-0000-4000-8000-000000000004','40000000-0000-4000-8000-000000000001','redeem-stranger@example.test','viewer','in_person_code','pending', 'hmac:v1:' || repeat('d',64), now() + interval '2 days'),
('50000000-0000-4000-8000-000000000005','40000000-0000-4000-8000-000000000002','redeem-member@example.test','viewer','in_person_code','pending', 'hmac:v1:' || repeat('e',64), now() - interval '1 hour')
on conflict (id) do nothing;

-- Owner-Redeem: Erfolg + owner_id gesetzt + Praxis aktiv + genau ein Success-Audit.
select is(public.redeem_practice_invitation('20000000-0000-4000-8000-000000000001','redeem-req-1','redeem-key-1','50000000-0000-4000-8000-000000000001')->>'ok','true','owner redeems draft practice');
select is((select owner_id from public.practices where id='40000000-0000-4000-8000-000000000001'),'20000000-0000-4000-8000-000000000001'::uuid,'owner_id is set to redeeming user');
select is((select onboarding_status from public.practices where id='40000000-0000-4000-8000-000000000001'),'active','practice is activated');
select is((select count(*) from public.practice_memberships where practice_id='40000000-0000-4000-8000-000000000001' and user_id='20000000-0000-4000-8000-000000000001' and role='practice_owner' and status='active'),1::bigint,'exactly one active owner membership');
select is((select status from public.practice_invitations where id='50000000-0000-4000-8000-000000000001'),'accepted','invitation marked accepted');
select is((select count(*) from public.backoffice_audit_events where request_id='redeem-req-1' and action='invitation.redeem' and result='success'),1::bigint,'redeem writes exactly one success audit');

-- Idempotenter Replay: gleicher Key spielt das Erfolgsergebnis erneut ab.
select is(public.redeem_practice_invitation('20000000-0000-4000-8000-000000000001','redeem-req-1','redeem-key-1','50000000-0000-4000-8000-000000000001')->>'ok','true','identical retry replays success');
select is((select count(*) from public.practice_memberships where practice_id='40000000-0000-4000-8000-000000000001' and user_id='20000000-0000-4000-8000-000000000001' and status='active'),1::bigint,'replay does not create a second membership');

-- E-Mail-Bindung: eine an eine andere Person adressierte Einladung ist tabu.
select is(public.redeem_practice_invitation('20000000-0000-4000-8000-000000000001','stranger-req','stranger-key','50000000-0000-4000-8000-000000000004')->>'error','forbidden','email mismatch is forbidden');

-- Nicht-Owner: Beitritt zu aktiver Praxis erfolgreich, zu Onboarding-Praxis nicht.
select is(public.redeem_practice_invitation('20000000-0000-4000-8000-000000000002','member-req-1','member-key-1','50000000-0000-4000-8000-000000000002')->>'ok','true','non-owner joins active practice');
select is(public.redeem_practice_invitation('20000000-0000-4000-8000-000000000002','member-req-2','member-key-2','50000000-0000-4000-8000-000000000003')->>'error','invalid_state','non-owner cannot activate a draft practice');

-- Abgelaufene Einladung wird abgewiesen.
select is(public.redeem_practice_invitation('20000000-0000-4000-8000-000000000002','expired-req','expired-key','50000000-0000-4000-8000-000000000005')->>'error','expired','expired invitation is rejected');

-- Fehlender Idempotenz-Key wird abgewiesen.
select is(public.redeem_practice_invitation('20000000-0000-4000-8000-000000000002','nokey-req','','50000000-0000-4000-8000-000000000002')->>'error','idempotency_key_required','missing idempotency key is rejected');

select * from finish();
rollback;
