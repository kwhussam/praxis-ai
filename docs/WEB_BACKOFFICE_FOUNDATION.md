# Web-Backoffice-Fundament

Status: B3-Implementierung gestartet. Slice B3.1 liefert das interne Web-
Backoffice-Fundament mit Staff-Anmeldung, AAL2/TOTP-Gate, Praxisübersicht und
professioneller Praxisanlage. Personenbezogene Audit-Aufbewahrung ist auf sechs
Monate mit anschließender automatischer irreversibler Anonymisierung festgelegt.

Stand: 2026-07-24

Verantwortlich: Produktteam

## 1. Ziel und Produktgrenze

Das Web-Backoffice wird **ausschließlich als internes Arbeitswerkzeug**
(Entscheidung @Hussam, 2026-07-24) für Hussam und ausdrücklich berechtigte
Mitarbeitende umgesetzt. Es dient dazu, Praxen professionell anzulegen, Inhaber
einzuladen, Benutzerzugriffe zu verwalten und den Onboarding-Status
nachvollziehbar zu steuern.

Das MVP ist **kein öffentliches Self-Service-Portal** und ersetzt nicht die
mobile Assessment-App. Ein Self-Service-Bereich für Praxisinhaber ist
ausdrücklich nicht Teil dieses Schnitts. Praxisinhaber bearbeiten im Backoffice
keine Fragebögen, Scans oder Berichte.

Das Backoffice darf keine Patientendaten, Mandantenakten oder fachlichen
Kundeninhalte erfassen. Freitext wird im MVP auf das notwendige Minimum
begrenzt.

## 2. Bestehende Grundlage und erkannte Lücken

### Wiederverwendbar

- Supabase Auth verwaltet Benutzeridentitäten und Sessions.
- `practices` ist bereits der Mandant für Checks, Berichte und Scans.
- `owner_id` kann den primären Praxisinhaber referenzieren und ist bereits
  nullable.
- `partner_practices` und `can_access_practice(...)` bieten eine vorhandene,
  serverseitig geprüfte Zugriffsbasis.
- `practice_access_audit` kann als Muster für append-only Audit-Ereignisse
  dienen.
- Der Worker prüft heute Benutzer, Praxiszugriff und Rollen serverseitig.

### Nicht ausreichend

- Der öffentliche App-Sign-up erzeugt nur E-Mail/Passwort und leitet danach in
  ein Domain-basiertes `create_or_get_own_practice(...)`-Onboarding. Das ist
  kein administrativ gesteuerter Praxisprozess.
- `partner_practices.partner_id` vermischt externe Partnerzugriffe und
  allgemeine Praxis-Mitgliedschaft. Die Rollen
  `owner|manager|viewer|white_label` sind keine Plattform-Admin-Rollen.
- Es gibt keine autoritative Identität für Plattformmitarbeitende, keine
  feingranularen Backoffice-Berechtigungen und keine erzwungene
  Mehrfaktor-Authentisierung.
- Praxis-Stammdaten enthalten derzeit nur Name, Domain, E-Mail und Tarif.
- Einladungen, Aktivierungsstatus, Sperren, Rollenänderungen und
  Onboarding-Fortschritt besitzen keinen eigenen Lebenszyklus.
- Änderungen an Stammdaten und Benutzerrechten haben noch kein vollständiges
  fachliches Audit.

## 3. Identitäten und Rollen

Plattformrollen und Praxisrollen werden getrennt modelliert. Eine Rolle im
Client oder in frei änderbaren `user_metadata` ist niemals maßgeblich.

### Plattformrollen

| Rolle | Zweck | Wesentliche Berechtigungen |
|---|---|---|
| `platform_admin` | Betrieb und Sicherheitsadministration | Mitarbeitende verwalten, alle Backoffice-Funktionen, Konfiguration |
| `security_consultant` | Hussams operativer Beratungsprozess | Praxen anlegen/bearbeiten, Inhaber einladen, Assessments zuordnen |
| `support` | Begrenzte Kundenunterstützung | Stammdaten lesen, Einladungsstatus sehen, keine Assessments oder Reset-Codes |

