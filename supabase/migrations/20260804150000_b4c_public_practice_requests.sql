-- B4c / E-039 Slice 2: Eine Selbstanfrage erzeugt niemals eine aktive Praxis.
-- Sie ist ein separat prüfbarer Entwurf, den ausschließlich ein Plattform-Admin
-- später in eine Backoffice-Praxis mit gebundenem Aktivierungscode überführt.

create table if not exists public.practice_activation_requests (
  id uuid primary key default gen_random_uuid(),
  requester_user_id uuid not null references auth.users(id) on delete cascade,
  practice_kind text not null check (practice_kind in ('general', 'health')),
  legal_name text not null,
  display_name text not null,
  contact_first_name text not null,
  contact_last_name text not null,
  contact_email text not null,
  contact_phone text not null,
  street text not null,
  postal_code text not null,
  city text not null,
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  domain text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  practice_id uuid references public.practices(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status in ('approved', 'rejected', 'cancelled')) = (reviewed_at is not null))
);

create unique index if not exists practice_activation_requests_one_open_per_user
  on public.practice_activation_requests (requester_user_id)
  where status = 'pending';

alter table public.practice_activation_requests enable row level security;
alter table public.practice_activation_requests force row level security;

create policy "requester reads own activation request"
  on public.practice_activation_requests for select
  using (requester_user_id = auth.uid());

grant select on public.practice_activation_requests to authenticated;
grant select, insert, update on public.practice_activation_requests to service_role;

-- Der öffentliche Nutzer schreibt ausschließlich über diese Funktion. Dadurch
-- wird die E-Mail zwingend an das eingeloggte Konto gebunden und es kann keine
-- Praxis- oder Member-Zeile am Schutzpfad vorbei entstehen.
create or replace function public.request_practice_activation(
  p_practice_kind text,
  p_legal_name text,
  p_display_name text,
  p_contact_first_name text,
  p_contact_last_name text,
  p_contact_phone text,
  p_street text,
  p_postal_code text,
  p_city text,
  p_country_code text,
  p_domain text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user uuid := auth.uid();
  v_email text;
  v_request_id uuid;
  v_country text := upper(btrim(coalesce(p_country_code, '')));
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select lower(email) into v_email from auth.users where id = v_user;
  if v_email is null
     or p_practice_kind not in ('general', 'health')
     or coalesce(btrim(p_legal_name), '') = ''
     or coalesce(btrim(p_display_name), '') = ''
     or coalesce(btrim(p_contact_first_name), '') = ''
     or coalesce(btrim(p_contact_last_name), '') = ''
     or coalesce(btrim(p_contact_phone), '') = ''
     or coalesce(btrim(p_street), '') = ''
     or coalesce(btrim(p_postal_code), '') = ''
     or coalesce(btrim(p_city), '') = ''
     or v_country !~ '^[A-Z]{2}$' then
    raise exception 'invalid_activation_request' using errcode = '22023';
  end if;

  insert into public.practice_activation_requests (
    requester_user_id, practice_kind, legal_name, display_name,
    contact_first_name, contact_last_name, contact_email, contact_phone,
    street, postal_code, city, country_code, domain
  ) values (
    v_user, p_practice_kind, btrim(p_legal_name), btrim(p_display_name),
    btrim(p_contact_first_name), btrim(p_contact_last_name), v_email,
    btrim(p_contact_phone), btrim(p_street), btrim(p_postal_code),
    btrim(p_city), v_country, nullif(lower(btrim(p_domain)), '')
  ) returning id into v_request_id;

  insert into public.backoffice_audit_events (
    actor_user_id, action, target_type, target_id, result, metadata
  ) values (
    v_user, 'practice.activation_requested', 'practice_activation_request',
    v_request_id, 'success', jsonb_build_object('source', 'public_self_service')
  );

  return jsonb_build_object('ok', true, 'request_id', v_request_id, 'status', 'pending');
exception
  when unique_violation then
    raise exception 'activation_request_already_pending' using errcode = '23505';
end $$;

revoke all on function public.request_practice_activation(text, text, text, text, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.request_practice_activation(text, text, text, text, text, text, text, text, text, text, text) to authenticated;
