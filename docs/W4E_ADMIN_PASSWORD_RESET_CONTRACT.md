# W4e/B5a: Vertrag für administrativ initiierten Passwort-Reset

Stand: 2026-07-29  
Status: B5a-Vertragsentwurf zur Gegenprüfung; noch keine B5b-Implementierung

## 1. Ziel und Produktgrenze

Ein `platform_admin` darf für ein bestehendes Praxiskonto einen einmaligen
Recovery-Code erzeugen. Der Administrator kennt und setzt das neue Passwort
nicht. Der Code wird standardmäßig persönlich übergeben; telefonisch nur nach
dokumentierter Identitätsprüfung. Er soll zehn Minuten gültig sein. Nach der
Passwortänderung werden alle bestehenden Sitzungen des Zielkontos widerrufen.

Der Reset ist kein allgemeiner Support-Endpunkt und kein Self-Service-Ersatz.
`security_consultant`, `support` und Praxisrollen dürfen ihn nicht auslösen.

## 2. Verifizierte technische Ausgangslage

- Lokal steht `auth.email.otp_length = 6` und `auth.email.otp_expiry = 3600` in
  `supabase/config.toml`. Der gewünschte Zielwert von zehn Minuten ist lokal
  daher noch nicht erfüllt.
- Supabase dokumentiert `auth.email.otp_expiry` als gemeinsame Ablaufzeit für
  E-Mail-OTPs. Eine getrennte Recovery-OTP-TTL ist in der verwendeten
  Konfiguration und der offiziellen CLI-Konfigurationsreferenz nicht vorhanden.
- Eine Änderung auf `600` Sekunden betrifft deshalb mindestens Recovery-OTP,
  Magic-Link/E-Mail-OTP und die tokenbasierten E-Mail-Flows desselben Projekts.
  W4c und alle Sign-up-, Einladungs- oder E-Mail-Änderungsabläufe müssen in
  Staging erneut geprüft werden.
- `auth.admin.generateLink({ type: "recovery", email })` erzeugt Link und
  `email_otp`, versendet sie aber nicht. Das passt zur persönlichen Übergabe.
- Die dokumentierte globale Abmeldung benötigt einen Access-Token der
  Zielsession, nicht nur die User-ID. Der Initiierungsendpunkt darf daher keinen
  sofortigen vollständigen Sitzungswiderruf behaupten. Nach erfolgreicher
  Passwortänderung führt die Recovery-Session `signOut({ scope: "global" })`
  aus. Bereits ausgestellte Access-JWTs können trotzdem bis zu ihrem Ablauf
  gültig bleiben; die JWT-TTL ist eine zusätzliche Restlaufzeitgrenze.

## 3. Verbindlicher B5b-Endpunktvertrag

`POST /api/backoffice/practices/:practiceId/password-resets`

Request:

```json
{
  "targetUserId": "uuid",
  "identityVerification": "in_person|phone_verified"
}
```

Pflicht-Header: `Authorization`, `Idempotency-Key`, `X-Request-ID`.

Erfolgsantwort (`201`, genau einmal sichtbar):

```json
{
  "resetRequestId": "uuid",
  "code": "123456",
  "expiresAt": "ISO-8601"
}
```

Der Worker:

1. authentifiziert die Session und verlangt `aal2` plus frischen expliziten
   MFA-Step-up nach dem vorhandenen `requireBackofficeActor(...,
   { freshStepUp: true })`-Muster;
2. erlaubt ausschließlich den aktiven `platform_admin` mit der neuen,
   serverseitigen Capability `user.password_reset.initiate`;
3. prüft, dass `targetUserId` aktuell als Owner oder aktive Mitgliedschaft zur
   angegebenen Praxis gehört; die E-Mail wird ausschließlich serverseitig aus
   Auth geladen und nie aus dem Request übernommen;
4. begrenzt Versuche mindestens pro Akteur, Zielkonto und IP. Default für B5b:
   fünf Initiierungen je 15 Minuten pro Akteur, drei je 15 Minuten pro Ziel und
   20 je Stunde pro IP;
5. erzeugt mit dem serverseitigen Supabase-Admin-Client einen Recovery-Link und
   gibt nur dessen sechsstelligen `email_otp` zurück;
6. persistiert und loggt weder OTP, Recovery-Link, Hash-Token noch Passwort;
7. schreibt Erfolg oder Fehlschlag genau einmal atomar in die spezialisierte
   Reset-Audit-Struktur.

Fehlerantworten verwenden feste Codes (`unauthorized`, `aal2_required`,
`step_up_required`, `forbidden`, `not_found`, `rate_limited`,
`idempotency_conflict`, `upstream_error`) und spiegeln keine Supabase-Texte.
Außerhalb einer bereits autorisierten Praxisdetailseite werden `forbidden` und
`not_found` gegen Enumeration zusammengefaltet.

### Idempotenz und verlorene Antworten

Der OTP darf für einen Erfolg-Replay nicht gespeichert werden. Deshalb gibt ein
Retry mit demselben erfolgreich verbrauchten Idempotenz-Key **keinen** Code
erneut aus, sondern `409 reset_already_issued`. Nach verlorener Antwort muss der
Admin bewusst einen neuen Request mit neuem Key auslösen; der neu erzeugte
Supabase-Recovery-Code ersetzt den vorherigen. Das Backoffice erklärt diesen
Fall ausdrücklich. So entsteht kein versteckter OTP-Speicher.