Plattformrollen liegen in einer autoritativen Tabelle wie `platform_staff`.
Einträge werden nur über einen serverseitigen, auditierten Prozess verändert.
Jeder Backoffice-Zugriff erfordert MFA/AAL2. Kritische Aktionen wie
Rollenänderung oder später W4e benötigen eine frische Step-up-Authentisierung.

### Praxisrollen

| Rolle | Zweck |
|---|---|
| `practice_owner` | Rechtlich/organisatorisch verantwortlicher Hauptzugang |
| `practice_manager` | Benutzer und organisatorische Stammdaten verwalten |
| `assessor` | Check im Auftrag der Praxis durchführen |
| `viewer` | Ergebnisse und Berichte nur lesen |

Die vorhandenen Rollen werden während der Migration kompatibel abgebildet.
`white_label` bleibt ein Partnertyp und wird nicht als allgemeine
Praxis-Mitgliedsrolle weiterverwendet.

## 4. Fachliches Datenmodell

Der Plan ist additiv. Historische Checks und bestehende Praxiszugriffe bleiben
gültig.

### Bestätigte B1-Technikergänzungen (@Hussam, 2026-07-24)

1. **`can_access_practice` erweitern (Muss).** Die vorhandene Authz-Funktion
   `can_access_practice(user, practice, role)` und ihr Wrapper
   `current_user_can_access_practice` autorisieren heute nur über
   `practices.owner_id` oder `partner_practices`. Alle bestehenden
   RLS-Policies (`security_checks`, `reports`, `monitoring_events`,
   `monitoring_snapshots`, `wlan_scans`, `practices`) hängen daran. B1 erweitert
   diese Funktionen additiv um `practice_memberships`, inklusive einer
   Rang-Abbildung der neuen Praxisrollen analog zu `partner_role_rank`.
   Ohne diese Erweiterung wäre eine neue Mitgliedschaft für alle bestehenden
   Policies unsichtbar; die mobile Praxis-Ladung über Mitgliedschaft
   (Abschnitt 5, Schritt 7) hängt direkt davon ab.
2. **`partner_practices` vs. `practice_memberships` migrieren.** Vorhandene
   Nicht-`white_label`-Grants (`owner|manager|viewer`) werden nach
   `practice_memberships` migriert; `partner_practices` wird auf den reinen
   White-Label-Partnerfall reduziert. Damit entstehen keine zwei parallelen
   Mitgliedschaftssysteme.
3. **RLS-Tests und Rollenmatrix Teil von B1.** B1 erweitert verbindlich
   `supabase/tests/rls_cross_tenant.sql` und `docs/RLS_PARTNER_ROLE_MATRIX.md`
   um die neuen Tabellen und Rollen. Neue Tabellen sind erst nach RLS-Policies
   und bestandenen Cross-Tenant-Negativtests nutzbar.

### `practices` erweitern

Pflichtfelder (Entscheidung @Hussam, 2026-07-24); `domain` bleibt optional:

- `practice_kind`: `general | health` (Pflicht)
- `legal_name` (Pflicht)
- `display_name` (Pflicht)
- `contact_first_name`, `contact_last_name` (Pflicht)
- `contact_email`, `contact_phone` (Pflicht)
- `street`, `postal_code`, `city`, `country_code` (Pflicht)
- `domain` optional
- `onboarding_status`: `draft | invited | active | suspended | archived`
- `created_by_staff_id`
- `updated_at`

`practice_kind` legt das Default-Assessment-Profil fest. Eine spätere Änderung
ändert niemals rückwirkend historische Bewertungen.

### Neue fachliche Tabellen

**`platform_staff`**

- `user_id`, Plattformrolle, Status, MFA-Pflicht, angelegt von/zu
- keine Passwörter oder Recovery-Codes

**`practice_memberships`**

- `practice_id`, `user_id`, Praxisrolle, Status
- `granted_by`, `granted_at`, `revoked_at`
- eindeutige aktive Mitgliedschaft je Benutzer/Praxis

**`staff_practice_assignments`**

- `staff_user_id`, `practice_id`, Zuweisungszweck, Status
- `assigned_by`, `assigned_at`, `revoked_at`
- begrenzt die Sicht eines `security_consultant` auf ausdrücklich zugewiesene
  Praxen, ohne ihn als Praxisinhaber oder Kundenbenutzer zu modellieren

**`practice_invitations`**

