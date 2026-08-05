-- B5e: Der Worker reserviert den Idempotenz-Key vor dem Aufruf der externen
-- Auth-Admin-API. Nur service_role darf diesen internen Helfer direkt aufrufen;
-- anon/authenticated bleiben weiterhin explizit ausgeschlossen.

revoke all on function public.backoffice_reserve(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.backoffice_reserve(uuid, text, text, text)
  to service_role;
