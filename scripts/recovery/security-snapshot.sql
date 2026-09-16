select jsonb_pretty(jsonb_build_object(
  'tables', coalesce((
    select jsonb_agg(jsonb_build_object(
      'schema', n.nspname,
      'table', c.relname,
      'rls', c.relrowsecurity,
      'force_rls', c.relforcerowsecurity
    ) order by n.nspname, c.relname)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'r' and n.nspname = 'public'
  ), '[]'::jsonb),
  'policies', coalesce((
    select jsonb_agg(to_jsonb(p) order by p.schemaname, p.tablename, p.policyname)
    from pg_policies p
    where p.schemaname = 'public'
  ), '[]'::jsonb),
  'grants', coalesce((
    select jsonb_agg(to_jsonb(g) order by g.table_schema, g.table_name, g.grantee, g.privilege_type)
    from (
      select table_schema, table_name, grantee, privilege_type, is_grantable
      from information_schema.role_table_grants
      where table_schema = 'public'
        and grantee in ('anon', 'authenticated', 'service_role')
    ) g
  ), '[]'::jsonb)
  , 'schema_grants', coalesce((
    select jsonb_agg(to_jsonb(g) order by g.schema_name, g.grantee, g.privilege_type)
    from (
      select n.nspname as schema_name, r.rolname as grantee,
        x.privilege_type::text as privilege_type, x.is_grantable
      from pg_namespace n
      cross join lateral aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) x
      join pg_roles r on r.oid = x.grantee
      where n.nspname in ('public', 'auth', 'storage', 'supabase_migrations', 'extensions')
        and r.rolname in ('anon', 'authenticated', 'service_role')
    ) g
  ), '[]'::jsonb)
  , 'routine_grants', coalesce((
    select jsonb_agg(to_jsonb(g) order by g.routine_schema, g.routine_name, g.identity_arguments, g.grantee, g.privilege_type)
    from (
      select n.nspname as routine_schema, p.proname as routine_name,
        pg_get_function_identity_arguments(p.oid) as identity_arguments,
        case when x.grantee = 0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end as grantee,
        x.privilege_type::text as privilege_type, x.is_grantable
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x
      where n.nspname = 'public'
        and (x.grantee = 0 or pg_get_userbyid(x.grantee) in ('anon', 'authenticated', 'service_role'))
    ) g
  ), '[]'::jsonb)
  , 'usage_grants', coalesce((
    select jsonb_agg(to_jsonb(g) order by g.object_schema, g.object_name, g.object_type, g.grantee, g.privilege_type)
    from (
      select object_schema, object_name, object_type, grantee, privilege_type, is_grantable
      from information_schema.role_usage_grants
      where object_schema = 'public'
        and grantee in ('anon', 'authenticated', 'service_role')
    ) g
  ), '[]'::jsonb)
));