- Praxis, normalisierte Ziel-E-Mail, vorgesehene Rolle
- `delivery_channel`: `in_person_code` (Primärkanal, Entscheidung @Hussam
  2026-07-24) oder `email_link` (Fallback)
- Status `pending | accepted | expired | revoked`
- Ablaufzeit, Initiator, Annahmezeit
- nur Hash/Provider-Referenz eines Nachweises, niemals Klartexttoken oder
  Einmalcode

**`backoffice_audit_events`**

- append-only: Akteur, Aktion, Zieltyp/-ID, Praxis, Ergebnis, Zeitpunkt,
  Request-ID und erlaubte strukturierte Metadaten
- keine Passwörter, Tokens, Einmalcodes oder vollständigen sensiblen Payloads
- RLS: normale Benutzer können nicht schreiben oder ändern; Lesen nur für
  ausdrücklich berechtigte Plattformrollen
- `UPDATE`/`DELETE` werden durch Grants und Datenbankregeln auch für den
  regulären Backoffice-Schreibpfad verhindert; Korrekturen erfolgen durch ein
  neues, referenzierendes Ereignis
- personenbezogene Audit-Ereignisse werden regulär sechs Monate aufbewahrt und
  danach automatisch irreversibel anonymisiert
- `retention_until` macht die reguläre Frist je Ereignis nachvollziehbar; eine
  aktive Aufbewahrungssperre benötigt Ablaufdatum, Begründung und Setzzeitpunkt
- die Anonymisierung entfernt Akteur, Praxis-/Ziel-/Request-Bezüge,
  Freitext-Metadaten und Legal-Hold-Bezüge und reduziert den Zeitpunkt auf
  Tagesgenauigkeit

W4e erhält später eine spezialisierte Reset-Audit-Struktur oder einen streng
typisierten Ereignistyp auf dieser Grundlage. Vorher wird die GoTrue-OTP-TTL
und ihre projektweite Wirkung dokumentiert.

## 5. Professioneller Onboarding-Prozess

1. **Praxisentwurf:** Berater wählt Praxistyp und erfasst erforderliche
   Stammdaten. Der Datensatz ist `draft` und hat noch keinen aktiven Inhaber.
2. **Prüfung:** Pflichtfelder, Dubletten (Domain/E-Mail/Adresse) und
   Profilzuordnung werden geprüft. Ein Treffer blockiert nicht automatisch,
   sondern verlangt eine bewusste Klärung.
3. **Inhaber festlegen:** E-Mail und vorgesehene Rolle werden bestätigt. Der
   Administrator legt niemals ein dauerhaftes Benutzerpasswort fest.
4. **Einladung:** Ein zeitlich begrenzter Aktivierungsnachweis wird erzeugt.
   Primärkanal ist ein **persönlich übergebener Einmalcode** (Entscheidung
   @Hussam, 2026-07-24); ein E-Mail-Link bleibt als Fallback möglich. Der
   Einmalcode wird genau einmal angezeigt und nie persistiert oder geloggt.
5. **Benutzeraktivierung:** Der Inhaber bestätigt die Einladung, setzt sein
   eigenes Passwort und MFA und akzeptiert die jeweils erforderlichen
   Datenschutz-/Vertragsstände.
6. **Aktivierung:** Erst nach erfolgreicher Identitätsaktivierung und
   Mitgliedschaft wird die Praxis `active`.
7. **Assessment-Übergabe:** Die mobile App lädt die Praxis über die
   Mitgliedschaft, nicht ausschließlich über `owner_id`.

Einladungen sind widerrufbar, einmalig und zeitlich begrenzt. Erneutes Senden
erzeugt einen neuen Nachweis und invalidiert den vorherigen.

Während der Migration bleibt `practices.owner_id` als kompatibler Verweis auf
den primären Inhaber erhalten. Maßgeblich für neue Zugriffe wird
`practice_memberships`; Änderungen an Inhaberrollen aktualisieren den
Kompatibilitätsverweis nur über eine transaktionale serverseitige Funktion.

## 6. Backoffice-MVP

### Seiten

1. **Admin-Anmeldung**
   - Supabase Auth, MFA/AAL2, Session-Timeout, kein Service-Role-Key im Browser
