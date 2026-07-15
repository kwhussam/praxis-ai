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
  v_domain text := lower(trim(coalesce(p_domain, '')));
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_name text;
begin
  if v_user_id is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

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
  order by practices.created_at asc
  limit 1;

  if found then
    return;
  end if;

  if length(v_domain) <= 3 or position('.' in v_domain) = 0 then
    raise exception 'invalid_domain' using errcode = '22023';
  end if;

  v_name := 'Praxis ' || initcap(replace(split_part(v_domain, '.', 1), '-', ' '));

  return query
  insert into public.practices (owner_id, name, domain, email, plan)
  values (v_user_id, v_name, v_domain, v_email, 'free')
  returning
    practices.id,
    practices.name,
    practices.domain,
    practices.email,
    practices.plan,
    practices.white_label_partner_id;
end;
$$;

revoke all on function public.create_or_get_own_practice(text, text) from public;
grant execute on function public.create_or_get_own_practice(text, text) to authenticated;
