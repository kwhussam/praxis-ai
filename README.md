# PraxisShield AI

PraxisShield AI ist eine native Mobile-App fuer Cybersecurity-Checks, DSGVO-nahe Sicherheitsdokumentation und kontinuierliches Monitoring in deutschen Arztpraxen. Die App kombiniert Fragebogen, lokale WLAN-/Netzwerkpruefungen, externe Domain-Checks und KI-gestuetzte Berichte zu einem verstaendlichen Sicherheitsstatus fuer Praxisinhaber und IT-Partner.

Das zentrale Versprechen: kein tiefes IT-Wissen, keine Installation auf Praxis-PCs und eine nachvollziehbare Sicherheitsbewertung innerhalb weniger Minuten.

## Inhaltsverzeichnis

- [Ziel](#ziel)
- [Kernfunktionen](#kernfunktionen)
- [Zielgruppen](#zielgruppen)
- [Tech Stack](#tech-stack)
- [Architektur](#architektur)
- [Projektstruktur](#projektstruktur)
- [Voraussetzungen](#voraussetzungen)
- [Installation](#installation)
- [Konfiguration](#konfiguration)
- [Entwicklung](#entwicklung)
- [Tests und Qualitaet](#tests-und-qualitaet)
- [Datenmodell](#datenmodell)
- [Security und Datenschutz](#security-und-datenschutz)
- [Scoring-Modell](#scoring-modell)
- [Monitoring](#monitoring)
- [KI-Berichte und PDF-Export](#ki-berichte-und-pdf-export)
- [Deployment-Hinweise](#deployment-hinweise)
- [Roadmap](#roadmap)
- [Dokumentation](#dokumentation)
- [Lizenz](#lizenz)

## Ziel

Viele Arztpraxen haben sensible Patientendaten, kleine IT-Teams und hohe regulatorische Anforderungen. PraxisShield AI soll diese Luecke schliessen, indem technische Risiken und organisatorische Nachweise in einer mobilen, verstaendlichen Oberflaeche zusammengefuehrt werden.

Die App bewertet unter anderem:

- Zugriffsschutz und MFA-Nachweise
- Backup- und Restore-Prozesse
- Patchmanagement und Update-Stand
- WLAN-Verschluesselung, lokale Netzwerkdienste und Segmentierung
- Domain-, DNS-, TLS- und E-Mail-Sicherheit
- DSGVO-relevante Dokumentation und Verantwortlichkeiten
- Monitoring-Ereignisse wie SSL-Ablauf, DMARC-Probleme, offene Ports oder Leak-Hinweise

## Kernfunktionen

### Mobile Praxis-App

- Dashboard mit aktuellem Security Score, Ampelstatus und Score-Historie
- Praxis-Check aus Fragebogen, WLAN-Scan und externem Domain-Check
- Inventar fuer Geraete, Access Points, Domains, Subdomains, E-Mail-Adressen, Provider und kritische Systeme
- Monitoring-Ansicht fuer SSL, DNS, Ports, Leaks und Domain-Reputation
- Berichtswesen mit KI-generierten Risiken, Quick Wins und DSGVO-Einschaetzung
- PDF-Export fuer Audit- und Management-Berichte

### Security Checks

- Regelbasierte, versionierte Scoring-Engine
- Separate Evidence-Coverage-Bewertung fuer die Belastbarkeit der Datenquellen
- Lokale WLAN- und Netzwerkpruefungen ohne Zugriff auf Patientendaten oder Dateien
- Rogue-Device- und Rogue-Access-Point-Erkennung ueber Inventarreferenz
- Externe Checks fuer DNS, TLS, SPF, DKIM, DMARC, MTA-STS, TLS-RPT, CAA, Subdomains, Reputation und Leaks
- Providerstatus fuer externe APIs: `active`, `not_configured` oder `unavailable`

### SaaS- und Partner-Funktionen

- Supabase Auth und Row Level Security fuer praxisbezogene Datenisolierung
- Planmodell fuer `free`, `audit`, `monitoring` und `compliance`
- White-Label-Grundlage fuer IT-Partner
- Partnerzugriffe ueber Rollen und Praxisfreigaben
- Audit-Log, Einwilligungslog und Datenschutz-Endpunkte fuer Export und Loeschanforderungen

## Zielgruppen

- Arztpraxen, die ohne eigene IT-Abteilung eine erste Sicherheitsbewertung benoetigen
- Praxisinhaber, die Risiken und konkrete Massnahmen ohne Fachjargon verstehen wollen
- IT-Dienstleister, die mehrere Praxen betreuen und standardisierte Audits liefern
- White-Label-Partner, die PraxisShield unter eigener Marke anbieten moechten

## Tech Stack

| Bereich | Technologie |
| --- | --- |
| Mobile App | React Native, Expo SDK 51, Expo Router |
| UI | NativeWind, React Native Reanimated, Moti, Expo Blur, Lucide Icons |
| State/Data | Zustand, TanStack Query, MMKV |
| Charts/Visualisierung | React Native SVG, Victory Native XL, Custom Score/Radar Components |
| Backend | Supabase Auth, Postgres, Realtime, Edge Functions |
| Edge API | Hono.js auf Cloudflare Workers |
| KI | Anthropic Claude API ueber Supabase Edge Function oder Cloudflare Worker |
| Security Provider | SecurityTrails, Shodan, HaveIBeenPwned, MXToolbox, VirusTotal, SSL Labs, Cloudflare DNS |
| Tests | Jest, jest-expo, React Native Testing Library, MSW |
| CI | GitHub Actions |

## Architektur

PraxisShield AI ist in drei Laufzeitbereiche getrennt.

### Mobile App

Die Expo-App steuert Nutzerfuehrung, lokale Scans, Offline-State, Haptics, Push-Registrierung und die Darstellung von Scores, Findings, Inventar und Berichten. Persistenter lokaler Zustand liegt in MMKV und Zustand-Stores.

### Supabase

Supabase verwaltet Authentifizierung, Praxisdaten, Checks, Reports, Monitoring-Events, Monitoring-Snapshots, WLAN-Scans, Consent Logs und Audit-Nachweise. Row Level Security sorgt dafuer, dass Praxisdaten nur fuer berechtigte Nutzer und Partner sichtbar sind.

### Cloudflare Worker

Der Hono Worker kapselt externe Security-Provider und die KI-Berichterstellung. API-Keys bleiben serverseitig. Ergebnisse werden normalisiert, versioniert und fuer Scoring, Monitoring und Berichte nutzbar gemacht.

Vereinfachter Datenfluss:

1. Nutzer meldet sich an und erstellt oder laedt eine Praxis.
2. Fragebogen und lokale Scans erzeugen strukturierte Checkdaten.
3. Externe Checks laufen ueber den Worker und externe Provider.
4. Scoring berechnet Sicherheitswert, Kategorien, Findings und Evidence Coverage.
5. Reports und Monitoring-Snapshots werden in Supabase persistiert.
6. Realtime-Events aktualisieren die Monitoring-Ansicht in der App.

## Projektstruktur

```text
app/                         Expo Router Screens und Layouts
app/(auth)/                  Welcome, Login und Onboarding
app/(tabs)/dashboard/        Security Dashboard
app/(tabs)/check/            Fragebogen, WLAN-Scan und Check-Start
app/(tabs)/inventory/        Praxis-Inventar und Netzwerkreferenzen
app/(tabs)/monitoring/       Realtime Monitoring und manuelle Scans
app/(tabs)/report/           KI-Berichte und Detailansicht
components/ui/               PraxisShield Design System
components/charts/           Score-, History- und Risikovisualisierung
components/modules/          Fachmodule fuer Checks, Findings und Reports
constants/                   Farben, Typografie und Animationen
lib/ai/                      Report-Schema, KI-Client und PDF-Export
lib/api/                     API- und Supabase-Clients
lib/billing/                 Plaene und White-Label-Typen
lib/config/                  Laufzeitkonfiguration
lib/inventory/               Inventarlogik und Rogue-Erkennung
lib/monitoring/              Monitoring-Service, Typen und Notifications
lib/security/                Scoring, WLAN, DNS, Router, DHCP, IPv6 und externe Checks
lib/store/                   Zustand Stores
plugins/                     Expo Config Plugins
supabase/                    Migrations, Edge Functions und RLS-Tests
workers/hono/                Cloudflare Worker API
docs/                        Architektur-, Scoring- und Inventar-Dokumentation
```

## Voraussetzungen

- Node.js 20 oder neuer
- npm
- Expo CLI beziehungsweise `npx expo`
- Xcode fuer iOS-Entwicklung
- Android Studio fuer Android-Entwicklung
- Supabase CLI fuer lokale Datenbank- und Edge-Function-Entwicklung
- Wrangler CLI fuer Cloudflare-Worker-Entwicklung

## Installation

Repository klonen und Abhaengigkeiten installieren:

```bash
npm install
```

Environment-Datei anlegen:

```bash
cp .env.example .env
```

Mobile App starten:

```bash
npm run start
```

iOS oder Android starten:

```bash
npm run ios
npm run android
```

Web-Preview starten:

```bash
npm run web
```

## Konfiguration

Die wichtigsten Variablen stehen in `.env.example`.

| Variable | Zweck |
| --- | --- |
| `EXPO_PUBLIC_APP_ENV` | Optional: `development`, `demo`, `production` oder `test` |
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase-Projekt-URL fuer die Mobile App |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Oeffentlicher Supabase Anon Key fuer die Mobile App |
| `EXPO_PUBLIC_API_BASE_URL` | Basis-URL des Workers, lokal meist `http://localhost:8787` |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-seitiger Supabase Service Role Key |
| `SUPABASE_ANON_KEY` | Server-seitiger Supabase Anon Key |
| `DATA_ENCRYPTION_KEY` | Schluessel fuer serverseitige Payload-Verschluesselung |
| `ANTHROPIC_API_KEY` | API-Key fuer KI-Berichte |
| `ANTHROPIC_MODEL` | Modellname fuer die Reportgenerierung |
| `SECURITYTRAILS_API_KEY` | Subdomain- und DNS-Historienpruefung |
| `SHODAN_API_KEY` | Externe Port- und Exposure-Pruefung |
| `HIBP_API_KEY` | Leak-Pruefung ueber HaveIBeenPwned |
| `MXTOOLBOX_API_KEY` | Mail- und DNS-Sicherheitschecks |
| `VIRUSTOTAL_API_KEY` | Domain-Reputation und Malware-/Phishing-Signale |

Wichtig: Secrets duerfen nicht in die Mobile App gebundelt werden. Nur Variablen mit `EXPO_PUBLIC_` sind fuer den Client vorgesehen.

## Entwicklung

### App starten

```bash
npm run start
```

### Cloudflare Worker lokal starten

```bash
npm run workers:dev
```

Der Worker nutzt `workers/hono/wrangler.toml` und stellt unter anderem diese Endpunkte bereit:

- `GET /health`
- `POST /api/check/external`
- `POST /api/check/questionnaire`
- `POST /api/report/generate`
- `POST /api/report/pdf`
- `GET /api/reports`
- `GET /api/reports/:id`
- `GET /api/monitoring/status`
- `POST /api/monitoring/run`
- `GET /api/monitoring/history`
- `POST /api/alert/acknowledge`
- `POST /api/privacy/delete`
- `GET /api/privacy/export`
- `POST /api/legal/avv/accept`
- `POST /api/legal/consent`

### Supabase lokal verwenden

Datenbank zuruecksetzen und Migrationen anwenden:

```bash
supabase db reset
```

TypeScript-Typen aus der lokalen Supabase-Instanz generieren:

```bash
npm run supabase:types
```

## Tests und Qualitaet

Alle Tests ausfuehren:

```bash
npm run test
```

Gezielte Test-Suites:

```bash
npm run test:unit
npm run test:worker
npm run test:rls
```

Linting und Typecheck:

```bash
npm run lint
npm run typecheck
```

Die CI-Pipeline in `.github/workflows/ci.yml` fuehrt auf Push und Pull Request aus:

- `npm ci`
- `npm run typecheck`
- `npm run lint`
- `npm run test:unit`
- `npm run test:worker`
- `npm run test:rls`

## Datenmodell

Die Supabase-Migrationen definieren unter anderem:

- `practices`: Praxis-Stammdaten, Plan und Partnerzuordnung
- `white_label_partners`: White-Label-Partner, Branding und Partnerkonfiguration
- `partner_practices`: Rollenbasierte Partnerfreigaben fuer Praxen
- `security_checks`: Fragebogen-, WLAN-, externe und Full-Checks
- `reports`: strukturierte und verschluesselte Reportinhalte
- `monitoring_events`: offene und geloeste Monitoring-Ereignisse
- `monitoring_snapshots`: historische Monitoring-Zustaende und Scores
- `wlan_scans`: lokale WLAN-/Netzwerkscan-Ergebnisse
- `external_check_usage`: Quoten und Nutzung fuer externe Checks
- `practice_access_audit`: Audit-Trail fuer sensible Aktionen
- `consent_log`: Einwilligungen und Widerrufe
- `deletion_requests`: Datenschutz- und Loeschvorgaenge
- `data_processing_agreements`: AVV-Annahmen
- `email_outbox`: Versandqueue fuer Datenschutz- und Systemmails
- `partner_plan_pricing`: Partnerpreise und Margen

## Security und Datenschutz

PraxisShield ist darauf ausgelegt, Security-Metadaten zu bewerten, ohne Patientendaten, Praxissoftware-Inhalte oder Dateien zu lesen.

Wichtige Prinzipien:

- Keine Drittanbieter-API-Keys im Mobile Client
- Supabase Anon Key nur mit aktiver Row Level Security
- Service Role Keys nur in serverseitigen Umgebungen
- Lokale Netzwerkpruefungen lesen keine Shares, Dateien, Druckjobs, Datenbankinhalte oder medizinische Protokollinhalte
- Leak-Pruefungen fuer E-Mail-Adressen nur nach expliziter Einwilligung
- Nicht gepruefte Bereiche werden als `not_checked` oder `unavailable` markiert und nicht als sicher bewertet
- Reports und Checks fuehren Scoring- und Formatversionen fuer spaetere Auditierbarkeit
- Audit-Logs, Consent Logs, Datenschutzexport und Loeschanforderungen sind im Datenmodell vorgesehen

Hinweis: PraxisShield AI ist ein technisches Sicherheits- und Dokumentationswerkzeug. Die Ergebnisse ersetzen keine individuelle Rechtsberatung, Datenschutzberatung oder vollstaendige manuelle IT-Sicherheitspruefung.

## Scoring-Modell

Die Scoring-Engine ist regelbasiert, versioniert und auditierbar. Die Regeln liegen in `lib/security/scoring.ts` und bewerten Kategorien wie:

- `access_control`
- `backup`
- `email_security`
- `network`
- `dsgvo`
- `updates`

Neben dem Security Score berechnet PraxisShield eine Evidence Coverage. Diese beschreibt, wie belastbar die Datenbasis je Pruefmodul ist:

- `measured`: technisch gemessen
- `inferred`: aus anderen Befunden abgeleitet
- `self_reported`: per Fragebogen oder Nachweis erfasst
- `not_checked`: nicht geprueft
- `unavailable`: technisch nicht verfuegbar

Ampelwerte:

- Gruen: Score ab 75
- Gelb: Score ab 50
- Rot: Score unter 50

Details stehen in `docs/SCORING.md`.

## Monitoring

Das Monitoring prueft externe Ziele wie Domains, Subdomains und freigegebene E-Mail-Adressen. Unterstuetzte Module:

- SSL/TLS und Zertifikatsablauf
- DNS-Aenderungen und DNS-Fingerprints
- SPF, DKIM, DMARC, MTA-STS, TLS-RPT und CAA
- Externe Ports und bekannte Schwachstellen
- Leak- und Breach-Hinweise
- Domain-Reputation, Malware- und Phishing-Signale

Monitoring-Ergebnisse werden als Snapshots gespeichert. Ereignisse koennen als `new`, `recurring`, `resolved` oder `unchanged` bewertet werden, damit Praxen Veraenderungen ueber Zeit nachvollziehen koennen.

## KI-Berichte und PDF-Export

PraxisShield erzeugt strukturierte KI-Berichte fuer Praxisinhaber und IT-Partner. Die Berichte enthalten:

- Executive Summary
- Gesamtrisiko und Ampelstatus
- Security Score und Kategorie-Scores
- Top-Risiken mit Evidenzquelle und Zuverlaessigkeit
- Business Impact
- konkrete Massnahmen
- Aufwand und Kostenrahmen
- Quick Wins
- DSGVO-Einschaetzung
- Hinweise zu nicht geprueften oder eingeschraenkt belastbaren Bereichen

Berichte koennen in der App angezeigt und als PDF exportiert werden.

## Deployment-Hinweise

### Mobile App

Die App ist als Expo/React-Native-Projekt aufgebaut. Fuer native WLAN- und Netzwerkfunktionen werden iOS- und Android-Berechtigungen in `app.json` sowie eigene Expo Config Plugins verwendet.

### Supabase

Vor dem Produktivbetrieb muessen folgende Punkte geprueft werden:

- Migrationen angewendet
- RLS-Policies aktiv
- Service Role Key nur serverseitig gesetzt
- Realtime fuer Monitoring-Tabellen aktiviert
- Edge Functions mit benoetigten Secrets konfiguriert

### Cloudflare Worker

Der Worker benoetigt produktive Secrets fuer Supabase, Anthropic und externe Security-Provider. Cron Trigger sind in `workers/hono/wrangler.toml` vorbereitet.

## Roadmap

Aktuelle naechste Schritte:

- Native WLAN-/Netzwerkmodule weiter ausbauen
- Push-Token-Registrierung und Alert-Kanaele finalisieren
- PDF-Branding fuer White-Label-Partner erweitern
- Externe Provider-Integrationen weiter haerten
- Persistenz und Vergleichslogik fuer Monitoring-Deltas ausbauen
- Partnerportal und Mandantenverwaltung erweitern
- DSGVO-Dokumentations- und Notfallplan-Workflows vertiefen

## Dokumentation

Weitere technische Details:

- `docs/ARCHITECTURE.md`
- `docs/SCORING.md`
- `docs/INVENTORY.md`

## Lizenz

Dieses Repository ist aktuell als private/proprietaere Codebasis ausgelegt. Falls eine externe Nutzung oder Weitergabe geplant ist, sollte eine explizite `LICENSE`-Datei ergaenzt werden.