2. **Praxisliste**
   - Suche nach Name/Ort/Status, serverseitige Pagination, keine sensiblen
     Assessment-Inhalte
3. **Praxis anlegen**
   - mehrstufig: Typ → Stammdaten → Ansprechpartner → Prüfung
4. **Praxisdetail**
   - Stammdaten, Status, Profil, verantwortliche Benutzer, Audit-Auszug
5. **Benutzer und Einladungen**
   - Einladung erzeugen/widerrufen/erneuern, Rolle ändern, Zugang sperren
6. **Audit**
   - filterbare Ereignisse; keine Bearbeiten-/Löschen-Funktion

### B3.1 – erster vertikaler UI-Slice (umgesetzt, Gegenprüfung offen)

- Route `/backoffice` als webexklusives internes Arbeitswerkzeug innerhalb der
  vorhandenen Expo-Web-Anwendung; kein öffentliches Self-Service-Sign-up.
- persönliche Supabase-Anmeldung und zwingendes AAL2-Gate; die Erhöhung erfolgt
  ausschließlich über einen bereits bestätigten TOTP-Faktor. Die Worker-API
  bleibt die autoritative Staff-/Capability-Grenze.
- tabgebundene Browser-Session über `sessionStorage`; native Clients verwenden
  weiterhin gerätegebundenes SecureStore.
- serverseitig gescopte Praxisliste über `/api/backoffice/practices`, lokale
  Suche innerhalb des geladenen ersten Slices und Statusübersicht.
- professionelle Praxisanlage mit Praxistyp, Pflicht-Stammdaten,
  Ansprechpartner, Anschrift, optionaler Domain, UI-Validierung sowie
  Idempotency-/Request-Headern; die serverseitige B2-Validierung bleibt
  maßgeblich.
- `lib/api/database.types.ts` wird ab diesem Slice versioniert und vom Supabase-
  Client tatsächlich als Schema-Vertrag verwendet.
- Noch folgende B3-Slices: serverseitige Pagination/Suche, Praxisdetail,
  Einladungs-/Mitgliederverwaltung, Consultant-Zuweisung und Audit-Ansicht.

### B3.2 – Praxisnavigation und Stammdaten (umgesetzt, Gegenprüfung offen)

- serverseitige, begrenzte Suche nach Name, E-Mail, Domain und Ort innerhalb
  des autorisierten Staff-Scopes; Suchsyntax, Offset und Seitengröße werden im
  Worker strikt validiert.
- limit+1-Pagination mit `hasMore`/`nextOffset`, ohne globalen Service-Role-
  Fetch und ohne clientseitiges Nachfiltern fremder Mandanten.
- Praxisdetailseite mit Profil, Onboarding-Status, Ansprechpartner und
  vollständigen Stammdaten; nicht zugewiesene Praxis und fehlende Praxis bleiben
  nach außen identisch.
- Stammdatenänderungen laufen ausschließlich über
  `backoffice_update_practice`, mit stabilen Idempotenz-/Request-IDs pro
  Bearbeitungsversuch und anschließendem Query-Refresh.
- Support erhält explizite Read-only-Permissions; Admin und zugewiesene
  Consultants dürfen bearbeiten. Als direkte Statusaktionen werden in diesem
  Slice nur `active ↔ suspended` angeboten. Einladung/Aktivierung folgt B3.3/B4;
  irreversible Archivierung erhält später einen eigenen Bestätigungsdialog.
- Noch folgende B3-Slices: Einladungs-/Mitgliederverwaltung,
  Consultant-Zuweisung und Audit-Ansicht.

### Bewusst nicht im ersten Schnitt

- Fragebogen, WLAN-Scan oder Berichtserstellung im Browser
- Abrechnung und Tarifautomatisierung
- White-Label-Self-Service
- W4e-Reset-Endpunkt vor belastbarer Authz und Audit
- frei konfigurierbare Rollen
- Massenimport

## 7. API- und Sicherheitsgrenze

- Browser → Worker/API → Supabase; privilegierte Admin-Operationen laufen
  niemals direkt mit einem Service-Role-Key aus dem Browser.
- Der Worker prüft für jede Aktion:
  1. gültige Supabase-Session,
  2. Plattformmitarbeiterstatus,
  3. konkrete Berechtigung,
  4. MFA/AAL2 beziehungsweise Step-up,
  5. Zielmandant und erlaubten Statusübergang,
  6. Rate-Limit und Audit.
