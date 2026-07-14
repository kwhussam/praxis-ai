grant usage on schema public to service_role;

grant select on public.practices to service_role;
grant select on public.partner_practices to service_role;

grant insert on public.security_checks to service_role;
grant insert on public.practice_access_audit to service_role;
