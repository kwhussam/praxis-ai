-- B4c / E-039 P1: Kein authentifizierter Client darf eine Praxis direkt
-- anlegen oder ihren Aktivierungsstatus ändern. Diese Operationen laufen nur
-- über die geprüften security-definer-RPCs bzw. den Worker.

drop policy if exists "practice owners can insert practices" on public.practices;
drop policy if exists "practice owners can update practices" on public.practices;

revoke insert, update, delete on public.practices from authenticated;

-- service_role behält die bereits explizit gewährten Backoffice-/Redeem-Rechte.