- Eingaben werden serverseitig normalisiert und validiert. UI-Validierung ist
  nur Bedienhilfe.
- Schreiboperationen verwenden Idempotency-Keys, damit Wiederholungen keine
  doppelten Praxen oder Einladungen erzeugen.
- Fehlertexte verhindern Benutzer-/E-Mail-Enumeration.
- `suspended` sperrt neue Assessments und privilegierte Änderungen, löscht aber
  keine historischen Nachweise.
- Löschung folgt dem vorhandenen Datenschutz-Löschprozess; Audit-Ereignisse
  werden nach sechs Monaten automatisch irreversibel anonymisiert, nicht still
  inhaltlich verändert. Eine dokumentierte Aufbewahrungssperre ist nur für
  einen konkreten laufenden Sicherheits- oder Rechtsvorgang zulässig, zeitlich
  zu überprüfen und besonders zugriffsbeschränkt.

### Transparenz und Datenschutzinformation

Die sechsmonatige personenbezogene Aufbewahrung wird in den
Datenschutzinformationen für Backoffice- und betroffene Praxisbenutzer
ausdrücklich genannt. Der Hinweis beschreibt mindestens:

- Zweck der Auditierung und Rechtsgrundlage,
- betroffene Datenkategorien (Akteur, Aktion, Ziel, Praxis, Zeitpunkt,
  Ergebnis, Request-ID),
- zugriffsberechtigte Rollen beziehungsweise Empfängerkategorien,
- sechs Monate personenbezogene Speicherung,
- anschließende irreversible Anonymisierung,
- einen eng begrenzten Ausnahmefall für dokumentierte laufende Sicherheits-
  oder Rechtsvorgänge,
- Betroffenenrechte und Kontaktmöglichkeit.

Die Information muss bei beziehungsweise vor Beginn der Verarbeitung leicht
zugänglich sein, etwa beim Backoffice-Onboarding und dauerhaft über
„Datenschutz“ im Backoffice. Es ist kein Popup bei jeder protokollierten Aktion
und keine Einwilligung in die Sicherheitsprotokollierung erforderlich. Die
ausgelieferte Version der Datenschutzinformation wird nachvollziehbar
protokolliert.

Zusätzlich werden die Verarbeitung im Verzeichnis der
Verarbeitungstätigkeiten, die technische Anonymisierungsroutine und die
Zugriffskontrollen intern dokumentiert. Eine bloße Pseudonymisierung genügt
nicht als Anonymisierung: Bleibt eine Re-Identifizierung über Benutzer-,
Praxis- oder Request-Zuordnungen möglich, gelten die Daten weiterhin als
personenbezogen.

## 8. Berechtigungsmatrix für den MVP

| Aktion | platform_admin | security_consultant | support |
|---|---:|---:|---:|
| Praxis lesen | Ja | Nur ausdrücklich zugewiesene Praxen | Minimalansicht |
| Praxis anlegen/bearbeiten | Ja | Ja | Nein |
| Einladung erzeugen/widerrufen | Ja | Ja | Nein |
| Praxisrolle ändern | Ja | Begrenzt, nicht `practice_owner` entfernen | Nein |
| Plattformmitarbeitende verwalten | Ja | Nein | Nein |
| Audit lesen | Ja | Eigene/zugewiesene Praxis | Stark begrenzt |
| W4e-Reset initiieren | Später, Step-up | Später, Step-up + Berechtigung | Nein |

Ein letzter `practice_owner` darf nicht entfernt oder herabgestuft werden,
bevor ein neuer Inhaber aktiv bestätigt ist.

## 9. Umsetzungspakete

### B0 – Entscheidungen

Entschieden (@Hussam, 2026-07-24):

- MVP ausschließlich internes Backoffice, kein Self-Service.
- Aktivierungskanal: persönlich übergebener Einmalcode primär, E-Mail-Link als
  Fallback.
- `security_consultant` sieht nur ausdrücklich zugewiesene Praxen.
- Pflicht-Stammdaten bestätigt; `domain` optional.

Noch offen vor B1:

- Backoffice-Domain/Deployment und UI-Technik (rein technische Wahl, blockiert
  Schema/Authz nicht).

