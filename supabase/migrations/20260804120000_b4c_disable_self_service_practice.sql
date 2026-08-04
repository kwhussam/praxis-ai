-- B4c (E-039): Kontrollierter Praxisaktivierungs-Cutover – Slice 1 (Redeem-only).
--
-- Der öffentliche Self-Service darf keine Praxis mehr selbst anlegen oder
-- aktivieren. `create_or_get_own_practice` wird deshalb zu einer reinen
-- Leseabfrage: Sie liefert nur noch eine bereits AKTIVE, dem Aufrufer gehörende
-- Praxis und legt unter keinen Umständen mehr eine neue Praxis an. Praxen
-- entstehen künftig ausschließlich über die Admin-Anlage im Backoffice (Status
-- `draft`) und werden erst durch Einlösung eines Aktivierungscodes aktiv
-- (`redeem_practice_invitation`). So bleibt jede Aktivierung bei @Hussam
-- kontrolliert; freie Registrierung bewirkt keine Praxisanlage/Freischaltung.
--
-- Die Signatur bleibt exakt erhalten, damit die generierten Typen gültig
-- bleiben; `p_domain`/`p_email` werden bewusst nicht mehr verwendet.
create or replace function public.create_or_get_own_practice(
  p_domain text,
  p_email text default null
) returns table (
  id uuid,
  name text,
  domain text,
  email text,
  plan text,
  white_label_partner_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  -- Nur bereits aktive eigene Praxis zurückgeben – niemals neu anlegen.
  return query
  select
    practices.id,
    practices.name,
    practices.domain,
    practices.email,
    practices.plan,
    practices.white_label_partner_id
  from public.practices
  where practices.owner_id = v_user_id
    and practices.onboarding_status = 'active'
  order by practices.created_at asc
  limit 1;
end;
$$;

revoke all on function public.create_or_get_own_practice(text, text) from public;
grant execute on function public.create_or_get_own_practice(text, text) to authenticated;
