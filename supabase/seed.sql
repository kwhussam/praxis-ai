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
    crypt('LocalE2E2026Secure', gen_salt('bf')),
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
    crypt('LocalE2E2026Secure', gen_salt('bf')),
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
    crypt('LocalE2E2026Secure', gen_salt('bf')),
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
    crypt('LocalE2E2026Secure', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"e2e":true,"practice":"A","practice_role":"manager"}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-4000-8000-0000000000e1',
    'authenticated',
    'authenticated',
    'admin@praxis-ai.local',
    crypt('Local-Admin-2026!', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"local_seed":true,"platform_role":"platform_admin"}'::jsonb,
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
  '00000000-0000-4000-8000-0000000000d1',
  '00000000-0000-4000-8000-0000000000e1'
)
on conflict (provider_id, provider) do update
set
  identity_data = excluded.identity_data,
  updated_at = excluded.updated_at;

-- Lokaler Bootstrap-Zugang für das interne Backoffice. Dieser Zugang ist nur
-- für die lokale Entwicklungsumgebung bestimmt; jeder Backoffice-Zugriff
-- erzwingt zusätzlich ein persönliches TOTP-MFA-Setup.
insert into public.platform_staff (user_id, role, status, mfa_required)
values ('00000000-0000-4000-8000-0000000000e1', 'platform_admin', 'active', true)
on conflict (user_id) do update
set role = excluded.role,
    status = excluded.status,
    mfa_required = excluded.mfa_required;

insert into public.practices (
  id, owner_id, name, domain, email, plan, practice_kind, legal_name,
  display_name, contact_first_name, contact_last_name, contact_email,
  contact_phone, street, postal_code, city, country_code, onboarding_status
)
values
  (
    '20000000-0000-4000-8000-0000000000a1',
    '00000000-0000-4000-8000-0000000000a1',
    'E2E Praxis A',
    'praxis-a.example.test',
    'owner-a@example.test',
    'monitoring',
    'general',
    'E2E Praxis A',
    'E2E Praxis A',
    'Erika',
    'Eigentümerin',
    'owner-a@example.test',
    '+49 30 10000001',
    'Teststraße 1',
    '10115',
    'Berlin',
    'DE',
    'active'
  ),
  (
    '20000000-0000-4000-8000-0000000000b1',
    '00000000-0000-4000-8000-0000000000b1',
    'E2E Praxis B',
    'praxis-b.example.test',
    'owner-b@example.test',
    'free',
    'health',
    'E2E Praxis B',
    'E2E Praxis B',
    'Bernd',
    'Beispiel',
    'owner-b@example.test',
    '+49 89 10000002',
    'Testallee 2',
    '80331',
    'München',
    'DE',
    'active'
  )
on conflict (id) do update
set
  owner_id = excluded.owner_id,
  name = excluded.name,
  domain = excluded.domain,
  email = excluded.email,
  plan = excluded.plan,
  practice_kind = excluded.practice_kind,
  legal_name = excluded.legal_name,
  display_name = excluded.display_name,
  contact_first_name = excluded.contact_first_name,
  contact_last_name = excluded.contact_last_name,
  contact_email = excluded.contact_email,
  contact_phone = excluded.contact_phone,
  street = excluded.street,
  postal_code = excluded.postal_code,
  city = excluded.city,
  country_code = excluded.country_code,
  onboarding_status = excluded.onboarding_status;

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
