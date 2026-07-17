set search_path = public, extensions;

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-0000000000a1',
    'authenticated',
    'authenticated',
    'owner-a@example.test',
    crypt('Local-E2E-2026!', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"e2e":true,"practice":"A","practice_role":"owner"}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-0000000000b1',
    'authenticated',
    'authenticated',
    'owner-b@example.test',
    crypt('Local-E2E-2026!', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"e2e":true,"practice":"B","practice_role":"owner"}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-0000000000c1',
    'authenticated',
    'authenticated',
    'partner@example.test',
    crypt('Local-E2E-2026!', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"e2e":true,"practice":"A","practice_role":"viewer"}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-0000000000d1',
    'authenticated',
    'authenticated',
    'manager@example.test',
    crypt('Local-E2E-2026!', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"e2e":true,"practice":"A","practice_role":"manager"}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    ''
  )
on conflict (id) do update
set
  email = excluded.email,
  encrypted_password = excluded.encrypted_password,
  email_confirmed_at = excluded.email_confirmed_at,
  raw_app_meta_data = excluded.raw_app_meta_data,
  raw_user_meta_data = excluded.raw_user_meta_data,
  updated_at = excluded.updated_at;

insert into auth.identities (
  id,
  provider_id,
  user_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
select
  id,
  id::text,
  id,
  jsonb_build_object(
    'sub', id::text,
    'email', email,
    'email_verified', true,
    'phone_verified', false
  ),
  'email',
  now(),
  now(),
  now()
from auth.users
where id in (
  '00000000-0000-4000-8000-0000000000a1',
  '00000000-0000-4000-8000-0000000000b1',
  '00000000-0000-4000-8000-0000000000c1',
  '00000000-0000-4000-8000-0000000000d1'
)
on conflict (provider_id, provider) do update
set
  identity_data = excluded.identity_data,
  updated_at = excluded.updated_at;

insert into public.practices (id, owner_id, name, domain, email, plan)
values
  (
    '20000000-0000-4000-8000-0000000000a1',
    '00000000-0000-4000-8000-0000000000a1',
    'E2E Praxis A',
    'praxis-a.example.test',
    'owner-a@example.test',
    'monitoring'
  ),
  (
    '20000000-0000-4000-8000-0000000000b1',
    '00000000-0000-4000-8000-0000000000b1',
    'E2E Praxis B',
    'praxis-b.example.test',
    'owner-b@example.test',
    'free'
  )
on conflict (id) do update
set
  owner_id = excluded.owner_id,
  name = excluded.name,
  domain = excluded.domain,
  email = excluded.email,
  plan = excluded.plan;

insert into public.partner_practices (id, partner_id, practice_id, role, granted_by)
values
  (
    '30000000-0000-4000-8000-0000000000a1',
    '00000000-0000-4000-8000-0000000000c1',
    '20000000-0000-4000-8000-0000000000a1',
    'viewer',
    '00000000-0000-4000-8000-0000000000a1'
  ),
  (
    '30000000-0000-4000-8000-0000000000a2',
    '00000000-0000-4000-8000-0000000000d1',
    '20000000-0000-4000-8000-0000000000a1',
    'manager',
    '00000000-0000-4000-8000-0000000000a1'
  )
on conflict (partner_id, practice_id) do update
set
  role = excluded.role,
  granted_by = excluded.granted_by;

insert into public.security_checks (id, practice_id, type, score, results)
values
  (
    '40000000-0000-4000-8000-0000000000a1',
    '20000000-0000-4000-8000-0000000000a1',
    'external',
    80,
    '{"seed":"e2e"}'::jsonb
  ),
  (
    '40000000-0000-4000-8000-0000000000b1',
    '20000000-0000-4000-8000-0000000000b1',
    'external',
    50,
    '{"seed":"e2e"}'::jsonb
  )
on conflict (id) do update
set
  practice_id = excluded.practice_id,
  type = excluded.type,
  score = excluded.score,
  results = excluded.results;