## 4. Spezialisierte append-only Audit-Grenze

B5b legt eine eigene Tabelle `password_reset_audit_events` an. Sie enthält nur:

- zufällige Ereignis-ID und Reset-Request-ID,
- Initiator-ID, Zielkonto-ID und Praxis-ID,
- Übergabeart (`in_person|phone_verified`),
- Ergebnis und begrenzten Fehlercode,
- `created_at`, `expires_at`, `retention_until`, optionale dokumentierte
  Aufbewahrungssperre und `anonymized_at`.

Verboten sind OTP, Recovery-Link/-Token, Passwort, E-Mail-Adresse, IP-Adresse,
User-Agent und freie Metadaten. RLS und `FORCE ROW LEVEL SECURITY` gelten vor
der ersten Nutzung. Reguläre Rollen erhalten weder INSERT, UPDATE noch DELETE;
Schreiben und spätere Anonymisierung erfolgen nur über eng begrenzte
`service_role`-RPCs. Personenbezug bleibt 183 Tage erhalten und wird danach nach
dem bestehenden B1b-Muster irreversibel anonymisiert. Ein aktiver Legal Hold
benötigt Grund, Verantwortlichen und Ablaufdatum.

## 5. Redemption- und Sitzungsvertrag

Die App erhält einen separaten Code-Einstieg vor dem vorhandenen
W4c-Passwortformular:

1. Der Nutzer gibt die E-Mail-Adresse seines Kontos und den persönlich
   erhaltenen Code ein. Supabase bindet die Recovery-Verifikation an genau
   diese Kombination; die App zeigt für falsche E-Mail und falschen Code
   denselben neutralen Fehler.
2. `verifyOtp({ email, token: code, type: "recovery" })` erzeugt die
   Recovery-Session.
3. Das vorhandene Passwortformular setzt das vom Nutzer gewählte Passwort.
4. Erst nach erfolgreichem `updateUser` wird
   `signOut({ scope: "global" })` ausgeführt. Ein fehlgeschlagener globaler
   Widerruf ist kein Erfolg: Die UI zeigt einen sicheren Fehler und fordert
   erneute Anmeldung beziehungsweise Supportprüfung.
5. Weder Recovery-Session noch Code werden lokal dauerhaft gespeichert.

Wichtig: Der globale Logout widerruft Refresh-Sessions. Bereits ausgestellte
Access-Tokens können bis zum JWT-Ablauf weiter funktionieren. Vor B5b wird die
JWT-TTL je Umgebung dokumentiert; sensible Worker-Aktionen bleiben zusätzlich
an aktuelle Rollen, Status und AAL2 gebunden.

## 6. B5b-Abnahmetests

- Worker: keine Session, AAL1, veralteter Step-up und alle Nicht-Admin-Rollen
  werden abgewiesen.
- Tenant: fremde Praxis, fremdes Zielkonto und widerrufene Mitgliedschaft
  erzeugen keine Reset-Möglichkeit.
- Rate-Limits: Akteur, Ziel und IP werden getrennt getestet.
- Geheimnisse: OTP/Link/Token erscheinen weder in Audit, Logs, Analytics noch
  Idempotenzdaten; Erfolg wird nicht mit Klartext-OTP replayt.
- Audit: genau ein Erfolgs- oder Fehlerereignis, append-only RLS, Cross-Tenant-
  Negativtests, 183-Tage-Anonymisierung und Re-Identifizierungs-Negativtest.
- App: falscher, abgelaufener und bereits verwendeter Code; Passwortfehler;
  erfolgreicher Wechsel; globaler Logout-Fehler; Re-Login mit neuem Passwort.
- Konfiguration: Staging weist `otp_expiry = 600` nach und testet W4c,
  Magic-Link/E-Mail-OTP, Sign-up-Bestätigung und E-Mail-Änderung, soweit in der
  jeweiligen Umgebung aktiviert.

## 7. Noch offene externe Gates

1. Staging- und Produktionswert von `auth.email.otp_expiry` im Supabase-
   Dashboard prüfen; der lokale Wert beweist keine Hosted-Konfiguration.
2. Projektweite Umstellung auf 600 Sekunden erst nach bestandener Staging-
   Regression freigeben. Ohne diese Umstellung ist die zugesagte Zehn-Minuten-
   Grenze technisch nicht erfüllt und B5b darf nicht als vollständig
   abgenommen gelten.
3. JWT-TTL je Umgebung erfassen und die maximale Restgültigkeit bereits
   ausgestellter Access-Tokens in Betrieb und Datenschutzdokumentation nennen.

## 8. Quellen

- Supabase CLI-Konfiguration, `auth.email.otp_expiry`:
  https://supabase.com/docs/guides/local-development/cli/config
- Supabase Admin `generateLink`:
  https://supabase.com/docs/reference/javascript/auth-admin-generatelink
- Supabase `signOut` und globale Sessionwirkung:
  https://supabase.com/docs/reference/javascript/auth-signout