Audit-Entscheidung (@Hussam, 2026-07-24):

- sechs Monate personenbezogene Aufbewahrung;
- danach automatische irreversible Anonymisierung;
- transparente Aufnahme in die Datenschutzinformation;
- dokumentierte, eng begrenzte Aufbewahrungssperre nur für konkrete laufende
  Sicherheits- oder Rechtsvorgänge.

### B1a – Tenant/Autorisierung und Schema (umgesetzt)

Migration `supabase/migrations/20260724160000_backoffice_b1a_authz_schema.sql`;
56 pgTAP-Tests grün (`supabase db reset` + `rls_cross_tenant.sql`).

- Enum `practice_member_role` + Rangfunktion `practice_member_role_rank`
  (grobe RLS-Lesegrenze, keine Aktionsrechte).
- Tabellen `platform_staff`, `practice_memberships`,
  `staff_practice_assignments`, `practice_invitations`,
  `backoffice_audit_events` mit RLS, Grants und `force row level security`.
- additive Praxis-Pflichtfelder (Domain optional, auf DB-Ebene nullable –
  Pflicht wird in B2 erzwungen) und Statusmaschine
  `draft → invited → active → suspended → archived` (Default `active` für
  Bestand).
- **`can_access_practice` additiv um aktive `practice_memberships` erweitert**;
  `partner_practices` zählt nur noch für `white_label` (Cutover ohne
  Dual-Source). Alle Tenant-Guards nutzen die Funktion, daher projektweit wirksam.
- Backfill `owner_id` + Nicht-`white_label`-`partner_practices` →
  `practice_memberships`, mit Verifikations-Gate vor dem Cutover (Migration
  bricht ab, falls ein Zugriff nicht abgebildet ist).
- `transfer_practice_ownership`-RPC (atomar, service_role) + Trigger-Schutz des
  letzten aktiven `practice_owner`.
- `rls_cross_tenant.sql` + `RLS_PARTNER_ROLE_MATRIX.md` erweitert;
  Revocation-, Cutover- und Last-Owner-Negativtests grün.

Folgeaufgabe (mit B2): `lib/api/database.types.ts` regenerieren, sobald die
neuen Tabellen erstmals aus Worker/App gelesen werden.

### B1b – Retention/Anonymisierung (umgesetzt)

Migration `supabase/migrations/20260727113000_backoffice_audit_retention.sql`:

- `retention_until`, dokumentierte/zeitlich begrenzte Legal-Hold-Felder und
  `anonymized_at` auf `backoffice_audit_events`; Bestand erhält
  `created_at + 183 Tage`.
- `security definer`-RPC `anonymize_backoffice_audit_events` mit festem
  `search_path`; `execute` ist `PUBLIC`/`anon`/`authenticated` entzogen und nur
  `service_role` erlaubt. Weniger als 183 Tage sowie ungültige Batchgrößen
  werden abgelehnt.
- begrenzte, parallelausführungssichere Batches (`FOR UPDATE SKIP LOCKED`),
  idempotent; aktive dokumentierte Aufbewahrungssperren werden übersprungen.
- direkte und indirekte Identifikatoren werden entfernt: Akteur, Ziel-ID,
  Praxis-FK, Request-ID, Metadaten und Legal-Hold-Bezüge; freie
  Aktions-/Zieltexte werden neutralisiert und der Ereigniszeitpunkt auf den Tag
  reduziert. `retention_until` wird aus demselben tagesgenauen Zeitpunkt neu
  abgeleitet, damit darüber keine Sub-Tages-Präzision rekonstruierbar bleibt.
- täglicher Worker-Cron um 05:00 UTC, getrennt von Monitoring und
  E-Mail-Outbox-Retention.
- pgTAP deckt Mindestfrist, Batches, Idempotenz, Legal Hold, frische Ereignisse,
  RPC-Rechte und fehlende Re-Identifizierbarkeit ab; Worker-Test prüft den
  isolierten Cron-Pfad.
- append-only bleibt: kein `UPDATE`/`DELETE`-Grant im regulären Schreibpfad;
  ausschließlich die gehärtete Anonymisierungsfunktion verändert fällige
  Zeilen.

### B2 – Admin-API

