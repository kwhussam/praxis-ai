# Web-Backoffice-Fundament

Status: Fachplan, noch keine Implementierungsfreigabe

Stand: 2026-07-24

Verantwortlich: Produktteam

## 1. Ziel und Produktgrenze

Das Web-Backoffice ist zunächst ein internes Arbeitswerkzeug für Hussam und
später ausdrücklich berechtigte Mitarbeitende. Es dient dazu, Praxen
professionell anzulegen, Inhaber einzuladen, Benutzerzugriffe zu verwalten und
den Onboarding-Status nachvollziehbar zu steuern.

Der erste Schnitt ist **kein öffentliches Self-Service-Portal** und ersetzt
nicht die mobile Assessment-App. Praxisinhaber bearbeiten im Backoffice
zunächst keine Fragebögen, Scans oder Berichte.

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

### `practices` erweitern

- `practice_kind`: `general | health`
- `legal_name`
- `display_name`
- `contact_first_name`, `contact_last_name`
- `contact_email`, `contact_phone`
- `street`, `postal_code`, `city`, `country_code`
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
- Status `pending | accepted | expired | revoked`
- Ablaufzeit, Initiator, Annahmezeit
- nur Hash/Provider-Referenz eines Nachweises, niemals Klartexttoken

**`backoffice_audit_events`**

- append-only: Akteur, Aktion, Zieltyp/-ID, Praxis, Ergebnis, Zeitpunkt,
  Request-ID und erlaubte strukturierte Metadaten
- keine Passwörter, Tokens, Einmalcodes oder vollständigen sensiblen Payloads
- RLS: normale Benutzer können nicht schreiben oder ändern; Lesen nur für
  ausdrücklich berechtigte Plattformrollen
- `UPDATE`/`DELETE` werden durch Grants und Datenbankregeln auch für den
  regulären Backoffice-Schreibpfad verhindert; Korrekturen erfolgen durch ein
  neues, referenzierendes Ereignis

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
   Der genaue Übergabekanal wird vor Umsetzung entschieden; E-Mail-Einladung
   und persönlich übergebener Einmalcode sind getrennte Varianten.
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
  werden nach festgelegter Frist minimiert/anonymisiert, nicht still verändert.

## 8. Berechtigungsmatrix für den MVP

| Aktion | platform_admin | security_consultant | support |
|---|---:|---:|---:|
| Praxis lesen | Ja | Zugewiesen/operativ erforderlich | Minimalansicht |
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

- Backoffice-Domain/Deployment und UI-Technik
- Aktivierungskanal für Inhaber
- Pflichtfelder und Aufbewahrungsfristen
- Zuordnung: Darf ein Berater alle Praxen sehen oder nur explizit zugewiesene?

### B1 – Autorisierung und Schema

- `platform_staff`, `practice_memberships`, `staff_practice_assignments`,
  `practice_invitations`, `backoffice_audit_events`
- additive Praxisfelder und Statusmaschine
- RLS, Grants, serverseitige Permission-Funktionen
- Migration bestehender `owner_id`-/`partner_practices`-Zugriffe

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
- OTP-TTL-Wirkung vorher dokumentieren
- admin-initiierten Reset mit verpflichtendem Sitzungswiderruf und
  append-only RLS-Audit ergänzen

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

## 11. Offene Entscheidungen für Hussam

1. Soll das MVP ausschließlich ein internes Backoffice für Hussam sein
   (Empfehlung) oder bereits einen Self-Service-Bereich für Praxisinhaber
   enthalten?
2. Wie wird die erste Inhaber-Einladung übergeben: E-Mail-Link, persönlich
   übergebener Einmalcode oder beide Varianten?
3. Darf ein `security_consultant` standardmäßig alle Praxen sehen oder nur
   ausdrücklich zugewiesene Praxen (Empfehlung: nur zugewiesen)?
4. Welche Stammdaten sind wirklich Pflicht? Empfohlen:
   Praxistyp, Anzeigename, rechtlicher Name, Ansprechpartner, geschäftliche
   E-Mail, Telefonnummer, Straße, PLZ, Ort und Land; Domain optional.
5. Welche Aufbewahrungsfrist gilt für Backoffice-Audit-Ereignisse? Sie muss
   vor Implementierung mit Datenschutz-/Nachweisanforderungen abgestimmt
   werden.