- Praxis erstellen/lesen/ändern
- Einladung erzeugen/widerrufen
- Mitgliedschaften/Rollen verwalten
- Audit schreiben/lesen
- Idempotenz, Rate-Limits und sichere Fehlerverträge

### B3 – Weboberfläche

- Anmeldung/MFA
- Praxisliste, Anlage-Wizard, Detailseite
- Benutzer-/Einladungsverwaltung und Audit-Ansicht

### B4 – Aktivierung und mobile Übergabe

- Einladung annehmen, eigenes Passwort und MFA setzen
- aktive Praxis-Mitgliedschaft in App laden
- bisherigen direkten Sign-up deaktivieren oder klar als separaten
  Self-Service-Modus kennzeichnen

### B5 – W4e

- erst nach Abnahme von B1 bis B4
- B5a-Vertrag und OTP-TTL-Wirkung sind in
  `docs/W4E_ADMIN_PASSWORD_RESET_CONTRACT.md` dokumentiert: lokal gilt derzeit
  die projektweite E-Mail-OTP-TTL von 3600 Sekunden; der Zielwert 600 Sekunden
  benötigt vor Hosted-Änderung eine Staging-Regression aller betroffenen
  E-Mail-Auth-Flows
- admin-initiierten Reset mit verpflichtendem Sitzungswiderruf und
  eigener append-only RLS-Audit-Tabelle ergänzen
- vollständiger Sitzungswiderruf erfolgt nach erfolgreicher Passwortänderung
  über die Recovery-Session; bereits ausgestellte Access-JWTs bleiben höchstens
  bis zu ihrer konfigurierten JWT-TTL gültig

## 10. Abnahmekriterien

- Kein Backoffice-Zugriff ohne autoritative Plattformrolle und MFA/AAL2.
- Kein Service-Role-Key oder Recovery-Geheimnis gelangt in Browser-Bundles,
  Logs, Analytics oder Audit-Payloads.
- Mandantentrennung ist durch RLS- und Worker-Negativtests belegt.
- Jede privilegierte Änderung erzeugt genau ein unveränderliches Audit-Ereignis.
- Der normale Backoffice-Schreibpfad besitzt auf Audit-Ereignissen weder
  `UPDATE`- noch `DELETE`-Rechte.
- Doppelte Requests erzeugen keine doppelten Praxen, Einladungen oder Rollen.
- Ein Inhaber setzt sein Passwort selbst; Administratoren kennen es nicht.
- Der letzte aktive Praxisinhaber kann nicht versehentlich entfernt werden.
- Bestehende App-Benutzer und historische Assessments bleiben nach Migration
  erreichbar.
- Profiländerungen wirken nur auf neue Assessments.
- Datenschutzpflichten, Löschung und Aufbewahrung sind für neue Stammdaten und
  Audits dokumentiert.
- Ein automatisierter Test belegt die Anonymisierung fälliger Audit-Ereignisse
  nach sechs Monaten; der anonymisierte Datensatz erlaubt keine
  Re-Identifizierung über direkte oder indirekte Zuordnungen.

## 11. Entscheidungen (@Hussam, 2026-07-24)

Getroffen:

1. MVP ausschließlich internes Backoffice für Hussam und berechtigte
   Mitarbeitende; kein Self-Service-Bereich in diesem Schnitt.
2. Inhaber-Einladung primär über persönlich übergebenen Einmalcode; E-Mail-Link
   bleibt als Fallback möglich.
3. `security_consultant` sieht ausschließlich ausdrücklich zugewiesene Praxen.
4. Pflicht-Stammdaten bestätigt: Praxistyp, Anzeigename, rechtlicher Name,
   Ansprechpartner, geschäftliche E-Mail, Telefonnummer, Straße, PLZ, Ort und
   Land; Domain optional.
5. Personenbezogene Backoffice-Audit-Ereignisse werden sechs Monate
   aufbewahrt und danach automatisch irreversibel anonymisiert. Die
   Datenschutzinformation nennt Zweck, Datenkategorien, Rechtsgrundlage,
   Zugriffsrollen, Frist, Anonymisierung und Betroffenenrechte. Eine
   dokumentierte Aufbewahrungssperre bleibt auf konkrete laufende
   Sicherheits- oder Rechtsvorgänge begrenzt.
