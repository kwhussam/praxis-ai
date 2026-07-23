# PraxisShield AI — Vollständiges Repository-Review

**Datum**: 2026-07-21
**Scope**: Gesamtes Repository (nicht nur der aktuelle Git-Diff) — Mobile App (`app/`, `components/`, `lib/`), Cloudflare Worker (`workers/hono/src/`), Supabase-Schema/RLS (`supabase/migrations/`, `supabase/tests/`), Konfiguration (`package.json`, `app.json`, `app.config.js`, `wrangler.toml`, `.env.example`, `eslint.config.mjs`, `jest.config.js`, `metro.config.js`, `tailwind.config.js`).
**Methodik**: 8 spezialisierte Review-Agenten liefen parallel, jeder mit vollständigem Lesen der relevanten Dateien (nicht nur Diff-Hunks) und unabhängiger Verifikation gegen den aktuellen Code-Stand (nicht gegen den älteren informellen Tracker `Praxis-AI-Findings-Tracker.md`, der nur als Kontext diente):

| Bereich | Reviewer |
|---|---|
| Architektur, Konfigurationsmanagement | ecc:architect |
| Security, Authentication/Authorization, Datenschutz, Logging, hardcodierte Secrets | ecc:security-reviewer |
| Datenbankzugriffe/RLS, API-Design | ecc:database-reviewer |
| Korrektheit, Type Safety, Error Handling | ecc:typescript-reviewer |
| Frontend, React Native/Mobile | ecc:react-reviewer |
| Accessibility (WCAG 2.2 AA) | ecc:a11y-architect |
| Performance | ecc:performance-optimizer |
| Wartbarkeit, Dead Code, Duplikate, Testbarkeit, Dependency Management | ecc:refactor-cleaner |

**Es wurden keine Code-Änderungen vorgenommen** — dieser Bericht ist reine Analyse.

---

## Executive Summary

| Kategorie | Critical | High | Medium | Low | Gesamt |
|---|---|---|---|---|---|
| Architektur & Konfiguration (ARCH) | 0 | 0 | 4 | 4 | 8 |
| Security / Auth/AuthZ / Datenschutz / Logging (SEC) | 0 | 0 | 4 | 2 | 6 |
| Datenbankzugriffe & API-Design (DB) | 0 | 1 | 8 | 4 | 13 |
| Korrektheit / Type Safety / Error Handling (TS) | 0 | 1 | 1 | 3 | 5 |
| Frontend & React Native/Mobile (RN) | 0 | 4 | 6 | 3 | 13 |
| Accessibility (A11Y) | 1 | 6 | 3 | 3 | 13 |
| Performance (PERF) | 2 | 1 | 5 | 5 | 13 |
| Wartbarkeit / Dead Code / Duplikate / Testbarkeit / Dependencies (MAINT) | 0 | 2 | 7 | 4 | 13 |
| **Gesamt** | **3** | **15** | **38** | **28** | **84** |

### Wichtiger Kontext: Viel ist seit dem letzten informellen Audit bereits behoben

Der ältere Tracker (`Praxis-AI-Findings-Tracker.md`) listete zahlreiche kritische Authorization- und Datenintegritätsprobleme. Alle Reviewer haben unabhängig verifiziert, dass folgende Punkte **aktuell bereits gefixt** sind:

- Fehlende/optionale Rollenprüfungen auf `privacy/delete`, `privacy/export`, `monitoring/run`, `report/generate`, `check/external`, `alert/acknowledge` (ehem. F-022/F-023/F-036–039/F-042) — jetzt konsequent über `requirePracticeAccess(..., requiredRole)`.
- Privacy-Deletion ist jetzt eine atomare `security definer`-RPC (`complete_privacy_deletion`), die `wlan_scans`, `practices`, `security_checks`, `reports`, `monitoring_events`, `monitoring_snapshots` abdeckt (ehem. F-031/F-036).
- Consent-Type-Mismatch zwischen App und DB-Constraint behoben (ehem. F-024).
- Composite-Index für die Dashboard-Query auf `security_checks` vorhanden (ehem. F-032/F-046).
- Timeouts/AbortController für praktisch alle Outbound-Calls im Worker vorhanden (ehem. F-025/F-045) — mit einer Ausnahme, siehe PERF-03/SEC-05.
- AI-Report fällt nicht mehr automatisch auf `SAMPLE_REPORT` zurück; Demo-Daten sind jetzt sauber über `AppConfig.isDemoMode` gated (ehem. F-009/F-056).
- `npm run lint` und `npm run typecheck` laufen aktuell sauber durch.

### Critical- und High-Findings auf einen Blick (18 von 84)

| ID | Titel | Severity | Kategorie |
|---|---|---|---|
| A11Y-01 | Inventory-Screen: durchgängig fehlende A11y-Semantik | Critical | Accessibility |
| PERF-01 | ~150-160 Outbound-Fetches pro Domain-Check — Subrequest-Limit-Risiko | Critical | Performance |
| PERF-02 | Cron führt bei jedem Trigger die volle teure Prüfung aus statt modulweise | Critical | Performance |
| DB-01 | Privacy-Export unvollständig (WLAN-Scans, Monitoring-Snapshots, AVV fehlen) | High | Datenbankzugriffe/API |
| TS-01 | Fehlgeschlagene Provider-HTTP-Antworten werden als "sauber" statt "unavailable" behandelt | High | Korrektheit/Error Handling |
| RN-01 | Kein `eslint-plugin-react-hooks`/`jsx-a11y` konfiguriert | High | Frontend |
| RN-02 | `Screen` ignoriert Safe-Area-Insets | High | React Native/Mobile |
| RN-03 | Kein `KeyboardAvoidingView` irgendwo in der App | High | React Native/Mobile |
| RN-04 | `ScoreRing` nutzt manuellen `setInterval`-Animationsloop | High | React Native/Mobile |
| A11Y-02 | `Ampel`/`TrafficLight`: Status nur über Farbe | High | Accessibility |
| A11Y-03 | `BarChart`-Werte standardmäßig nicht zugänglich | High | Accessibility |
| A11Y-04 | `RadarChart`/`ScoreHistory`: vollständig unzugängliche SVG-Charts | High | Accessibility |
| A11Y-05 | `VulnerabilityCard`: reine Swipe-Geste ohne Alternative | High | Accessibility |
| A11Y-06 | `DomainCheck`-Status nur über Farbpunkt | High | Accessibility |
| A11Y-07 | Monitoring-Screen: unbeschriftete Icon-Buttons/Chips/Checkbox | High | Accessibility |
| PERF-03 | `checkHttpsSignal` ohne Timeout-Wrapper | High | Performance |
| MAINT-01 | Score-Tone-Mapping 7× dupliziert, inkonsistente Schwellen (75/50 vs. 80/55) | High | Duplikate/Hardcodierte Werte |
| MAINT-12 | Kern-Dependencies mehrere Majors veraltet (Expo 51→57 etc.) | High | Dependency Management |

---

## 1. Architektur & Konfigurationsmanagement (ARCH)

Geprüft: Layering (App ↔ Supabase ↔ Worker), Datenfluss, Evidence-Coverage-Modell, `app.config.js`/`app.json`/`tsconfig.json`/`.env.example`/`wrangler.toml`/`supabase/config.toml`.

**Positiv verifiziert**: Die Boundary „nur der Worker hält Provider-Keys" ist eingehalten; die App ruft externe Checks ausschließlich über den Worker auf. Das Evidence-Coverage-Modell in `lib/security/scoring.ts` ist konsistent umgesetzt (fehlende Evidenz → 0 Punkte + `passed:false`, Selbstauskunft auf 50% gekappt, Grün nur mit `measured`/`inferred`). `lib/` importiert nirgends aus `app/` — saubere Layerung.

### [ARCH-01] Zentrale Env-Validierung erzwingt weder HTTPS noch Vollständigkeit für die API-Base-URL
- **Severity**: Medium
- **Kategorie**: Konfigurationsmanagement
- **Datei/Zeile**: `lib/config/environment.ts:18, 21-23`; `.env.example:3`
- **Beschreibung**: Die zentrale `AppConfig`-Validierung prüft im Produktionsmodus nur `supabaseUrl`/`supabaseAnonKey`. `apiBaseUrl` fällt still auf `http://localhost:8787` zurück (`?? "http://localhost:8787"`) und wird nie validiert — weder auf Vorhandensein noch auf `https://`. `.env.example` gibt denselben `http://`-Default vor.
- **Mögliche Auswirkung**: Ein Produktions-Build ohne korrekt gesetztes `EXPO_PUBLIC_API_BASE_URL` versucht still, `localhost` bzw. eine `http://`-URL anzusprechen. Auf iOS (ATS) scheitert das stumm; ein versehentlich gesetzter `http://`-Endpunkt riskiert unverschlüsselten Auth-Token-Verkehr.
- **Empfohlene Lösung**: Im Produktions-Guard zusätzlich prüfen, dass `apiBaseUrl` gesetzt ist und mit `https://` beginnt; sonst `throw`. Fallback auf `localhost` nur außerhalb `production` erlauben.
- **Geschätztes Änderungsrisiko**: Niedrig — isolierte Ergänzung in einer Datei.
- **Benötigte Tests**: Unit-Test für `AppConfig`, der bei `production` + fehlendem/`http://`-`apiBaseUrl` einen Fehler erwartet.
- **Sicher automatisch behebbar**: Ja

### [ARCH-02] `.env.example` veraltet gegenüber tatsächlich konsumierten Env-Variablen; kein Worker-Secrets-Template
- **Severity**: Medium
- **Kategorie**: Konfigurationsmanagement
- **Datei/Zeile**: `.env.example:1-14`; `workers/hono/src/index.ts:9-26`
- **Beschreibung**: Das `Env`-Interface des Workers verlangt u. a. `SUPABASE_URL`, `RESEND_API_KEY`, `DELETION_FROM_EMAIL`, `SECURITY_PROVIDER_TIMEOUT_MS`, `MONITORING_CONCURRENCY_LIMIT`. Keine dieser Variablen steht in `.env.example`. Besonders auffällig: `.env.example` enthält nur `EXPO_PUBLIC_SUPABASE_URL`, nicht das vom Worker benötigte server-seitige `SUPABASE_URL` (Worker bricht ohne dieses ab). Es existiert kein `workers/hono/.dev.vars.example`.
- **Mögliche Auswirkung**: Neue Entwickler/Deployments konfigurieren den Worker unvollständig, was zu Laufzeit-Ausfällen statt klaren Startfehlern führt.
- **Empfohlene Lösung**: `.env.example` um alle app-seitig gelesenen `EXPO_PUBLIC_*`-Variablen ergänzen; separates `workers/hono/.dev.vars.example` mit allen server-seitigen Variablen anlegen.
- **Geschätztes Änderungsrisiko**: Niedrig — reine Dokumentations-/Template-Dateien.
- **Benötigte Tests**: Optionaler CI-Check, der referenzierte Env-Keys gegen die Templates abgleicht.
- **Sicher automatisch behebbar**: Ja

### [ARCH-03] CORS erlaubt global alle Origins, fest verdrahtet ohne Umgebungssteuerung
- **Severity**: Medium
- **Kategorie**: Konfigurationsmanagement
- **Datei/Zeile**: `workers/hono/src/index.ts:475`
- **Beschreibung**: `app.use("*", cors({ origin: "*", allowMethods: ["GET", "POST", "OPTIONS"] }))` — Origin hartcodiert auf `*`, nicht über `APP_ENV`/Env-Var gesteuert. `DELETE`/`PATCH`/`PUT` fehlen zudem in `allowMethods`.
- **Mögliche Auswirkung**: Jeder Web-Origin darf die API ansprechen — unnötige Angriffsfläche in Produktion; Methodenliste kann künftig Preflights für `DELETE`-Endpunkte brechen.
- **Empfohlene Lösung**: Erlaubte Origins aus Konfiguration/Env ableiten; `allowMethods` konsistent mit tatsächlich genutzten Methoden halten.
- **Geschätztes Änderungsrisiko**: Mittel — kann Web-Aufrufe brechen, für den nativen Client unkritisch.
- **Benötigte Tests**: Worker-Test für Preflight/Origin-Verhalten pro Umgebung.
- **Sicher automatisch behebbar**: Nein

### [ARCH-04] Worker `index.ts` ist ein God-Module (3726 Zeilen) mit vermischten Zuständigkeiten
- **Severity**: Medium
- **Kategorie**: Architektur
- **Datei/Zeile**: `workers/hono/src/index.ts` (gesamt; Routing ~475ff, Auth/Access ~1528ff, Anthropic ~1372ff, Provider-Fetches ~2885-3373, Privacy)
- **Beschreibung**: Eine einzelne Datei bündelt Routing, Auth/Rollenprüfung, Quotas, AI-Report-Generierung, PDF/HTML, Privacy-Export/-Delete, Monitoring-Cron und alle externen Provider-Adapter.
- **Mögliche Auswirkung**: Erschwerte Wartung, hohes Risiko unbeabsichtigter Seiteneffekte, schwierige gezielte Testbarkeit, hoher Merge-Konflikt-Druck.
- **Empfohlene Lösung**: In Module aufteilen: `routes/`, `auth/`, `providers/`, `ai/`, `privacy/`, `monitoring/`, `supabase-rest`. Schrittweise, testgetrieben.
- **Geschätztes Änderungsrisiko**: Mittel — reine Umstrukturierung, aber breite Fläche.
- **Benötigte Tests**: Bestehende Worker-Tests müssen nach jedem Extraktionsschritt grün bleiben.
- **Sicher automatisch behebbar**: Nein

### [ARCH-05] `wrangler.toml` setzt `APP_ENV="development"` als einzige Umgebung; Variable im Worker nie gelesen
- **Severity**: Low
- **Kategorie**: Konfigurationsmanagement
- **Datei/Zeile**: `workers/hono/wrangler.toml:5-6`; `workers/hono/src/index.ts:12`
- **Beschreibung**: `[vars] APP_ENV = "development"` ist der einzige Var-Eintrag, kein `[env.production]`-Block. `APP_ENV` ist im `Env`-Interface deklariert, wird aber nirgends im Worker-Code gelesen.
- **Mögliche Auswirkung**: Verwirrung über die laufende Umgebung; inkonsistente Grundlage für künftige umgebungsabhängige Logik.
- **Empfohlene Lösung**: `APP_ENV` entfernen oder `[env.production]`-Block anlegen und Variable tatsächlich auswerten.
- **Geschätztes Änderungsrisiko**: Niedrig.
- **Benötigte Tests**: Keine funktionalen; ggf. Smoke-Deploy je Umgebung.
- **Sicher automatisch behebbar**: Ja

### [ARCH-06] Kein `eas.json` / kein versioniertes Mobile-Release- und Environment-Mapping im Repo
- **Severity**: Low
- **Kategorie**: Konfigurationsmanagement
- **Datei/Zeile**: Repo-Root (kein `eas.json`, kein `.dev.vars.example`); `app.json`
- **Beschreibung**: Kein zentrales Mapping Environment → Supabase-Projekt/API-Base. Umgebungswerte kommen ausschließlich direkt aus `process.env`.
- **Mögliche Auswirkung**: Release-/Build-Konfiguration liegt außerhalb der Versionierung; erschwert reproduzierbare Produktions-Builds.
- **Empfohlene Lösung**: `eas.json` mit Build-Profilen (development/preview/production) inkl. profilbezogener `EXPO_PUBLIC_*`-Zuordnung anlegen.
- **Geschätztes Änderungsrisiko**: Niedrig — sollte mit realen Projektwerten abgestimmt werden.
- **Benötigte Tests**: Build-Smoke pro Profil.
- **Sicher automatisch behebbar**: Nein (benötigt reale Umgebungswerte/Projekt-IDs)

### [ARCH-07] `graphql_public`-Schema in Supabase exponiert, aber nirgends genutzt
- **Severity**: Low
- **Kategorie**: Konfigurationsmanagement
- **Datei/Zeile**: `supabase/config.toml:13`
- **Beschreibung**: `schemas = ["public", "graphql_public"]` exponiert den GraphQL-Endpunkt; keinerlei GraphQL-Nutzung im App-/Worker-Code gefunden.
- **Mögliche Auswirkung**: Unnötige zusätzliche Angriffsfläche ohne produktiven Nutzen.
- **Empfohlene Lösung**: `graphql_public` aus `schemas` entfernen, falls nicht benötigt.
- **Geschätztes Änderungsrisiko**: Niedrig — produktive Supabase-Projekt-Einstellung separat prüfen.
- **Benötigte Tests**: Regressionscheck, dass keine Funktion GraphQL nutzt.
- **Sicher automatisch behebbar**: Ja

### [ARCH-08] Duplizierte `scoreTone`-Logik; exportierte Variante in `scoring.ts` produktiv ungenutzt
- **Severity**: Low
- **Kategorie**: Architektur
- **Datei/Zeile**: `lib/security/scoring.ts:462-466`; `components/modules/WlanScanner.tsx:744-746`
- **Beschreibung**: `scoring.ts` exportiert `scoreTone` (Schwellen 80/55), doch `WlanScanner.tsx` implementiert eine lokale, identische Kopie statt zu importieren; der Export wird nur noch im eigenen Test referenziert. Diese Schwellen weichen zudem von den dokumentierten Ampel-Bändern (75/50) ab — siehe auch MAINT-01 für die volle Ausprägung dieses Problems.
- **Mögliche Auswirkung**: Divergenz bei künftigen Änderungen, inkonsistente Farbschwellen zwischen Modulen.
- **Empfohlene Lösung**: Eine einzige `scoreTone`-Quelle verwenden oder lokale Variante bewusst umbenennen/dokumentieren; ungenutzten Export entfernen.
- **Geschätztes Änderungsrisiko**: Niedrig.
- **Benötigte Tests**: Bestehender Scoring-Test plus Render-Test für `AmpelBadge`.
- **Sicher automatisch behebbar**: Ja

---

## 2. Security, Authentication/Authorization, Datenschutz, Logging (SEC)

Geprüft: `workers/hono/src/index.ts` (vollständig), `lib/store/secureAuthStorage.ts`, `lib/store/storage.ts`, `lib/api/client.ts`, `lib/api/supabase.ts`, `lib/security/*`, `lib/config/environment.ts`, `supabase/migrations/*`, `supabase/tests/rls_cross_tenant.sql`.

**Positiv verifiziert**: Alle früheren CRITICAL-Authorization-Findings (fehlende/optionale Rollenprüfungen) sind aktuell gefixt. Die Privacy-Deletion läuft atomar über eine `security definer`-RPC. Der Consent-Type-Mismatch ist behoben. Alle Outbound-Calls (bis auf eine Ausnahme, SEC-05) laufen über `fetchWithTimeout`. `rls_cross_tenant.sql` hat solide Cross-Tenant-Abdeckung (37 Assertions).

### [SEC-01] CORS erlaubt jeden Origin auch für Produktion
- **Severity**: Medium
- **Kategorie**: Security
- **Datei/Zeile**: `workers/hono/src/index.ts:475`
- **Beschreibung**: `origin: "*"` unabhängig von `APP_ENV`, kein produktionsspezifischer Origin-Allowlist-Zweig. (Deckt sich mit ARCH-03.)
- **Mögliche Auswirkung**: Jede beliebige Website kann per Browser-JavaScript (mit einem gültigen Bearer-Token) Cross-Origin-Requests stellen und Antworten auslesen.
- **Empfohlene Lösung**: Origin-Allowlist basierend auf `APP_ENV`/bekannten App-Origins; in Produktion `origin: "*"` verbieten.
- **Geschätztes Änderungsrisiko**: Niedrig — kein Breaking Change für die native App.
- **Benötigte Tests**: Worker-Test für Origin-Header je Umgebung.
- **Sicher automatisch behebbar**: Nein (Origin-Liste muss vom Team definiert werden)

### [SEC-02] HIBP-Consent nicht spezifisch für den Leak-Check, sondern generisch/hartcodiert
- **Severity**: Medium
- **Kategorie**: Datenschutz
- **Datei/Zeile**: `lib/security/external.ts:158-167` (`consent: true` hartcodiert); `workers/hono/src/index.ts:843-892` (`handleExternalCheck`, Zeile 855-856, 879-880)
- **Beschreibung**: `runExternalCheck()` sendet unconditional `consent: true`. Serverseitig gated `handleExternalCheck` nur einen einzigen generischen `consent`-Flag für den *gesamten* externen Check (inkl. HIBP) — kein eigenes, HIBP-spezifisches Consent-Feld wie `handleMonitoringRun` es korrekt mit `leakConsentAccepted` umsetzt. Die E-Mail fällt zudem bei fehlender Client-Angabe automatisch auf `access?.practice.email` zurück.
- **Mögliche Auswirkung**: Sobald der aktuell per `TODO(external-check)` deaktivierte Check-Flow reaktiviert wird, würde die Praxis-E-Mail ohne granulare, HIBP-spezifische Einwilligung an HaveIBeenPwned übertragen — direkter Verstoß gegen die CLAUDE.md-Vorgabe "Email addresses are only sent to leak-check providers (HIBP) after explicit user consent for that run." Auch heute schon kann jeder `manager`-Nutzer per direktem API-Call eine E-Mail an HIBP schicken ohne dedizierte Zustimmung.
- **Empfohlene Lösung**: `/api/check/external` um eigenes `leakConsentAccepted`-Feld erweitern, analog zu `handleMonitoringRun`; `checkLeaks()` nur bei explizitem Flag aufrufen; hartcodiertes `consent: true` im Client entfernen.
- **Geschätztes Änderungsrisiko**: Niedrig-Mittel — aktuell nicht im UI-Pfad verdrahtet.
- **Benötigte Tests**: Worker-Test, der belegt, dass HIBP nur bei explizitem Consent-Flag aufgerufen wird.
- **Sicher automatisch behebbar**: Nein (Produktentscheidung zur Consent-UX nötig)

### [SEC-03] Keine Laufzeitprüfung, dass die API-Base-URL in Produktion HTTPS nutzt
- **Severity**: Medium
- **Kategorie**: Security
- **Datei/Zeile**: `lib/config/environment.ts:18,21-23`
- **Beschreibung**: Deckungsgleich mit ARCH-01 — der Produktions-Guard validiert nur Supabase-Werte, nicht `apiBaseUrl`.
- **Mögliche Auswirkung**: Fehlerhafte Build-Konfiguration könnte Bearer-Tokens/Praxisdaten unbemerkt per Klartext-HTTP senden.
- **Empfohlene Lösung**: Guard um `AppConfig.isProduction && !AppConfig.apiBaseUrl.startsWith("https://")` ergänzen.
- **Geschätztes Änderungsrisiko**: Niedrig.
- **Benötigte Tests**: Unit-Test für `lib/config/environment.ts`.
- **Sicher automatisch behebbar**: Ja

### [SEC-04] Rohes Error-Objekt wird an zwei Stellen ungefiltert geloggt (Inkonsistenz zum sonst genutzten `safeErrorLog`)
- **Severity**: Low-Medium
- **Kategorie**: Logging
- **Datei/Zeile**: `workers/hono/src/index.ts:1429, 1559`
- **Beschreibung**: Der Worker nutzt konsequent `safeErrorLog(error)`, um vor dem Loggen zu redigieren. `getAuthenticatedUser`/`requirePracticeAccess` loggen an diesen zwei Stellen (`console.error("practice_access_auth_failed", error)` bzw. `"supabase_auth_unavailable", error`) das komplette, nicht redigierte `Error`-Objekt.
- **Mögliche Auswirkung**: Bricht mit dem etablierten sicheren Logging-Pattern; falls der Fehlerpfad erweitert wird, könnten sensible Daten ungefiltert in Worker-Logs landen.
- **Empfohlene Lösung**: `safeErrorLog(error)` an beiden Stellen verwenden, analog zu allen anderen Call-Sites.
- **Geschätztes Änderungsrisiko**: Niedrig — reine Log-Statement-Änderung.
- **Benötigte Tests**: Regel/Test, der prüft, dass `console.error` in `workers/hono/src/` nie ein rohes `error`-Objekt übergibt.
- **Sicher automatisch behebbar**: Ja

### [SEC-05] `checkHttpsSignal` nutzt `fetch` ohne Timeout/AbortController
- **Severity**: Low
- **Kategorie**: Security
- **Datei/Zeile**: `workers/hono/src/index.ts:2942-2959`
- **Beschreibung**: Einzige verbleibende Ausnahme zum sonst konsequenten `fetchWithTimeout`-Pattern. Wird in jedem `performExternalCheck`-Lauf über `checkSsl()` aufgerufen. (Siehe auch PERF-03 — dieselbe Stelle aus Performance-Sicht.)
- **Mögliche Auswirkung**: Ein langsamer/hängender Ziel-Host kann einen `performExternalCheck`-Durchlauf verlangsamen; erhöht bei paralleler Verarbeitung das Risiko von Worker-Zeitlimit-Verletzungen.
- **Empfohlene Lösung**: `fetchWithTimeout` mit `{ service: "https-signal", timeoutMs: context.timeoutMs }` verwenden.
- **Geschätztes Änderungsrisiko**: Niedrig.
- **Benötigte Tests**: Worker-Unit-Test mit simuliertem hängendem Fetch.
- **Sicher automatisch behebbar**: Ja

### [SEC-06] `deletion_requests.practice_id` weiterhin ohne Foreign-Key-Constraint
- **Severity**: Low
- **Kategorie**: Datenschutz
- **Datei/Zeile**: `supabase/migrations/20260624150000_initial_schema.sql:122-130`
- **Beschreibung**: `practice_id` ist nicht als FK auf `practices(id)` referenziert, obwohl `complete_privacy_deletion` genau diese Tabelle als DSGVO-Löschnachweis befüllt. (Siehe auch DB-09 — identisches Finding aus DB-Sicht.)
- **Mögliche Auswirkung**: Kein direkter Autorisierungs-Bypass, aber fehlende DB-seitige Integritätsgarantie für den Lösch-Audit-Trail, was die Beweiskraft des DSGVO-Löschnachweises schwächt.
- **Empfohlene Lösung**: `alter table public.deletion_requests add constraint ... foreign key (practice_id) references public.practices(id) on delete set null;`
- **Geschätztes Änderungsrisiko**: Niedrig-Mittel — Migration muss gegen bestehende Datensätze geprüft werden.
- **Benötigte Tests**: pgTAP-Test, der eine Insertion mit nicht existierender `practice_id` erwartet fehlzuschlagen.
- **Sicher automatisch behebbar**: Nein (Migration mit Datenprüfung empfohlen)

---

## 3. Datenbankzugriffe & API-Design (DB)

Geprüft: Alle Migrationen unter `supabase/migrations/`, `supabase/tests/rls_cross_tenant.sql`, `workers/hono/src/index.ts` (API-Oberfläche), `lib/api/*.ts`.

**Positiv verifiziert**: `GET /api/reports`+`GET /api/reports/:id` existieren, Rollenchecks konsequent, Consent-Type-Mismatch behoben, Composite-Index vorhanden, Timeouts vorhanden, Monitoring-Parallelität begrenzt, `service_role`-Grants mehrfach nachgezogen.

### [DB-01] Privacy-Export liefert unvollständigen Datensatz (WLAN-Scans, Monitoring-Snapshots, Inventar, AVV fehlen)
- **Severity**: High
- **Kategorie**: API-Design
- **Datei/Zeile**: `workers/hono/src/index.ts:2161-2200` (`handlePrivacyExport`)
- **Beschreibung**: Der DSGVO-Art.-15/20-Export liest nur `practices`, `security_checks`, `reports`, `monitoring_events`, `consent_log`. `wlan_scans` (Netzwerknamen, BSSIDs, Gerätezahl), `monitoring_snapshots` und `data_processing_agreements` (AVV) fehlen vollständig.
- **Mögliche Auswirkung**: Verstoß gegen das Recht auf Datenübertragbarkeit/Auskunft — gerade weil `complete_privacy_deletion` diese Tabellen bei der Löschung explizit anonymisiert/löscht, der Export sie dem Nutzer aber vorher nie zeigt.
- **Empfohlene Lösung**: `wlan_scans` und `monitoring_snapshots` (ggf. `data_processing_agreements`) als zusätzliche Felder in `exportData` ergänzen.
- **Geschätztes Änderungsrisiko**: Niedrig — additive, rein lesende Änderung.
- **Benötigte Tests**: Integrationstest, der prüft, dass alle von `complete_privacy_deletion` betroffenen Tabellen auch im Export-Payload vorkommen.
- **Sicher automatisch behebbar**: Nein

### [DB-02] `ai_report_usage`-RLS-Policy durch fehlendes Table-Grant für `authenticated` unerreichbar
- **Severity**: Medium
- **Kategorie**: Datenbankzugriffe
- **Datei/Zeile**: `supabase/migrations/20260714120000_ai_report_quota.sql:18-25` vs. `supabase/migrations/20260714170000_authenticated_table_grants.sql:1-18`
- **Beschreibung**: Für `external_check_usage` existiert `grant select ... to authenticated`, für die strukturell identische Tabelle `ai_report_usage` fehlt das äquivalente Grant komplett. Ohne Grant führt jeder `GET /rest/v1/ai_report_usage` zu `42501 permission denied`, unabhängig von der RLS-Policy.
- **Mögliche Auswirkung**: `docs/RLS_PARTNER_ROLE_MATRIX.md` dokumentiert "Read: viewer plus same user_id" als funktionierend — das stimmt nicht. Aktuell folgenlos (kein Client-Zugriff), aber ein künftiges "Kontingente anzeigen"-Feature würde mit verwirrendem Permission-Fehler scheitern.
- **Empfohlene Lösung**: `grant select on public.ai_report_usage to authenticated;` ergänzen.
- **Geschätztes Änderungsrisiko**: Niedrig — einzeiliges additives Grant.
- **Benötigte Tests**: pgTAP-Test, dass der eigene Owner lesen darf.
- **Sicher automatisch behebbar**: Ja

### [DB-03] Inventar-/Monitoring-Target-Tabellen (6 Tabellen) ohne pgTAP-Cross-Tenant-Testabdeckung
- **Severity**: Medium
- **Kategorie**: Datenbankzugriffe
- **Datei/Zeile**: `supabase/migrations/20260715120000_inventory_monitoring_targets.sql:142-227`; fehlt in `supabase/tests/rls_cross_tenant.sql` und `docs/RLS_PARTNER_ROLE_MATRIX.md`
- **Beschreibung**: `inventory_items`, `inventory_known_devices`, `inventory_access_points`, `router_wifi_configurations`, `router_firewall_rules`, `monitoring_targets` haben RLS aktiviert und korrekt aussehende Policies, aber keinerlei pgTAP-Assertion testet sie.
- **Mögliche Auswirkung**: Aktuell latent (App-Code beschreibt diese Tabellen noch nicht — Inventar existiert nur im Zustand-Store). Sobald Inventar-Persistenz aktiviert wird, gibt es keinen automatisierten Schutz gegen RLS-Regressionen.
- **Empfohlene Lösung**: Cross-Tenant-Insert-/Select-Assertions für mindestens `inventory_items`/`monitoring_targets` ergänzen; Doku erweitern.
- **Geschätztes Änderungsrisiko**: Niedrig — reine Testergänzung.
- **Benötigte Tests**: Neue pgTAP-Assertions (Owner A ↛ Practice B, viewer-Partner read-only, manager-Partner read/write).
- **Sicher automatisch behebbar**: Nein (Testinhalt erfordert Priorisierung)

### [DB-04] `GET /api/reports` ohne Pagination/Limit
- **Severity**: Medium
- **Kategorie**: API-Design
- **Datei/Zeile**: `workers/hono/src/index.ts:1116-1138`, Zeile 1124
- **Beschreibung**: Kein `limit`, keine Query-Parameter für Pagination. Für zahlende Pläne existiert keine Tagesquote (`consumeAiReportQuota` gibt für Plan ≠ `free` sofort `true` zurück), wodurch die Liste über Jahre unbegrenzt wachsen kann.
- **Mögliche Auswirkung**: Wachsende Antwortzeit/Payload-Größe je Praxis mit langer Report-Historie.
- **Empfohlene Lösung**: `limit`/`offset` oder Cursor-Pagination unterstützen, serverseitig gedeckelt (z. B. 50).
- **Geschätztes Änderungsrisiko**: Niedrig.
- **Benötigte Tests**: Endpoint-Test mit >50 Reports.
- **Sicher automatisch behebbar**: Nein

### [DB-05] Keine Idempotenz-Absicherung für mutierende Endpunkte außer WLAN-Sync
- **Severity**: Medium
- **Kategorie**: API-Design
- **Datei/Zeile**: `workers/hono/src/index.ts:843-892, 894-937, 1194-1248` vs. `supabase/migrations/20260714130000_wlan_sync_replay_guard.sql:4-6`
- **Beschreibung**: `wlan_scans` hat expliziten Replay-Schutz via `client_sync_id` + Unique-Index; `security_checks`/`reports`-Inserts haben keinen Idempotenzschlüssel.
- **Mögliche Auswirkung**: Netzwerk-Retries verbrauchen zusätzliche Zeilen und — bei `external`/`report/generate` — reale Quota-Slots für Free-Plan-Nutzer.
- **Empfohlene Lösung**: Optionalen `clientSyncId`/`idempotencyKey` einführen, analog zu `wlan_scans` per Unique-Index absichern.
- **Geschätztes Änderungsrisiko**: Mittel — Schema-Änderung + App-Anpassung nötig.
- **Benötigte Tests**: pgTAP-Test für den neuen Unique-Index.
- **Sicher automatisch behebbar**: Nein

### [DB-06] Keine Kostenbremse jenseits des Free-Plan-Tageslimits
- **Severity**: Medium
- **Kategorie**: API-Design
- **Datei/Zeile**: `workers/hono/src/index.ts:1604-1605, 1640-1641`
- **Beschreibung**: Für alle Nicht-Free-Pläne wird die Quota-Prüfung komplett übersprungen — kein Ober-/Rate-Limit für externe Checks, Monitoring-Läufe (bis zu 25 Domains × 7 Checks) oder Report-Generierung.
- **Mögliche Auswirkung**: Ein kompromittiertes/missbrauchtes Paid-Konto kann ohne technische Bremse beliebig oft kostenpflichtige Provider-Aufrufe auslösen.
- **Empfohlene Lösung**: Auch für Paid-Pläne ein endliches, höheres Limit setzen; zusätzlich ein globales Fenster-Rate-Limit.
- **Geschätztes Änderungsrisiko**: Mittel — Produktentscheidung zu Limits pro Plan nötig.
- **Benötigte Tests**: Endpoint-Test, der ab konfiguriertem Limit 429 erwartet.
- **Sicher automatisch behebbar**: Nein

### [DB-07] `handlePrivacyExport` führt vier sequentielle statt parallele Supabase-REST-Aufrufe aus
- **Severity**: Low-Medium
- **Kategorie**: Datenbankzugriffe
- **Datei/Zeile**: `workers/hono/src/index.ts:2166-2190`
- **Beschreibung**: Im Gegensatz zu `handleDashboard` (`Promise.all`) laufen die vier Queries hier nacheinander.
- **Mögliche Auswirkung**: Bis zu 4× die Einzel-Roundtrip-Latenz statt 1×.
- **Empfohlene Lösung**: In `Promise.all([...])` überführen, analog zum Dashboard-Handler.
- **Geschätztes Änderungsrisiko**: Niedrig.
- **Benötigte Tests**: Bestehender/erweiterter Endpoint-Test für `/api/privacy/export`.
- **Sicher automatisch behebbar**: Ja

### [DB-08] `POST /api/legal/consent` validiert `type` nicht vor dem Insert — CHECK-Verletzung wird zu generischem 500 statt 400
- **Severity**: Low-Medium
- **Kategorie**: API-Design
- **Datei/Zeile**: `workers/hono/src/index.ts:2279-2299, 2302-2327`
- **Beschreibung**: `handleConsent` prüft nur, ob `type` gesetzt ist, nicht ob es einer der sechs erlaubten Enum-Werte ist. Ein ungültiger Wert führt zu einer nicht abgefangenen 400-Antwort von Supabase, die im globalen `onError`-Handler zu einem pauschalen 500 wird.
- **Mögliche Auswirkung**: Klassifizierungsfehler — Client-Eingabefehler wird als Serverfehler gemeldet, was Retry-/Fehlerbehandlung im Client fehlleitet.
- **Empfohlene Lösung**: Enum-Validierung vor dem Insert anwenden, bei ungültigem Wert 400 zurückgeben.
- **Geschätztes Änderungsrisiko**: Niedrig.
- **Benötigte Tests**: Endpoint-Test mit ungültigem `type`-Wert, erwartet 400.
- **Sicher automatisch behebbar**: Ja

### [DB-09] `deletion_requests.practice_id` weiterhin ohne Foreign Key
- **Severity**: Low-Medium
- **Kategorie**: Datenbankzugriffe
- **Datei/Zeile**: `supabase/migrations/20260624150000_initial_schema.sql:122-130`
- **Beschreibung**: Siehe SEC-06 — identisches Finding.
- **Mögliche Auswirkung**: Kein aktiver Datenintegritätsfehler, aber fehlende referenzielle Absicherung des DSGVO-Löschnachweises für künftige Schema-Änderungen.
- **Empfohlene Lösung**: FK-Constraint mit `on delete set null` ergänzen (ggf. `not valid` + nachträgliches `validate`).
- **Geschätztes Änderungsrisiko**: Niedrig-Mittel.
- **Benötigte Tests**: Migrationstest gegen Bestandsdaten.
- **Sicher automatisch behebbar**: Nein

### [DB-10] `email_outbox` speichert E-Mail-Adressen dauerhaft, wird von der Privacy-Löschung nicht erfasst
- **Severity**: Low
- **Kategorie**: Datenbankzugriffe
- **Datei/Zeile**: `supabase/migrations/20260625120000_launch_hardening.sql:60-70`; `complete_privacy_deletion`-RPC berührt `email_outbox` nicht
- **Beschreibung**: `sendDeletionConfirmation` schreibt bei jeder Löschanfrage eine Zeile mit Klartext-E-Mail + vollständigem Report-JSON in `email_outbox`, die nie anonymisiert/gelöscht wird.
- **Mögliche Auswirkung**: Nach einer DSGVO-Löschanfrage bleibt die E-Mail-Adresse indirekt weiterhin gespeichert — Widerspruch zum Recht auf Löschung.
- **Empfohlene Lösung**: Retention-Policy für `email_outbox` definieren (Cron-Job, der alte `sent`-Zeilen löscht/anonymisiert).
- **Geschätztes Änderungsrisiko**: Niedrig — additive Retention-Logik.
- **Benötigte Tests**: Test für den Retention-Job.
- **Sicher automatisch behebbar**: Nein

### [DB-11] Redundanter Index `security_checks_practice_id_idx` durch neueren Composite-Index überflüssig
- **Severity**: Low
- **Kategorie**: Datenbankzugriffe
- **Datei/Zeile**: `supabase/migrations/20260624150000_initial_schema.sql:147` vs. `20260717120000_worker_grants_and_security_checks_index.sql:1-2`
- **Beschreibung**: Der Composite-Index hat `practice_id` als führende Spalte und deckt reine `WHERE practice_id = ...`-Queries mit ab.
- **Mögliche Auswirkung**: Unnötiger Wartungsaufwand bei INSERT/UPDATE (zwei statt ein Index) sowie Speicherplatz.
- **Empfohlene Lösung**: Alten Index nach Verifikation per `pg_stat_user_indexes` droppen.
- **Geschätztes Änderungsrisiko**: Niedrig — vorab Produktionsverifikation.
- **Benötigte Tests**: `EXPLAIN ANALYZE` der Dashboard-Query.
- **Sicher automatisch behebbar**: Nein (Produktionsverifikation vor Drop empfohlen)

### [DB-12] Keine API-Versionierung
- **Severity**: Low
- **Kategorie**: API-Design
- **Datei/Zeile**: `workers/hono/src/index.ts:485-499`
- **Beschreibung**: Sämtliche Endpunkte unter `/api/*`, kein `/api/v1/*`.
- **Mögliche Auswirkung**: Ein künftiger Breaking Change zwingt zu koordiniertem Deploy von App und Worker ohne Übergangsfenster.
- **Empfohlene Lösung**: Neue/geänderte Endpunkte künftig unter `/api/v1/...` führen.
- **Geschätztes Änderungsrisiko**: Mittel — betrifft Routing und alle Aufrufer.
- **Benötigte Tests**: Regressionstest, dass alte Pfade weiter funktionieren.
- **Sicher automatisch behebbar**: Nein

### [DB-13] `external_check_usage`/`ai_report_usage` ohne Index auf FK-Spalte `practice_id`
- **Severity**: Low
- **Kategorie**: Datenbankzugriffe
- **Datei/Zeile**: `supabase/migrations/20260624150000_initial_schema.sql:152`; `20260714120000_ai_report_quota.sql:12-13`
- **Beschreibung**: Beide Tabellen haben eine FK-Spalte `practice_id`, aber keinen Index, der sie als führende Spalte nutzt (nur `(user_id, usage_date desc)`).
- **Mögliche Auswirkung**: Bei Tabellenwachstum potenziell ineffiziente Scans bei praxis-zentrierten Abfragen; aktuell geringe Auswirkung.
- **Empfohlene Lösung**: `create index ... on public.external_check_usage(practice_id);` und äquivalent für `ai_report_usage`.
- **Geschätztes Änderungsrisiko**: Niedrig.
- **Benötigte Tests**: Keine funktionalen nötig.
- **Sicher automatisch behebbar**: Ja

---

## 4. Korrektheit, Type Safety, Error Handling (TS)

Geprüft: `lib/security/*`, `lib/ai/*`, `lib/api/*`, `lib/store/*`, `lib/monitoring/*`, `lib/billing/*`, Business-Logik-Abschnitte von `workers/hono/src/index.ts`. `npm run typecheck`/`npm run lint` laufen sauber durch — alle Findings sind Logik-Ebene, keine Compiler-/Lint-Fehler.

### [TS-01] Fehlgeschlagene Provider-HTTP-Antworten werden fälschlich als "sauber, nichts gefunden" statt "unavailable" behandelt
- **Severity**: High
- **Kategorie**: Korrektheit / Error Handling
- **Datei/Zeile**: `workers/hono/src/index.ts` — `checkPorts` (Shodan) L3063-3065, `checkVirusTotal` L3210-3212, `checkSecurityTrailsHistory` L3261, `discoverSecurityTrailsSubdomains` L3317, `checkLeaks` (HIBP) L3146-3150/3161-3164, `queryDns` (Cloudflare DNS) L3378
- **Beschreibung**: In jeder dieser Provider-Check-Funktionen wird eine Non-2xx-HTTP-Antwort (`!response.ok`) durch stilles Zurückgeben eines leeren/Default-Ergebnisses behandelt — dieselbe Form wie "erfolgreich geprüft, nichts gefunden". `markProviderUnavailable(...)` wird nur aus dem `catch`-Block aufgerufen (nur bei Netzwerkfehler/Timeout). Ein API-Auth-Fehler (401), Rate-Limit (429) oder Provider-Ausfall (5xx) wirft nie — er löst mit `response.ok === false` auf und fällt in den "nichts gefunden"-Zweig, ohne den Provider als unavailable zu markieren. `buildProviderStatuses` meldet den Provider anschließend fälschlich als `"active"`.
- **Mögliche Auswirkung**: Ein Shodan/VirusTotal/SecurityTrails/HIBP/Cloudflare-DNS-Ausfall oder ein abgelaufener API-Key erzeugt still einen Bericht mit "keine offenen Ports", "keine bekannten Breaches" etc. bei `provider_statuses.<provider> = "active"` — direkter Widerspruch zum in CLAUDE.md festgehaltenen Evidence-Modell ("a missing API key is 'not checked,' not 'no risk'"; muss auch für einen fehlgeschlagenen Call gelten). Inflationiert `overall_score`, unterdrückt erwartete Findings/Monitoring-Alerts.
- **Empfohlene Lösung**: In jeder Funktion `markProviderUnavailable(context, "<provider>", new Error("http_" + response.status))` aufrufen, bevor bei `!response.ok` das Default-Ergebnis zurückgegeben wird (außer bei legitimen "nicht gefunden"-Codes wie HIBPs 404).
- **Geschätztes Änderungsrisiko**: Mittel — touches shared provider-check helpers, muss HIBPs `404 = kein Breach`-Semantik erhalten.
- **Benötigte Tests**: Unit-Tests, die für HTTP 401/429/500 von jedem Provider `provider_statuses.<provider> === "unavailable"` und ein entsprechendes Finding statt eines leeren Ergebnisses erwarten.
- **Sicher automatisch behebbar**: Nein

### [TS-02] `apiRequest`-Client hat keinen Request-Timeout/AbortController
- **Severity**: Medium
- **Kategorie**: Error Handling
- **Datei/Zeile**: `lib/api/client.ts:20-37`
- **Beschreibung**: Anders als der Worker (der konsequent `fetchWithTimeout` nutzt) hat `apiRequest` keinen `AbortController`/Timeout. Jeder App-Aufruf gegen `/api/*` kann bei Netzwerkstillstand unendlich hängen.
- **Mögliche Auswirkung**: UI-Zustände (Ladeindikatoren, Sync-Anzeigen) können ewig hängen, ohne nutzersichtbaren Timeout/Fehler — die Client-seitige Hälfte des bereits Worker-seitig behobenen Timeout-Themas.
- **Empfohlene Lösung**: `fetch`-Aufruf in `AbortController` mit sinnvollem Timeout wrappen (15-30s), distinktiven Timeout-Fehlertyp einführen.
- **Geschätztes Änderungsrisiko**: Niedrig — isolierte, gut getestete einzelne Funktion.
- **Benötigte Tests**: Unit-Test mit gemocktem, nie auflösendem `fetch`, erwartet Abort innerhalb des Timeout-Fensters.
- **Sicher automatisch behebbar**: Nein

### [TS-03] `RuleEvaluation.review_status` hartcodiert; `evidence_sources`-Override nie befüllt — beides tote Extensibility-Points
- **Severity**: Low
- **Kategorie**: Korrektheit / Type Safety
- **Datei/Zeile**: `lib/security/scoring.ts:537, 429-431, 68, 562-564`
- **Beschreibung**: `buildResult` setzt `review_status: "ok"` immer — kein Codepfad erzeugt je `"review_required"` pro Regel, der Check bei L429 ist permanent `false` und tot. `CheckData.evidence_sources` wird gelesen, aber nirgends in Produktion geschrieben — nur test-seitig referenziert.
- **Mögliche Auswirkung**: Kein aktiver Bug, aber ein Wartungs-/Vertrauensrisiko: ein künftiger Contributor könnte annehmen, diese Felder hätten produktive Wirkung.
- **Empfohlene Lösung**: `evidence_sources` in die echte Pipeline verdrahten oder die tote Override-Fläche/den toten `review_status`-Zweig entfernen.
- **Geschätztes Änderungsrisiko**: Niedrig — Cleanup oder additive Verdrahtung.
- **Benötigte Tests**: Bei Entfernung: `scoring.test.ts` anpassen; bei Verdrahtung: neuer Test, dass ein Override tatsächlich wirkt.
- **Sicher automatisch behebbar**: Nein

### [TS-04] `generateAiReport` baut ein fehlerhaftes `ExternalCheckResult` via vollständigem Type-Bypass-Cast
- **Severity**: Low
- **Kategorie**: Type Safety
- **Datei/Zeile**: `lib/ai/report.ts:131-150`
- **Beschreibung**: Konstruiert ein gefälschtes `ExternalCheckResult` mit `checks: null` und leeren `providers`/`provider_statuses`, erzwungen per `as unknown as ExternalCheckResult`. Die Funktion ist aktuell tote Code (keine Aufrufer, verifiziert via Grep).
- **Mögliche Auswirkung**: Falls je aufgerufen, würde ein Null-Dereferenzierungsfehler downstream auftreten, da der Type-Cast dem Compiler eine ungeprüfte Struktur vorgaukelt.
- **Empfohlene Lösung**: Funktion löschen oder den Double-Cast durch einen korrekt typisierten Minimal-Builder ersetzen.
- **Geschätztes Änderungsrisiko**: Niedrig — toter Code ohne Aufrufer.
- **Benötigte Tests**: Falls behalten, Unit-Test, der die resultierende Struktur gegen den echten Typ validiert.
- **Sicher automatisch behebbar**: Nein

### [TS-05] `syncWlanScanResultToSupabase` weitet seine Literal-`reason`-Union bei generischen Supabase-Fehlern auf beliebigen `string` auf
- **Severity**: Low
- **Kategorie**: Type Safety
- **Datei/Zeile**: `lib/security/wlan.ts:559-598`, Zeile 595
- **Beschreibung**: Andere Fehlerzweige geben schmale Literale zurück (`"invalid_practice_id" as const`), der generische Zweig gibt `reason: error.message` zurück — ein beliebiger `string`, der die Union auf `string` erweitert.
- **Mögliche Auswirkung**: Ein künftiger Aufrufer mit `switch`/exhaustive Check auf `reason` bekäme keine Compiler-Warnung bei neuen Literalen.
- **Empfohlene Lösung**: Expliziten Return-Type mit geschlossener `reason`-Union + separatem `detail`-Feld für `error.message`.
- **Geschätztes Änderungsrisiko**: Niedrig — eine Funktion, ein Call-Site.
- **Benötigte Tests**: `wlan-sync.test.ts` um die geschärfte `reason`-Form erweitern.
- **Sicher automatisch behebbar**: Nein

---

## 5. Frontend & React Native/Mobile (RN)

Geprüft: Alle Dateien unter `app/`, `components/ui/`, `components/charts/`, `components/modules/`. `npm run lint`/`npm run typecheck` laufen aktuell sauber.

**Positiv verifiziert (seit Tracker behoben)**: Settings-Logout funktioniert, "Passwort vergessen"-Flow vorhanden, Onboarding ist scrollbar.

### [RN-01] Kein `eslint-plugin-react-hooks` (oder `jsx-a11y`) konfiguriert
- **Severity**: High
- **Kategorie**: Frontend (Tooling/Config)
- **Datei/Zeile**: `eslint.config.mjs:1-27`
- **Beschreibung**: Die Flat-Config registriert nur `@typescript-eslint`-Regeln plus `no-console`. Kein `eslint-plugin-react-hooks`, kein `eslint-plugin-jsx-a11y`. `npm run lint` läuft sauber durch, aber nur weil nichts `rules-of-hooks`/`exhaustive-deps` erzwingt — nicht weil der Code keine solchen Probleme hat (siehe RN-04/RN-06).
- **Mögliche Auswirkung**: Bedingte Hooks, fehlende/falsche Dependency-Arrays und veraltete Closures können unbemerkt gemerged werden; der CI-„quality"-Gate gibt eine falsche Sicherheit bezüglich Hook-Korrektheit.
- **Empfohlene Lösung**: `eslint-plugin-react-hooks` (`rules-of-hooks: error`, `exhaustive-deps: warn`/`error`) und `eslint-plugin-jsx-a11y` ergänzen, dann neu aufgedeckte Warnungen triagieren.
- **Geschätztes Änderungsrisiko**: Mittel — voraussichtlich mehrere bereits vorhandene Warnungen werden aufgedeckt.
- **Benötigte Tests**: `npm run lint` nach Ergänzung, manuelle Review jeder neuen Warnung.
- **Sicher automatisch behebbar**: Nein

### [RN-02] `Screen` ignoriert Safe-Area-Insets — hartcodiertes Top/Bottom-Padding trotz installiertem `SafeAreaProvider`
- **Severity**: High
- **Kategorie**: React Native/Mobile
- **Datei/Zeile**: `components/ui/Screen.tsx:13,37-42`; `app/_layout.tsx:8,17`
- **Beschreibung**: `Screen` (von jedem Screen der App genutzt) wendet `paddingTop: 68, paddingBottom: 36` unbedingt an, statt `useSafeAreaInsets()` zu nutzen — obwohl `react-native-safe-area-context` installiert und an der Wurzel eingebunden ist. Kein `useSafeAreaInsets`/`SafeAreaView` irgendwo im Repo.
- **Mögliche Auswirkung**: Auf Geräten mit größerer Safe Area (Dynamic Island/Notch) kann Content zu nah am Statusbalken/Notch sitzen; auf Geräten mit kleinerer Safe Area entsteht überschüssiger Leerraum.
- **Empfohlene Lösung**: `useSafeAreaInsets()` in `Screen` nutzen und mit Basis-Padding kombinieren statt fixer Konstante.
- **Geschätztes Änderungsrisiko**: Niedrig — betrifft aber jeden Screen, visuelle Prüfung auf mehreren Gerätegrößen nötig.
- **Benötigte Tests**: Manuelle Prüfung auf Notch-/Nicht-Notch-Gerät; bestehende RTL-Snapshot-Tests sollten weiter bestehen.
- **Sicher automatisch behebbar**: Nein

### [RN-03] Kein `KeyboardAvoidingView` irgendwo in der App — mehrfeldrige Formulare können vom Keyboard verdeckt werden
- **Severity**: High
- **Kategorie**: React Native/Mobile
- **Datei/Zeile**: Grep bestätigt 0 Treffer für `KeyboardAvoidingView`. Betroffen: `app/(auth)/login.tsx:139-168`, `app/(auth)/onboarding/index.tsx:189-201`, `app/(tabs)/inventory/index.tsx:254-274,311-347,392-428` (3 Formularabschnitte mit je 5+ gestapelten `TextInput`s), `app/(tabs)/monitoring/index.tsx:351-385`
- **Beschreibung**: Jeder texteingabelastige Screen ist nur in `Screen`s einfaches `ScrollView` gewrappt. Auf iOS weicht `ScrollView` dem Keyboard nicht automatisch aus, und keiner dieser Screens scrollt ein fokussiertes Feld bei `onFocus` ins Sichtfeld. Inventory ist der schlimmste Fall — bis zu 6 gestapelte `TextInput`s pro Formularblock.
- **Mögliche Auswirkung**: Nutzer auf kleineren/Standard-Geräten sehen nicht, was sie in tiefer positionierte Felder eintippen; auch der primäre Submit-Button kann verdeckt sein.
- **Empfohlene Lösung**: `Screen`-Content in `KeyboardAvoidingView` wrappen (`behavior="padding"` iOS) oder `react-native-keyboard-controller`/`KeyboardAwareScrollView` für formularlastige Screens adoptieren.
- **Geschätztes Änderungsrisiko**: Mittel — Verhalten unterscheidet sich iOS/Android, manuelle Verifikation nötig.
- **Benötigte Tests**: Manuelle QA iOS+Android je Formular-Screen.
- **Sicher automatisch behebbar**: Nein

### [RN-04] `ScoreRing` re-implementiert die Zahlenanimation mit einem 60fps-`setInterval`/`setState`-Loop statt des bereits vorhandenen Reanimated-Werts
- **Severity**: High
- **Kategorie**: React Native/Mobile (Render-Performance)
- **Datei/Zeile**: `components/ui/ScoreRing.tsx:24-50`
- **Beschreibung**: Die Komponente nutzt Reanimated korrekt für den SVG-Ring, animiert das Zahlenlabel aber separat über einen `setInterval` alle 16ms mit `setState` — ~56 Re-Renders pro 900ms-Mount, rein JS-Thread, dupliziert Arbeit, die der bereits vorhandene Reanimated-Shared-Value kostenlos leisten würde. Gemountet auf Dashboard, Monitoring-Hero und WLAN-Scan-Ergebnis.
- **Mögliche Auswirkung**: Unnötiger JS-Thread-Verbrauch und Re-Renders bei jeder Score-Anzeige, schlimmer auf schwächeren Android-Geräten; das Dependency-Array `[clampedScore]` lässt zudem absichtlich `displayScore` aus — genau die Art Bug, die `react-hooks/exhaustive-deps` (RN-01) aufdecken würde.
- **Empfohlene Lösung**: Manuellen `setInterval` durch `useAnimatedReaction`/`useDerivedValue` auf dem bestehenden `progress`-Shared-Value ersetzen.
- **Geschätztes Änderungsrisiko**: Mittel — animationssichtbare Änderung, visuelle Regressionsprüfung an 3 Stellen.
- **Benötigte Tests**: Manuelle visuelle Prüfung der Count-up-Animation.
- **Sicher automatisch behebbar**: Nein

### [RN-05] Zustand-Inventar-Selektoren geben bei jedem Aufruf ein frisches leeres Array-Literal zurück, verursacht unnötige Re-Renders
- **Severity**: Medium
- **Kategorie**: Frontend (Zustand-Selector-Pattern)
- **Datei/Zeile**: `lib/store/inventory.ts:61-65`; konsumiert in `app/(tabs)/inventory/index.tsx:53-56`, `app/(tabs)/monitoring/index.tsx:62`, `components/modules/WlanScanner.tsx:42-44`
- **Beschreibung**: `getItems`/`getKnownDevices`/`getAccessPoints`/`getRouterFirewallRules` geben bei leeren Daten jedes Mal ein neues `[]`-Literal zurück. Da Zustand `Object.is`-Vergleich nutzt und jeden gemounteten Selektor bei jedem `set()` neu ausführt, re-rendern diese Komponenten bei jeder unabhängigen Store-Mutation, solange diese Slices leer sind.
- **Mögliche Auswirkung**: Unnötige Re-Renders großer Screens (Inventory ~987, Monitoring ~1029, WlanScanner ~1280 Zeilen) bei unrelated State-Changes.
- **Empfohlene Lösung**: Stabile leere Array-Konstante auf Modulebene memoizen und zurückgeben, oder auf `useShallow`/eigene Equality-Funktion umstellen.
- **Geschätztes Änderungsrisiko**: Niedrig — mechanischer Fix.
- **Benötigte Tests**: React-DevTools-Spot-Check oder Jest-Test auf referenzielle Stabilität.
- **Sicher automatisch behebbar**: Ja (für den "gemeinsames leeres Array"-Teil)

### [RN-06] Fragebogen berechnet Score über eine `useEffect`-Kette statt beim auslösenden Event
- **Severity**: Medium
- **Kategorie**: Frontend (Hook-Korrektheit / Render-Performance)
- **Datei/Zeile**: `app/(tabs)/check/questionnaire.tsx:100-102`
- **Beschreibung**: `useEffect(() => { recalculate(); }, [answers, recalculate]);` re-deriviert den Score bei jeder Antwortänderung. Jeder Tap auf eine Antwort löst aus: `setAnswer` → Re-Render → Effect → `recalculate()` → zweiter Store-Write → zweiter Re-Render.
- **Mögliche Auswirkung**: Verdoppelte Render-Arbeit pro Antwort-Tap bei ~20 Fragen.
- **Empfohlene Lösung**: `recalculate()` direkt beim `setAnswer`-Aufruf aufrufen (inline oder in der Store-Action), Effect entfernen.
- **Geschätztes Änderungsrisiko**: Niedrig — selbstenthaltene Änderung.
- **Benötigte Tests**: Fragebogen-Test, der Score-Update nach Antwort ohne Effect-Timing-Abhängigkeit verifiziert.
- **Sicher automatisch behebbar**: Nein

### [RN-07] PDF-Export hat keinen Share-Flow — Alert-only-Pfad ist eine mobile Sackgasse (bestätigt Tracker F-067)
- **Severity**: Medium
- **Kategorie**: React Native/Mobile
- **Datei/Zeile**: `app/(tabs)/report/index.tsx:68-85`
- **Beschreibung**: `handleExportPdf` zeigt nach Export nur `Alert.alert("PDF erstellt", ...)` mit dem rohen Pfad. Kein `expo-sharing`/`Sharing.shareAsync`-Aufruf irgendwo im Repo.
- **Mögliche Auswirkung**: Die PDF liegt im sandboxed Dokumentenverzeichnis der App; der rohe Pfad in einem Alert gibt dem Nutzer keine Möglichkeit, die Datei zu öffnen/speichern/versenden — funktional eine Sackgasse.
- **Empfohlene Lösung**: Nach erfolgreichem Export `Sharing.shareAsync(pdfPath)` aufrufen.
- **Geschätztes Änderungsrisiko**: Niedrig — additive Änderung, gängige Expo-Dependency.
- **Benötigte Tests**: Maestro-Flow/manuelle QA, dass das OS-Share-Sheet öffnet.
- **Sicher automatisch behebbar**: Nein

### [RN-08] Sackgassen-Buttons "Bericht erzeugen"/"Bericht exportieren" weiterhin vorhanden (bestätigt Tracker F-015)
- **Severity**: Medium
- **Kategorie**: Frontend (irreführende UI)
- **Datei/Zeile**: `app/(tabs)/check/wlan-scan.tsx:15-25`; `app/(tabs)/monitoring/index.tsx:246-252`
- **Beschreibung**: "Bericht erzeugen" navigiert nur zur Report-Seite ohne etwas zu prüfen/erzeugen; "Bericht exportieren" im Monitoring navigiert nur zum Report-Tab ohne selbst zu exportieren.
- **Mögliche Auswirkung**: Nutzer erwarten anhand des Labels eine Aktion, die nicht stattfindet — untergräbt Vertrauen.
- **Empfohlene Lösung**: Buttons umbenennen ("Weiter zum Bericht") oder mit echter Funktion verdrahten.
- **Geschätztes Änderungsrisiko**: Niedrig (Label) bis Mittel (echte Verdrahtung).
- **Benötigte Tests**: Bestehende Maestro-Flows `06-wlan-scan.yaml`/`08-report-generation-error.yaml` erweitern.
- **Sicher automatisch behebbar**: Nein

### [RN-09] Mehrere Screens/Komponenten sind 1.000+ Zeilen und mischen Datenladen, Formular-State und Präsentation
- **Severity**: Medium
- **Kategorie**: Frontend (Komponentenarchitektur)
- **Datei/Zeile**: `components/modules/WlanScanner.tsx` (1280 Zeilen), `app/(tabs)/inventory/index.tsx` (987 Zeilen, 19 `useState`), `app/(tabs)/monitoring/index.tsx` (1029 Zeilen)
- **Beschreibung**: `InventoryScreen` besitzt State für 3 unabhängige Formulare plus Router/WLAN-Toggles in einer Komponente. `WlanScanner` kombiniert Consent-UI, Scan-Orchestrierung, Ergebnis-Rendering, Check-/Geräte-/Schwachstellenlisten in einer Datei.
- **Mögliche Auswirkung**: Schwerer isoliert testbar, höheres Risiko formularübergreifender State-Bugs, größere Re-Render-Flächen (verstärkt RN-05).
- **Empfohlene Lösung**: Formularblöcke und Listen in eigene Dateien/Komponenten extrahieren.
- **Geschätztes Änderungsrisiko**: Mittel-Hoch — inkrementell mit Testabdeckung pro extrahiertem Teil.
- **Benötigte Tests**: Bestehende Tests als Regressionsschutz, plus neue RTL-Tests pro extrahierter Subkomponente.
- **Sicher automatisch behebbar**: Nein

### [RN-10] Inventar-/Geräte-/Access-Point-Listen rendern via `.map()` in einem einzigen, nicht-virtualisierten `ScrollView`, jede Zeile in `BlurView`
- **Severity**: Medium
- **Kategorie**: React Native/Mobile (Render-Performance)
- **Datei/Zeile**: `app/(tabs)/inventory/index.tsx:371-386,452-466,509-517`; `components/ui/Screen.tsx:19-22`; `components/ui/GlassCard.tsx:39`
- **Beschreibung**: Alle drei Listen (Known-Devices, Access Points, Inventar) rendern per `.map()` im gemeinsamen `Screen`-`ScrollView`. Jede Zeile ist eine `GlassCard` mit `BlurView` (teure native View, besonders Android) plus Mount-Animation. Bestätigt Tracker F-048 weiterhin offen.
- **Mögliche Auswirkung**: Bei größeren Praxisinventaren droht Frame-Drops beim Scrollen, da keine Zeile virtualisiert/recycled wird.
- **Empfohlene Lösung**: Migration zu `FlatList`/`FlashList` mit stabilem `keyExtractor`; BlurView/Mount-Animation bei Listenzeilen ggf. auslassen.
- **Geschätztes Änderungsrisiko**: Mittel — `FlatList` in `ScrollView` benötigt `scrollEnabled={false}`/`nestedScrollEnabled` oder Restrukturierung.
- **Benötigte Tests**: Manueller Scroll-Performance-Check mit größerem geseedetem Inventar.
- **Sicher automatisch behebbar**: Nein
- **Status (Phase 6)**: ERLEDIGT zusammen mit [PERF-12]. Der `inventory`-Screen läuft jetzt über eine
  einzelne `FlatList` mit diskriminiertem Row-Modell (statische Form-/Header-Blöcke als `node`-Rows,
  Listeneinträge als typisierte Rows), `Screen` mit `scroll={false}` — kein `ScrollView` um
  VirtualizedLists mehr. Nur EINMAL umgesetzt; siehe PERF-12.

### [RN-11] `VulnerabilityCard` mischt Legacy-`Animated`/`PanResponder` mit dem `react-native-gesture-handler`-Fundament der App
- **Severity**: Low
- **Kategorie**: Frontend (Komponentenarchitektur)
- **Datei/Zeile**: `components/ui/VulnerabilityCard.tsx:4-14,59-89`
- **Beschreibung**: App-Root wrappt alles in `GestureHandlerRootView`, der Rest der App nutzt Reanimated/Moti. `VulnerabilityCard`s Swipe-to-Acknowledge nutzt stattdessen die Legacy-`Animated`/`PanResponder`-APIs.
- **Mögliche Auswirkung**: Geringes Risiko heute, aber erhöht die Chance auf Gesture-Konflikte, falls die Karte je in eine `FlatList`/horizontales `ScrollView` mit `react-native-gesture-handler` genestet wird.
- **Empfohlene Lösung**: Auf `Gesture.Pan()` + `useAnimatedStyle` portieren.
- **Geschätztes Änderungsrisiko**: Niedrig-Mittel — isoliert, aber Gesture-Verhalten muss neu verifiziert werden.
- **Benötigte Tests**: Manueller Swipe-to-Acknowledge-Check.
- **Sicher automatisch behebbar**: Nein

### [RN-12] Verwaiste "Action Guide"-Modal-Route — unerreichbar, weiterhin Platzhalter falls je verlinkt (bestätigt Tracker F-017, aktualisierter Status)
- **Severity**: Low
- **Kategorie**: Frontend (Dead Code / unvollständiges Feature)
- **Datei/Zeile**: `app/(modal)/action-guide.tsx:1-31`
- **Beschreibung**: Route wird von nirgends im aktuellen Code verlinkt — aktuell toter/unerreichbarer Code statt eines aktiven Sackgassen-Buttons. Falls je wieder verlinkt: weiterhin eine statische Seite ohne Rollenlogik.
- **Mögliche Auswirkung**: Aktuell keine, aber stale Code, der Maintainer verwirren könnte.
- **Empfohlene Lösung**: Rollenbasierten Inhalt implementieren und verlinken, oder Route entfernen bis fertig.
- **Geschätztes Änderungsrisiko**: Niedrig.
- **Benötigte Tests**: N/A bis erneut verlinkt.
- **Sicher automatisch behebbar**: Nein

### [RN-13] Alert-Detail-Modal bietet trotz Backend-Unterstützung keine Quittierungs-Aktion (bestätigt Tracker F-016)
- **Severity**: Low
- **Kategorie**: Frontend (unvollständiges Feature)
- **Datei/Zeile**: `app/(modal)/alert-detail.tsx:92-96`
- **Beschreibung**: Einziger Aktions-Button ist "Zum Monitoring zurück" → `router.back()`. Kein Aufruf eines Acknowledge-/Resolve-Endpunkts.
- **Mögliche Auswirkung**: Nutzer können einen Alert nicht direkt von der dafür vorgesehenen Seite als erledigt markieren.
- **Empfohlene Lösung**: "Als erledigt markieren"-Aktion mit optimistischem UI-Update von `event.resolved_at` ergänzen.
- **Geschätztes Änderungsrisiko**: Niedrig-Mittel — neue Mutation + optimistisches State-Update im Kontext der bestehenden Realtime-Subscription.
- **Benötigte Tests**: Neuer RTL-Test plus Maestro-Flow-Erweiterung.
- **Sicher automatisch behebbar**: Nein

---

## 6. Accessibility (A11Y)

Geprüft: `app/(auth)/`, `app/(tabs)/*`, `app/(modal)/`, `components/ui/*`, `components/charts/*`, `components/modules/*`, `constants/colors.ts`. WCAG 2.2 AA, React-Native-native Accessibility (nicht Web).

**Positiv-Baseline**: `AnimatedButton`, `questionnaire.tsx` (Radiogroup/Radio-Pattern), `WlanScanner.tsx`-Consent-Checkboxen, `login.tsx`/`onboarding/index.tsx` setzen konsistent `accessibilityRole`/`Label`/`Hint`/`State`. Dieses Pattern ist nicht überall angewendet — daraus resultieren die meisten Findings unten.

### [A11Y-01] Inventory-Screen: durchgängig fehlende A11y-Semantik auf Custom Controls
- **Severity**: Critical
- **Kategorie**: Accessibility
- **Datei/Zeile**: `app/(tabs)/inventory/index.tsx` — Icon-only-Löschbuttons Zeile 553, 592, 627; Segmented-Picker ohne Rolle/State Zeile 242-250, 277-287, 298-308, 350-360, 430-441; `FilterChip` 531-537; `ConfigToggle` Ja/Nein 669-691; 13 `TextInput`s ohne `accessibilityLabel`
- **Beschreibung**: Der einzige große Workflow-Screen, der nicht dem A11y-Pattern des restlichen Repos folgt. (1) Drei `Trash2`-Icon-Buttons ohne `accessibilityLabel` — Screenreader liest nur "Button" ohne Ziel; (2) Segmented-Selektoren/Chips/Toggles ohne `accessibilityRole`/`accessibilityState`; (3) alle 13 `TextInput`-Felder verlassen sich nur auf `placeholder`, der nach Eingabe verschwindet.
- **Mögliche Auswirkung**: Screenreader-Nutzer können das Praxisinventar (Geräte, Access Points, Router-Konfiguration) — einen Kern-Compliance-Workflow für IT-Partner — nicht zuverlässig verwalten; Risiko versehentlicher Löschung des falschen Geräts.
- **Empfohlene Lösung**: `accessibilityRole="button"` + `accessibilityLabel` (z. B. "Gerät entfernen: {hostname}") für Lösch-Buttons; `accessibilityRole`/`accessibilityState={{selected}}` für Segmented-Options/Chips/Toggles; explizite `accessibilityLabel` für alle `TextInput`s.
- **Geschätztes Änderungsrisiko**: Niedrig — rein additive Props.
- **Benötigte Tests**: Manueller VoiceOver + TalkBack Pass durch den vollständigen Inventory-Flow.
- **Sicher automatisch behebbar**: Nein (Label-Texte müssen bewusst formuliert werden)

### [A11Y-02] `Ampel`/`TrafficLight`: Status ausschließlich über Farbe, kein Textäquivalent
- **Severity**: High
- **Kategorie**: Accessibility
- **Datei/Zeile**: `components/ui/Ampel.tsx:20-59`; genutzt in `app/(auth)/onboarding/index.tsx:144`
- **Beschreibung**: Drei farbige Punkte, nur Opazität/Skalierung/Schatten unterscheiden den "aktiven" Zustand. Kein `accessibilityLabel`/`Role`. WCAG 1.4.1-Verstoß.
- **Mögliche Auswirkung**: Screenreader-Nutzer erhalten keinerlei Information aus diesem Widget.
- **Empfohlene Lösung**: `accessible accessibilityRole="text"` mit `accessibilityLabel` wie "Status: Sicher (grün)" ergänzen.
- **Geschätztes Änderungsrisiko**: Niedrig.
- **Benötigte Tests**: VoiceOver/TalkBack-Pass auf Onboarding-Schritt 2.
- **Sicher automatisch behebbar**: Ja

### [A11Y-03] `BarChart` vermittelt Kategorie-Scores nur über Balkenbreite, standardmäßig ohne zugänglichen Text
- **Severity**: High
- **Kategorie**: Accessibility
- **Datei/Zeile**: `components/charts/BarChart.tsx:19-41`, Zeile 35; aufgerufen ohne `showValues` in `app/(tabs)/monitoring/index.tsx:277` und `app/(tabs)/report/[id].tsx:136`
- **Beschreibung**: `showValues` defaultet auf `false`. In beiden echten Aufrufstellen wird der numerische Score pro Kategorie nur als proportionale Balkenbreite dargestellt, ohne begleitende Zahl.
- **Mögliche Auswirkung**: Screenreader-Nutzer hören den Kategorienamen, aber nie den Score — Kerndaten aus `docs/SCORING.md`, entscheidend für IT-Partner-Priorisierung.
- **Empfohlene Lösung**: `showValues` an beiden Stellen aktivieren, oder `accessibilityLabel` unabhängig vom visuellen Flag ergänzen.
- **Geschätztes Änderungsrisiko**: Niedrig.
- **Benötigte Tests**: VoiceOver/TalkBack-Pass auf Monitoring und Report-Detail.
- **Sicher automatisch behebbar**: Ja

### [A11Y-04] `RadarChart` und `ScoreHistory` sind vollständig unzugängliche SVG-Datenvisualisierungen
- **Severity**: High
- **Kategorie**: Accessibility
- **Datei/Zeile**: `components/charts/RadarChart.tsx:17-61`; `components/charts/ScoreHistory.tsx:20-73`; aufgerufen in `app/(tabs)/report/[id].tsx:133`, `app/(tabs)/dashboard/index.tsx:115`, `app/(tabs)/monitoring/index.tsx:285`
- **Beschreibung**: `react-native-svg`s `SvgText`-Elemente werden nicht in den nativen Accessibility-Baum exponiert (iOS/Android) — VoiceOver/TalkBack können sie nicht lesen. Keine der Komponenten setzt ein zusammenfassendes `accessibilityLabel` auf der umschließenden Karte.
- **Mögliche Auswirkung**: Das Risikoprofil (pro-Kategorie-Scores) und der Score-Trend über Zeit sind für blinde/sehbehinderte Nutzer komplett unzugänglich.
- **Empfohlene Lösung**: Berechnetes `accessibilityLabel` auf der umschließenden Karte ergänzen; `Svg` selbst per `importantForAccessibility="no-hide-descendants"` markieren.
- **Geschätztes Änderungsrisiko**: Niedrig — reine Präsentationsergänzung.
- **Benötigte Tests**: VoiceOver/TalkBack-Pass auf Report-Detail, Dashboard, Monitoring.
- **Sicher automatisch behebbar**: Teilweise (Formulierung sollte geprüft werden)

### [A11Y-05] `VulnerabilityCard`: reine Swipe-Geste für "Bestätigen" ohne zugängliche Alternative
- **Severity**: High
- **Kategorie**: Accessibility
- **Datei/Zeile**: `components/ui/VulnerabilityCard.tsx:64-97`
- **Beschreibung**: Einziger Weg, eine Schwachstelle zu bestätigen, ist eine horizontale Swipe-Geste über 92px Schwelle. Keine Button-Alternative. WCAG-2.5.1-Verstoß (Pointer Gestures) — unerreichbar für VoiceOver/TalkBack- und Switch-Control-Nutzer.
- **Mögliche Auswirkung**: Nutzer mit VoiceOver/TalkBack/Switch-Access können Findings nicht bestätigen, falls die Funktion künftig aktiv verdrahtet wird.
- **Empfohlene Lösung**: Explizite "Bestätigen"-Pressable mit `accessibilityRole="button"` zusätzlich zur Swipe-Geste ergänzen.
- **Geschätztes Änderungsrisiko**: Mittel — betrifft Layout/Styling der geteilten Komponente.
- **Benötigte Tests**: VoiceOver + TalkBack + Switch-Control-Pass.
- **Sicher automatisch behebbar**: Nein

### [A11Y-06] `DomainCheck`-Statuszeilen vermitteln Pass/Warn/Critical rein über Punktfarbe
- **Severity**: High
- **Kategorie**: Accessibility
- **Datei/Zeile**: `components/modules/DomainCheck.tsx:35-42`
- **Beschreibung**: Jede Check-Zeile zeigt nur den Namen als Text; Pass/Warn/Critical/nicht-geprüft wird ausschließlich über `statusColor()` auf einem kleinen Punkt vermittelt — kein Statuswort, kein `accessibilityLabel`. Direkter WCAG-1.4.1-Verstoß; anders als `WlanScanner`s äquivalente `SecurityCheckList` (mit `AmpelBadge`+Textlabel) fehlt hier jeder Text-Fallback.
- **Mögliche Auswirkung**: Screenreader-Nutzer hören nur den Check-Namen, keine Information über Bestehen/Scheitern.
- **Empfohlene Lösung**: Statuswort neben dem Punkt ergänzen, analog zum bestehenden `WlanScanner`-Pattern.
- **Geschätztes Änderungsrisiko**: Niedrig.
- **Benötigte Tests**: VoiceOver/TalkBack-Pass überall, wo `DomainCheck` gerendert wird.
- **Sicher automatisch behebbar**: Ja

### [A11Y-07] Monitoring-Screen: unbeschrifteter Icon-Add-Button, unbeschriftete Remove-Chips, unbeschriftete Consent-Checkbox
- **Severity**: High
- **Kategorie**: Accessibility
- **Datei/Zeile**: `app/(tabs)/monitoring/index.tsx:380-382, 395, 335-342, 500-505`
- **Beschreibung**: Icon-only "Plus"-Button ohne `accessibilityLabel`; entfernbare Chips ohne Hinweis, dass Tap = Entfernen; Leak-Consent-Pressable ohne Checkbox-Semantik (anders als in `WlanScanner.tsx`); Schweregrad-Filter-Chips ohne `accessibilityRole`/`State`.
- **Mögliche Auswirkung**: Screenreader-Nutzer können Monitoring-Ziele nicht zuverlässig hinzufügen, wissen nicht, was ein Chip-Tap bewirkt (Risiko versehentlicher Löschung), können den Consent-Status vor einer DSGVO-relevanten Einwilligung nicht wahrnehmen.
- **Empfohlene Lösung**: `accessibilityLabel`/`Role`/`State` an allen vier Stellen ergänzen, konsistent mit dem in `WlanScanner.tsx` etablierten Pattern.
- **Geschätztes Änderungsrisiko**: Niedrig.
- **Benötigte Tests**: VoiceOver/TalkBack-Pass auf dem Monitoring-Screen inkl. Consent-Toggle und Ziel-Verwaltung.
- **Sicher automatisch behebbar**: Ja

### [A11Y-08] `ScoreRing` vermittelt Schweregrad nur über Farbe, ohne textuellen Kontext
- **Severity**: Medium
- **Kategorie**: Accessibility
- **Datei/Zeile**: `components/ui/ScoreRing.tsx:89-92, 97-101`
- **Beschreibung**: Zahl und Label werden als echter Text gerendert (technisch vorlesbar), aber ob der Score gut/schlecht ist, wird nur über die Farbe (`scoreToColor`) vermittelt — kein qualitatives Label wie "kritisch"/"gut".
- **Mögliche Auswirkung**: Screenreader-Nutzer müssten die 0-100-Schwellen mental kennen, um "48" einzuordnen.
- **Empfohlene Lösung**: `accessibilityLabel` mit Zahl + Klartext-Tier ergänzen (z. B. "48 von 100, Status kritisch").
- **Geschätztes Änderungsrisiko**: Niedrig.
- **Benötigte Tests**: VoiceOver/TalkBack-Pass auf Dashboard, Monitoring, WLAN-Scan-Ergebnis.
- **Sicher automatisch behebbar**: Ja

### [A11Y-09] `accessibilityLiveRegion` ist Android-only — iOS-VoiceOver-Nutzer verpassen asynchrone Status-Ansagen
- **Severity**: Medium
- **Kategorie**: Accessibility
- **Datei/Zeile**: `app/(tabs)/check/questionnaire.tsx:179-187`; `components/modules/WlanScanner.tsx:341-345,388-393,437-441`; `app/(auth)/onboarding/index.tsx:96-103`; `app/(auth)/login.tsx:191-198,201-203`; `app/(tabs)/report/index.tsx:98-102,133-138`
- **Beschreibung**: `accessibilityLiveRegion` wirkt laut React-Native-Doku nur auf Android; `accessibilityRole="alert"` allein triggert auf iOS keine automatische VoiceOver-Ansage — dafür ist ein expliziter `AccessibilityInfo.announceForAccessibility()`-Aufruf nötig.
- **Mögliche Auswirkung**: iOS-VoiceOver-Nutzer erfahren nie, dass ein WLAN-Scan fortgeschritten ist, ein Sync fehlgeschlagen ist, oder ein Login-/Onboarding-Fehler aufgetreten ist.
- **Empfohlene Lösung**: `AccessibilityInfo.announceForAccessibility(message)` zusätzlich zu den bestehenden Props aufrufen.
- **Geschätztes Änderungsrisiko**: Niedrig-Mittel — muss durch mehrere `setState`-Stellen gezogen werden, aber pro Screen klein/isoliert.
- **Benötigte Tests**: Manueller VoiceOver-Pass (physisches iOS-Gerät/Simulator).
- **Sicher automatisch behebbar**: Nein

### [A11Y-10] "Details anzeigen/ausblenden"-Toggles ohne `accessibilityRole`/`accessibilityState.expanded`
- **Severity**: Medium
- **Kategorie**: Accessibility
- **Datei/Zeile**: `components/modules/EvidenceCoveragePanel.tsx:44-47`; `components/modules/ReportFindings.tsx:44-47`; `components/modules/DomainCheck.tsx:44-47`; `components/ui/VulnerabilityCard.tsx:102-113`
- **Beschreibung**: Vier Expand/Collapse-Toggles ohne formale `expanded`/`collapsed`-State-Exposition (WCAG 4.1.2).
- **Mögliche Auswirkung**: Leicht degradierte, aber nicht blockierte Erfahrung für Screenreader-Nutzer.
- **Empfohlene Lösung**: `accessibilityRole="button"` und `accessibilityState={{expanded}}` an allen vier Stellen ergänzen.
- **Geschätztes Änderungsrisiko**: Niedrig.
- **Benötigte Tests**: VoiceOver/TalkBack-Spot-Check.
- **Sicher automatisch behebbar**: Ja

### [A11Y-11] `ScoreRing` fixgrößer Text-Container riskiert Clipping bei großen Dynamic-Type-Einstellungen
- **Severity**: Low
- **Kategorie**: Accessibility
- **Datei/Zeile**: `components/ui/ScoreRing.tsx:89-92`
- **Beschreibung**: Kein `maxFontSizeMultiplier` gesetzt; bei großen iOS-Barrierefreiheits-Textgrößen kann der zweizeilige Score/Caption-Text den fixgrößen kreisförmigen Container überlaufen.
- **Mögliche Auswirkung**: Sehbehinderte Nutzer mit großen Systemschriftgrößen sehen ggf. überlappenden/abgeschnittenen Text.
- **Empfohlene Lösung**: `maxFontSizeMultiplier` (z. B. 1.3-1.5) für diese spezifische Anzeige setzen.
- **Geschätztes Änderungsrisiko**: Niedrig.
- **Benötigte Tests**: Manueller Check mit "Larger Accessibility Sizes" aktiviert.
- **Sicher automatisch behebbar**: Ja

### [A11Y-12] WLAN-Netzsegment-Picker ohne `radiogroup`-Container-Rolle
- **Severity**: Low
- **Kategorie**: Accessibility
- **Datei/Zeile**: `components/modules/WlanScanner.tsx:258-277`
- **Beschreibung**: Anders als der Fragebogen (mit `accessibilityRole="radiogroup"`) fehlt hier die Gruppen-Umhüllung für die einzelnen Radio-Optionen.
- **Mögliche Auswirkung**: Geringfügige Navigations-/Kontextverwirrung, Funktionalität nicht blockiert.
- **Empfohlene Lösung**: `segmentOptions`-View mit `accessibilityRole="radiogroup"` + Label wrappen.
- **Geschätztes Änderungsrisiko**: Niedrig.
- **Benötigte Tests**: VoiceOver/TalkBack-Pass auf dem WLAN-Scan-Screen.
- **Sicher automatisch behebbar**: Ja

### [A11Y-13] Verwaistes `action-guide`-Modal ohne sichtbare/zugängliche Dismiss-Kontrolle
- **Severity**: Low
- **Kategorie**: Accessibility
- **Datei/Zeile**: `app/(modal)/action-guide.tsx:1-16`; `app/(modal)/_layout.tsx:1-14`
- **Beschreibung**: Kein Button zum Schließen/Zurück (anders als `alert-detail.tsx`). Aktuell unerreichbar (siehe RN-12).
- **Mögliche Auswirkung**: Keine aktuell (unerreichbar); bei Aktivierung ein echtes Dismiss-/Focus-Trap-Problem.
- **Empfohlene Lösung**: Datei entfernen oder "Zurück"/"Schließen"-Button ergänzen, bevor die Route verlinkt wird.
- **Geschätztes Änderungsrisiko**: Niedrig.
- **Benötigte Tests**: N/A bis verlinkt.
- **Sicher automatisch behebbar**: Nein (Produktentscheidung nötig)

---

## 7. Performance (PERF)

Geprüft: `workers/hono/src/index.ts` (vollständig), `lib/monitoring/service.ts`, `lib/security/scoring.ts`, `lib/security/networkProbes.ts`, `lib/security/wlan.ts`, `app/(tabs)/dashboard/`, `app/(tabs)/monitoring/`, `app/(tabs)/inventory/`, `app/_layout.tsx`, `components/charts/*`, `package.json`, `supabase/migrations/*.sql`.

**Bereits gefixt seit Tracker**: Fehlende Timeouts (bis auf PERF-03/SEC-05), fehlender Composite-Index auf `security_checks`.

### [PERF-01] Ein einzelner Domain-Check fächert in ~150-160 Outbound-Fetches auf — Risiko für Cloudflare-Subrequest-Limit und Provider-Rate-Limit-Bans
- **Severity**: Critical
- **Kategorie**: Performance
- **Datei/Zeile**: `workers/hono/src/index.ts:1974-2017` (`performExternalCheck`), `3285-3302` (`checkSubdomains`), `3326-3339` (`discoverCommonDnsSubdomains`), `3341-3368` (`evaluateSubdomain`), `3396-3413` (`findDkim`), `2981-2990` (`checkEmailSecurity`)
- **Beschreibung**: `performExternalCheck` läuft 7 Checks parallel; zwei davon fächern weit über 7 hinaus: `checkEmailSecurity` probiert 11 DKIM-Selektoren parallel (17 Fetches insgesamt); die Subdomain-Discovery/Evaluation ohne SecurityTrails probiert 10 Kandidaten × 3 Record-Typen (30 Fetches) und evaluiert bis zu 12 entdeckte Subdomains × 8 Fetches (bis zu 96 weitere). Summe: ~150-160 Outbound-Fetches für EINEN Domain-Check.
- **Mögliche Auswirkung**: Cloudflare Workers haben ein hartes Subrequest-Limit pro Invocation (50 Free / 1000 Paid). Ein einzelner Aufruf kann dieses Budget bereits annähern/überschreiten. `handleMonitoringRun` erlaubt bis zu 25 Domains pro Aufruf — Worst Case ~25 × 150 ≈ 3.750 Subrequests in einer Invocation, weit über jedem Budget. Auch unterhalb dessen: bis zu 13 gleichzeitige SSL-Labs-`analyze`-Calls pro Domain (SSL Labs' Nutzungsrichtlinie rät explizit von gleichzeitigen/schnellen Assessments ab und kann die Quell-IP temporär blockieren).
- **Empfohlene Lösung**: Subdomain-Discovery/-Evaluation deutlich niedriger deckeln (3-5 statt 12); bestehende `mapInBatches`-Bündelung für `findDkim`/`evaluateSubdomain` nutzen; Subdomain-SSL/DNS-Evaluation ggf. zu einem Opt-in/niedrigerfrequenten Check machen.
- **Geschätztes Änderungsrisiko**: Mittel — betrifft Kern-Scoring-/Finding-Generierung, Evidence-Semantik ("not_checked") muss erhalten bleiben.
- **Benötigte Tests**: Test mit gemocktem Fetch-Zähler, der begrenzte Fetch-Anzahl für `performExternalCheck`/`handleMonitoringRun` mit N Domains verifiziert.
- **Sicher automatisch behebbar**: Nein

### [PERF-02] Scheduled Cron führt bei jedem Modul-Trigger immer die volle Multi-Provider-Prüfung aus, ignoriert das Pro-Modul-Zeitplan-Design
- **Severity**: Critical
- **Kategorie**: Performance
- **Datei/Zeile**: `workers/hono/src/index.ts:2329-2346` (`runScheduledMonitoring`), `463-469` (`MONITORING_SCHEDULE`), `471-473` (`CRON_MODULES`), `workers/hono/wrangler.toml:8-14`
- **Beschreibung**: `MONITORING_SCHEDULE` definiert 5 unterschiedliche Kadenzen. `runScheduledMonitoring` ruft aber immer die VOLLE `performExternalCheck`(~150 Fetches)-Kette auf, unabhängig davon, welches Modul den Cron ausgelöst hat — `modules` wird erst nachträglich zum Filtern der Events genutzt, nicht zum Überspringen von Provider-Calls. Die 5 Cron-Strings lösen 10 unterschiedliche Trigger-Zeiten/Tag aus — die teure Kette läuft damit ~10×/Tag statt einmal wie beabsichtigt.
- **Mögliche Auswirkung**: Multipliziert die Auswirkung von PERF-01 um ~10×/Tag über die gesamte `practices`-Tabelle. Verbraucht metered Provider-Kontingente (SecurityTrails, Shodan, VirusTotal, HIBP haben typischerweise Tages-/Monatslimits) weit schneller als beabsichtigt; riskiert Scheitern der Cron-Invocation selbst am Subrequest-Limit.
- **Empfohlene Lösung**: `performExternalCheck` einen `modules`-Parameter übergeben und Provider-Calls außerhalb des jeweiligen Cron-Modul-Sets überspringen.
- **Geschätztes Änderungsrisiko**: Mittel-Hoch — erfordert Umbau der All-or-Nothing-Ergebnisform, ohne Snapshot-/Comparison-Schema zu brechen.
- **Benötigte Tests**: Test, dass ein Cron nur die zu seinem Modul-Set gehörenden Provider-Funktionen aufruft; Regressionstest für partielle Check-Daten in `buildMonitoringComparison`.
- **Sicher automatisch behebbar**: Nein

### [PERF-03] `checkHttpsSignal` umgeht den Timeout-Wrapper des Workers, anders als jeder andere Outbound-Call
- **Severity**: High
- **Kategorie**: Performance
- **Datei/Zeile**: `workers/hono/src/index.ts:2942-2959` (identisch mit SEC-05)
- **Beschreibung**: Bare `fetch` ohne Signal/Timeout, aufgerufen synchron vor dem SSL-Labs-Call innerhalb von `checkSsl`.
- **Mögliche Auswirkung**: Da `checkSsl` einer von 7 Zweigen im äußeren `Promise.all` ist, kann eine langsame/blackholende Zieldomain den gesamten External Check über den regulären `OUTBOUND_TIMEOUT_MS`-Rahmen hinaus blockieren.
- **Empfohlene Lösung**: Durch `fetchWithTimeout` mit `OUTBOUND_TIMEOUT_MS.securityProvider` ersetzen.
- **Geschätztes Änderungsrisiko**: Niedrig.
- **Benötigte Tests**: Unit-Test mit simuliertem hängendem Fetch.
- **Sicher automatisch behebbar**: Ja

### [PERF-04] `fetchMonitoringTargets` führt einen unbegrenzten Full-Scan von `practices` ohne unterstützenden Index aus
- **Severity**: Medium
- **Kategorie**: Performance
- **Datei/Zeile**: `workers/hono/src/index.ts:2747-2763`
- **Beschreibung**: Kein `LIMIT`/Pagination, Filter auf `domain` hat keinen Index (nur `practices_owner_id_idx` existiert). Läuft bei jedem der ~10 täglichen Cron-Trigger.
- **Mögliche Auswirkung**: Wird bei Tabellenwachstum zum Full-Table-Scan; bestimmt zusammen mit PERF-01/02 die Anzahl teurer `performExternalCheck`-Aufrufe pro Cron-Tick ohne Obergrenze.
- **Empfohlene Lösung**: Partiellen Index `(domain) where domain is not null` ergänzen; Cron-Verarbeitung paginieren/batchen.
- **Geschätztes Änderungsrisiko**: Niedrig (Index) / Mittel (Pagination).
- **Benötigte Tests**: `EXPLAIN ANALYZE` vor/nach Index.
- **Sicher automatisch behebbar**: Nein (Index sicher, Pagination braucht Design-Review)

### [PERF-05] React Query wird bereitgestellt, aber nie genutzt — jeder Screen macht ungecachte, unretried manuelle Fetches
- **Severity**: Medium
- **Kategorie**: Performance
- **Datei/Zeile**: `app/_layout.tsx:3,13,18-32`; `app/(tabs)/dashboard/index.tsx:29-61`; `app/(tabs)/monitoring/index.tsx:81-102`
- **Beschreibung**: `QueryClientProvider` ist eingerichtet, aber `useQuery`/`useMutation` wird nirgends im Repo verwendet. Dashboard/Monitoring nutzen `useEffect`+`useState` mit vollständigem Re-Fetch bei jedem Mount, ohne Caching/Retry.
- **Mögliche Auswirkung**: Wiederholte volle Re-Fetches bei Tab-Wechsel, keine Resilienz gegen transiente Netzwerkfehler.
- **Empfohlene Lösung**: Fetch-Logik zu `useQuery` migrieren, oder den ungenutzten `QueryClientProvider` entfernen.
- **Geschätztes Änderungsrisiko**: Mittel — touches Loading/Error-State-Handling mit bestehenden Tests.
- **Benötigte Tests**: Screen-Tests nach Migration, Fetch-Call-Count-Spy gegen Duplikate.
- **Sicher automatisch behebbar**: Nein

### [PERF-06] Monitoring-Tab umgeht den aggregierten Dashboard-Endpunkt des Workers, dupliziert Datenladepfade
- **Severity**: Medium
- **Kategorie**: Performance
- **Datei/Zeile**: `lib/monitoring/service.ts:36-97` vs. `workers/hono/src/index.ts:939-1006`
- **Beschreibung**: Zwei separate Codepfade (Server-seitige Service-Role-Aggregation vs. Client-seitige RLS-Queries) für überlappende Monitoring-Daten ohne gemeinsamen Cache.
- **Mögliche Auswirkung**: Tab-Wechsel triggert jeweils frischen Full-Fetch; zwei Autorisierungspfade können auseinanderdriften.
- **Empfohlene Lösung**: Monitoring-Screen für nicht-Realtime-Daten den Worker-Dashboard-Endpunkt konsumieren lassen und Realtime-Subscription darüber legen, oder Trennung explizit dokumentieren.
- **Geschätztes Änderungsrisiko**: Mittel — ändert das Autorisierungsmodell für die initialen Monitoring-Daten.
- **Benötigte Tests**: Screen-Test gegen doppelte Roundtrips.
- **Sicher automatisch behebbar**: Nein

### [PERF-07] Dashboard-Endpoint führt 6 separate Supabase-REST-Roundtrips pro Load aus
- **Severity**: Low-Medium
- **Kategorie**: Performance
- **Status (Phase 6)**: ZURÜCKGESTELLT als dokumentierte Folgearbeit. Die sechs Roundtrips sind
  bereits via `Promise.all` parallelisiert (kein sequentielles Warten), Severity Low-Medium. Eine
  einzelne Postgres-RPC würde eine neue DB-Funktion einführen, die dauerhaft mit der
  `normalizeDashboard*`-Logik im Worker synchron gehalten werden muss (plus Vergleichstest
  RPC-vs-aktueller Output) — der Aufwand/Risiko übersteigt den Phase-6-Rahmen bei geringem Nutzen.
  Nächster Schritt bei Aufnahme: RPC `dashboard_snapshot(practice_id)` mit deckungsgleichem
  Output-Shape + Snapshot-Vergleichstest.
- **Datei/Zeile**: `workers/hono/src/index.ts:939-1006`, `Promise.all` bei 947-979
- **Beschreibung**: Bereits parallelisiert (nicht sequentiell, wie der ältere Tracker vermerkte), aber weiterhin 6 separate HTTPS-Roundtrips pro Load.
- **Mögliche Auswirkung**: Zusätzlicher Fixkosten-Overhead (Connection-Setup, Auth-Header) sechsfach pro Load.
- **Empfohlene Lösung**: Einzelne Postgres-RPC erwägen, die alle sechs Ergebnismengen in einem Roundtrip liefert.
- **Geschätztes Änderungsrisiko**: Mittel — neue DB-Funktion muss mit Normalisierungslogik synchron bleiben.
- **Benötigte Tests**: Vergleichstest RPC- vs. aktueller Output.
- **Sicher automatisch behebbar**: Nein

### [PERF-08] Dashboard-History-Query wird vom bestehenden Composite-Index nicht vollständig abgedeckt
- **Severity**: Low-Medium
- **Kategorie**: Performance
- **Datei/Zeile**: `workers/hono/src/index.ts:969-973` vs. `supabase/migrations/20260717120000_worker_grants_and_security_checks_index.sql:1-2`
- **Beschreibung**: Der Composite-Index `(practice_id, type, completed_at desc)` passt zu den typgefilterten Queries, aber die 30-Zeilen-History-Query filtert nicht auf `type` — Postgres kann die Sortierreihenfolge des Index über verschiedene `type`-Werte hinweg nicht nutzen.
- **Mögliche Auswirkung**: Gering beim aktuellen Umfang (`limit=30`), aber der Index beschleunigt diese Query nicht wie ursprünglich beabsichtigt.
- **Empfohlene Lösung**: Ergänzenden Index `(practice_id, completed_at desc)` ohne `type` hinzufügen.
- **Geschätztes Änderungsrisiko**: Niedrig — additiver Index.
- **Benötigte Tests**: `EXPLAIN ANALYZE` vor/nach.
- **Sicher automatisch behebbar**: Ja

### [PERF-09] `reports`-Tabelle ohne Index für die Reports-Listen-Query-Form
- **Severity**: Low
- **Kategorie**: Performance
- **Datei/Zeile**: `workers/hono/src/index.ts:1116-1138` vs. `reports_practice_id_idx` (Einzelspalte)
- **Beschreibung**: Kein Index deckt `anonymized_at is null` + `created_at desc` zusammen mit `practice_id` ab.
- **Mögliche Auswirkung**: Gering — durch `FREE_PLAN_DAILY_AI_REPORT_LIMIT = 3` natürlich begrenzt, aber Lücke für Paid-Nutzer über Zeit.
- **Empfohlene Lösung**: `create index on reports (practice_id, anonymized_at, created_at desc)`.
- **Geschätztes Änderungsrisiko**: Niedrig.
- **Benötigte Tests**: `EXPLAIN ANALYZE`.
- **Sicher automatisch behebbar**: Ja

### [PERF-10] Ungenutzte Dependency `@shopify/react-native-skia` bläht native App-Binaries auf
- **Severity**: Low
- **Kategorie**: Performance (Bundle-Größe)
- **Datei/Zeile**: `package.json:38`
- **Beschreibung**: Deklariert, aber nirgends importiert — alle Charts nutzen `react-native-svg`. (Siehe auch MAINT-06.)
- **Mögliche Auswirkung**: Unnötige Zunahme der nativen Binärgröße/Linking-Zeit.
- **Empfohlene Lösung**: Aus `package.json` entfernen, falls nicht für geplante Features vorgesehen.
- **Geschätztes Änderungsrisiko**: Niedrig — nativer Rebuild zur Verifikation nötig.
- **Benötigte Tests**: `npm run typecheck`, vollständiger nativer Build nach Entfernung.
- **Sicher automatisch behebbar**: Nein (native Rebuild-Verifikation nötig)

### [PERF-11] NativeWind/Tailwind-Pipeline umwickelt jeden Metro-Build trotz null `className`-Nutzung
- **Severity**: Low
- **Kategorie**: Performance (Build-Zeit)
- **Datei/Zeile**: `metro.config.js:1-6`; `tailwind.config.js`; `package.json:58,86`
- **Beschreibung**: Gesamte UI ist via `StyleSheet.create` gestylt, `className=` kommt nirgends vor.
- **Mögliche Auswirkung**: Langsamere Metro-Dev-Rebuilds und Produktions-Bundling für ein System ohne aktuellen Laufzeitnutzen.
- **Empfohlene Lösung**: NativeWind/Tailwind-Wiring entfernen, falls kein Plan zur Adoption besteht.
- **Geschätztes Änderungsrisiko**: Niedrig-Mittel — sollte mit sauberem Build validiert werden.
- **Benötigte Tests**: Vollständiger Metro-Bundle-Build vor/nach.
- **Sicher automatisch behebbar**: Nein

### [PERF-12] Inventar-/Geräte-/Access-Point-Listen rendern via nicht-virtualisiertem `ScrollView` + `.map()`
- **Severity**: Low
- **Kategorie**: Performance (Rendering)
- **Datei/Zeile**: `components/ui/Screen.tsx:19-22`; `app/(tabs)/inventory/index.tsx:377,458,515`
- **Beschreibung**: Listenberechnungen sind memoized (`useMemo`), aber Rendering ist nicht virtualisiert. (Deckt sich mit RN-10.)
- **Mögliche Auswirkung**: Vernachlässigbar bei typischer Inventargröße, degradiert bei hunderten Einträgen.
- **Empfohlene Lösung**: Migration zu `FlatList`, sobald Inventargrößen relevant wachsen.
- **Geschätztes Änderungsrisiko**: Mittel.
- **Benötigte Tests**: Manueller/E2E-Scroll-Performance-Check.
- **Sicher automatisch behebbar**: Nein

### [PERF-13] `handleMonitoringStatus` führt zwei unabhängige Supabase-Queries sequentiell statt parallel aus
- **Severity**: Low
- **Kategorie**: Performance
- **Datei/Zeile**: `workers/hono/src/index.ts:2071-2093`
- **Beschreibung**: `snapshots` und `events` sind unabhängige `await`-Calls ohne Datenabhängigkeit, aber sequentiell statt via `Promise.all`.
- **Mögliche Auswirkung**: Verdoppelt die Wall-Clock-Latenz dieses Endpunkts relativ zu paralleler Ausführung.
- **Empfohlene Lösung**: Beide Calls in `Promise.all` wrappen, analog zu `handleDashboard`.
- **Geschätztes Änderungsrisiko**: Niedrig — mechanisch, keine Logikänderung.
- **Benötigte Tests**: Bestehende Worker-Tests sollten unverändert bestehen.
- **Sicher automatisch behebbar**: Ja

---

## 8. Wartbarkeit, Dead Code, Duplikate, Testbarkeit, Dependency Management (MAINT)

Geprüft: `package.json` (inkl. `npm outdated`), `knip`-Analyse, `app/`, `components/`, `lib/`, `workers/hono/src/`, `eslint.config.mjs`, `jest.config.js`.

**Positiv verifiziert**: Keine `console.log`-Debug-Leftovers im Produktionscode gefunden.

### [MAINT-01] Score-Tone/Risk-Level-Mapping 7-fach dupliziert mit inkonsistenten Schwellen gegenüber den dokumentierten Ampel-Bändern
- **Severity**: High
- **Kategorie**: Duplikate / Hardcodierte Werte
- **Datei/Zeile**: `lib/security/scoring.ts:462-466` (tot), `app/(tabs)/report/[id].tsx:203-205`, `lib/security/practiceGuidance.ts:147-149`, `lib/monitoring/types.ts:94-96`, `lib/security/wlan.ts:1441-1443`, `components/modules/WlanScanner.tsx:744-746`, `lib/security/segmentationAssessment.ts:68`
- **Beschreibung**: Dasselbe 3-Stufen-Mapping (`score >= 80 → safe`, `>= 55 → warning`, sonst `critical`) ist unabhängig an 7 Stellen re-implementiert. Eine Kopie (`scoring.ts:462`, `scoreTone`) ist komplett tot. Die offiziell dokumentierten Ampel-Bänder (CLAUDE.md/`docs/SCORING.md`, implementiert in `decideAmpel`) nutzen **75/50** — andere Zahlen als die 80/55 aller 7 duplizierten Tone-Helper.
- **Mögliche Auswirkung**: Eine Praxis mit Score 78 zeigt "grün/safe" laut offizieller Ampel-Logik, aber "warning" laut jedem der duplizierten UI-Helper — eine reale, nutzersichtbare Inkonsistenz zwischen Dashboard-Ampel und Kategorie-/Report-/Monitoring-Tone-Badges.
- **Empfohlene Lösung**: Einzelne exportierte `toneForScore(score): RiskTone` in einem gemeinsamen Modul extrahieren; alle 6 aktiven Call-Sites importieren lassen; toten `scoreTone`-Export entfernen.
- **Geschätztes Änderungsrisiko**: Mittel — betrifft UI-sichtbaren Ton über Dashboard/Reports/WLAN-Scanner/Monitoring; Produktentscheidung nötig, welche Schwelle (75/50 vs. 80/55) kanonisch ist.
- **Benötigte Tests**: Test, der den gemeinsamen Helper gegen die dokumentierten Score-Bänder (grün ≥75, gelb ≥50, rot <50) verifiziert. `practiceGuidance.ts` hat aktuell null Testabdeckung.
- **Sicher automatisch behebbar**: Nein — Produktentscheidung zur korrekten Schwelle nötig.

### [MAINT-02] UUID-Validierungs-Regex 9-fach copy-paste über App und Worker
- **Severity**: Medium
- **Kategorie**: Duplikate
- **Datei/Zeile**: `app/(tabs)/report/index.tsx:18`, `app/(tabs)/report/[id].tsx:20`, `lib/security/external.ts:4`, `lib/dashboard/service.ts:4`, `lib/ai/report.ts:103`, `lib/monitoring/service.ts:27`, `lib/ai/report-service.ts:4`, `lib/security/wlan.ts:1447-1449`, `workers/hono/src/index.ts:839-841`
- **Beschreibung**: Der identische UUID-Regex ist unabhängig 9-mal definiert (7× in der App, je 1× in `wlan.ts` und im Worker).
- **Mögliche Auswirkung**: Bei künftiger Änderung der UUID-Format-Anforderung müssten 9 Stellen synchron aktualisiert werden; eine übersehene Stelle führt still zu inkonsistenter ID-Validierung an einer sicherheitsrelevanten Grenze.
- **Empfohlene Lösung**: Einen `isUuid`/`UUID_RE`-Export in einem gemeinsamen App-seitigen Util für die 7 App-Kopien; Worker-Kopie separat halten (andere Runtime-Grenze), aber `wlan.ts`'s lokale Kopie ebenfalls deduplizieren.
- **Geschätztes Änderungsrisiko**: Niedrig — reine Extraktion, verhaltensneutral bei wörtlicher Kopie.
- **Benötigte Tests**: Bestehende Tests sollten unverändert bestehen; neuer `isUuid.test.ts` verhindert künftiges Auseinanderdriften.
- **Sicher automatisch behebbar**: Nein — mechanisch, aber viele Dateien betroffen, sollte reviewt werden.

### [MAINT-03] `generateAiReport` in `lib/ai/report.ts` ist ein vollständig verwaister client-seitiger Report-Generator
- **Severity**: Medium
- **Kategorie**: Dead Code
- **Datei/Zeile**: `lib/ai/report.ts:131-161`, plus exklusiv genutzte Typen (Zeilen 7-90)
- **Beschreibung**: Exportiert, aber null Aufrufer im gesamten Repo (verifiziert via `knip` und Grep). Wrappt `generateReport` und formt das Ergebnis in eine `AiReportContent`-Form um, die nicht mehr der tatsächlich von der App konsumierten Form entspricht — wirkt wie Scaffolding einer früheren Report-Architektur.
- **Mögliche Auswirkung**: Toter Code verursacht Wartungsaufwand (muss durch Refactorings hindurch typkorrekt gehalten werden) und verwirrt künftige Leser über den kanonischen Report-Generierungs-Einstiegspunkt.
- **Empfohlene Lösung**: `generateAiReport` und exklusiv genutzte Typen entfernen; `Report`, `generateReport`, `generateReportWithId`, `validateReport` (aktiv genutzt) behalten.
- **Geschätztes Änderungsrisiko**: Niedrig — isolierte, unreferenzierte Funktion.
- **Benötigte Tests**: `npm run typecheck` und `npm run test:unit` sollten nach Entfernung grün bleiben.
- **Sicher automatisch behebbar**: Ja — für die Funktion selbst, bei null Referenzen.

### [MAINT-04] Fünf vollständig unreferenzierte Dateien (dead UI/Util-Code), bestätigt durch knip + Grep
- **Severity**: Medium
- **Kategorie**: Dead Code
- **Datei/Zeile**: `components/modules/DomainCheck.tsx` (201 Zeilen), `components/ui/RiskCard.tsx` (54 Zeilen), `constants/animations.ts` (10 Zeilen), `constants/typography.ts` (19 Zeilen), `lib/store/storage.ts` (54 Zeilen, MMKV-Wrapper)
- **Beschreibung**: `knip` markiert diese als ungenutzt; unabhängig per Grep bestätigt. `DomainCheck.tsx` ist die Render-Komponente für den bewusst deaktivierten `runExternalCheck`-Flow (`TODO(external-check)` in `app/(tabs)/report/index.tsx:51`) — akzeptierte Produktentscheidung, aber ohne Testabdeckung verrottend. `lib/store/storage.ts` (MMKV) ist tot, weil nichts in der App darüber persistiert — Auth nutzt SecureStore, Inventory/Report-Stores bleiben In-Memory.
- **Mögliche Auswirkung**: Tote Dateien blähen die Codebasis auf, erscheinen als False Leads bei künftigen Greps/Refactorings; `lib/store/storage.ts` erweckt fälschlich den Eindruck, MMKV-Persistenz sei verdrahtet.
- **Empfohlene Lösung**: `constants/animations.ts`/`constants/typography.ts` direkt löschen (risikofrei). Bei `RiskCard.tsx`/`DomainCheck.tsx`/`lib/store/storage.ts` mit Produkt/Design klären, ob wieder aktiviert oder entfernt werden soll.
- **Geschätztes Änderungsrisiko**: Niedrig für `constants/*`. Mittel für `DomainCheck.tsx`/`lib/store/storage.ts` — repräsentieren halbfertige Features.
- **Benötigte Tests**: Keine existieren aktuell für diese 5 Dateien — bereits Beleg, dass sie von CI nicht geprüft werden.
- **Sicher automatisch behebbar**: Ja für `constants/animations.ts`/`constants/typography.ts`; Nein für `DomainCheck.tsx`/`lib/store/storage.ts`.

### [MAINT-05] `networkContextFindings`-Helper ist toter Code, dupliziert bereits am vorgesehenen Call-Site inline vorhandene Logik
- **Severity**: Low
- **Kategorie**: Dead Code / Duplikate
- **Datei/Zeile**: `lib/security/networkSecurityAssessment.ts:72-79`
- **Beschreibung**: Kombiniert `assessIpv6`/`assessDnsResolvers`/`dhcpConsistencyFinding`, wird aber nirgends aufgerufen — dieselben drei Calls sind bereits inline in `assessGatewaySecurity` (Zeilen 40-43) vorhanden.
- **Mögliche Auswirkung**: Gering — konkretes Beispiel für "nach Refactoring liegengebliebenen" toten Code.
- **Empfohlene Lösung**: Entfernen, oder `assessGatewaySecurity` auf den Aufruf umstellen (DRY).
- **Geschätztes Änderungsrisiko**: Niedrig.
- **Benötigte Tests**: Bestehende Tests sollten grün bleiben.
- **Sicher automatisch behebbar**: Ja

### [MAINT-06] Ungenutzte native Dependency `@shopify/react-native-skia` und totes MMKV-Storage-Pairing
- **Severity**: Medium
- **Kategorie**: Dependency Management / Dead Code
- **Datei/Zeile**: `package.json:38, 64`; `lib/store/storage.ts`
- **Beschreibung**: `@shopify/react-native-skia` hat null Importe im gesamten Repo (die Chart-Komponenten nutzen `react-native-svg`). `react-native-mmkv` wird nur vom toten `lib/store/storage.ts` (MAINT-04) plus einem Testfile referenziert.
- **Mögliche Auswirkung**: Erhöht App-Binärgröße/Build-Zeit/native-Modul-Fläche unnötig — relevant angesichts der ohnehin anstehenden Expo-51→57-Migration.
- **Empfohlene Lösung**: `@shopify/react-native-skia` nach Teamabstimmung entfernen; `react-native-mmkv` zusammen mit `storage.ts` entfernen, falls der MMKV-Pfad aufgegeben wird.
- **Geschätztes Änderungsrisiko**: Niedrig für Skia (null Referenzen, nativer Rebuild ohne Codeänderung nötig). Mittel für MMKV (an Storage.ts-Entscheidung gekoppelt).
- **Benötigte Tests**: `npm run typecheck`; für Skia ein vollständiger nativer Rebuild-Smoke-Test.
- **Sicher automatisch behebbar**: Nein — native Dependency-Entfernung erfordert nativen Rebuild.

### [MAINT-07] Vier devDependencies deklariert, aber nie genutzt — Jest-Config nutzt nicht einmal das `jest-expo`-Preset
- **Severity**: Low
- **Kategorie**: Dependency Management
- **Datei/Zeile**: `package.json:76,77,83` (`@testing-library/jest-native`, `@testing-library/react-native`, `msw`); `jest.config.js:1-21`
- **Beschreibung**: `knip` markiert diese drei als ungenutzte devDependencies. Alle Komponenten-Tests nutzen `react-test-renderer` direkt mit handgerollten Mocks statt React Testing Library. `jest-expo` ist ebenfalls deklariert, aber `jest.config.js` setzt `testEnvironment: "node"` ohne `preset: "jest-expo"` — das Preset wird nie tatsächlich verwendet.
- **Mögliche Auswirkung**: Verwirrende Dependency-Fläche — ein neuer Contributor könnte fälschlich RTL-/jest-native-Konventionen erwarten.
- **Empfohlene Lösung**: Entweder die drei ungenutzten Pakete entfernen, oder Tests auf tatsächliche RTL-Nutzung migrieren.
- **Geschätztes Änderungsrisiko**: Niedrig für einfache Entfernung; Mittel für RTL-Migration.
- **Benötigte Tests**: `npm test` muss grün bleiben.
- **Sicher automatisch behebbar**: Ja für package.json-Entfernung; Nein für RTL-Migration.

### [MAINT-08] `eslint-config-expo` ist eine ungenutzte devDependency, aber der einzige Grund, warum ihre transitiven `@typescript-eslint/*`-Pakete existieren — Entfernung würde Lint stillschweigend brechen
- **Severity**: Medium
- **Kategorie**: Dependency Management
- **Datei/Zeile**: `package.json:80`; `eslint.config.mjs:1-2`
- **Beschreibung**: `eslint-config-expo` wird nirgends referenziert (keine `.eslintrc*`, `eslint.config.mjs` ist eine handgeschriebene Flat-Config). `@typescript-eslint/eslint-plugin`/`parser`, die `eslint.config.mjs` direkt importiert, existieren in `node_modules` aber NUR als transitive Dependencies von `eslint-config-expo` — keines der beiden Pakete ist direkt in `package.json` deklariert.
- **Mögliche Auswirkung**: Eine Falle für genau die Art Cleanup, die dieser Bericht empfiehlt: Ein Contributor sieht `eslint-config-expo` als unreferenziert und entfernt es — was `@typescript-eslint/eslint-plugin`/`parser` mit-entfernt und `npm run lint`/CI-„quality"-Job stillschweigend bricht.
- **Empfohlene Lösung**: `@typescript-eslint/eslint-plugin` und `@typescript-eslint/parser` als explizite `devDependencies` ergänzen (gepinnt auf die aktuell aufgelöste Version 7.18.0), DANACH `eslint-config-expo` entfernen.
- **Geschätztes Änderungsrisiko**: Niedrig — additiver Fix vor sicherer Entfernung; Reihenfolge ist wichtig.
- **Benötigte Tests**: `npm run lint` muss vor UND nach der Änderung erfolgreich sein.
- **Sicher automatisch behebbar**: Nein — muss in korrekter Reihenfolge erfolgen, manuelle Verifikation via `npm run lint` nötig.

### [MAINT-09] `workers/hono/src/index.ts` ist eine 3.726-Zeilen-Datei mit 100+-Zeilen-Funktionen
- **Severity**: Medium
- **Kategorie**: Wartbarkeit
- **Datei/Zeile**: `workers/hono/src/index.ts` gesamt; schlimmste Funktionen: `buildMonitoringEvents` (~159 Zeilen), `buildFindings` (~102 Zeilen), `requirePracticeAccess` (~88 Zeilen)
- **Beschreibung**: Deckt sich mit ARCH-04, hier mit konkreten Zeilenzahlen belegt. Die zugehörige Testdatei `workers/hono/__tests__/external-check.test.ts` spiegelt den Monolithen mit **3.562 Zeilen** in einer einzigen Datei — ein passender Test-seitiger Wartbarkeits-Geruch.
- **Mögliche Auswirkung**: Hohe kognitive Last für jede Änderung; Merge-Konflikt-Magnet; erschwerte Code-Review.
- **Empfohlene Lösung**: In Module aufteilen (siehe ARCH-04); `workers/hono/src/privacy.ts` existiert bereits (nur 20 Zeilen, ein Typ) — Präzedenzfall für die Aufteilung, der nicht konsequent verfolgt wurde.
- **Geschätztes Änderungsrisiko**: Hoch — Datei-Split ist in Hono-Apps riskant, falls Closures/geteilter State nicht sauber extrahiert werden.
- **Benötigte Tests**: `npm run test:worker` muss nach jedem Extraktionsschritt bestehen.
- **Sicher automatisch behebbar**: Nein

### [MAINT-10] `lib/monitoring/service.ts` und `lib/dashboard/service.ts` haben null Unit-Testabdeckung
- **Severity**: Medium
- **Kategorie**: Testbarkeit
- **Datei/Zeile**: `lib/monitoring/service.ts` (442 Zeilen); `lib/dashboard/service.ts`
- **Beschreibung**: Kein `__tests__`-Verzeichnis unter `lib/monitoring/` oder `lib/dashboard/` (anders als `lib/security/`, `lib/ai/`, `lib/inventory/`, `lib/store/`). Diese Services fragen direkt Supabase vom Client ab und definieren eigene Error-Klassen (`MonitoringFetchError`, `DashboardFetchError`), deren Fehlerpfade ungetestet sind.
- **Mögliche Auswirkung**: Stille Regressionen im Dashboard-/Monitoring-Datenladen — den beiden für den App-Wert zentralsten Screens — würden nur via manueller QA oder in Produktion sichtbar, nicht in CI.
- **Empfohlene Lösung**: `lib/monitoring/__tests__/service.test.ts` und `lib/dashboard/__tests__/service.test.ts` ergänzen, analog zum Mocking-Pattern in `lib/security/__tests__/wlan-sync.test.ts`.
- **Geschätztes Änderungsrisiko**: Niedrig — reine Testergänzung.
- **Benötigte Tests**: Neue Testdateien wie beschrieben.
- **Sicher automatisch behebbar**: Nein — Testschreiben erfordert Verständnis des beabsichtigten Verhaltens.

### [MAINT-11] `TrafficLight`-toter Alias-Export in `components/ui/Ampel.tsx`
- **Severity**: Low
- **Kategorie**: Dead Code
- **Datei/Zeile**: `components/ui/Ampel.tsx:61`
- **Beschreibung**: `knip` markiert dies als Duplicate-Export; einziger genutzter Name ist `AmpelKomponente`.
- **Mögliche Auswirkung**: Vernachlässigbar — ein Beispiel für sich ansammelnde tote Alias-Exports.
- **Empfohlene Lösung**: `TrafficLight`-Export löschen.
- **Geschätztes Änderungsrisiko**: Niedrig.
- **Benötigte Tests**: `npm run typecheck` genügt.
- **Sicher automatisch behebbar**: Ja

### [MAINT-12] Kern-Dependencies laut `npm outdated` mehrere Majors veraltet, einige bereits am Ende des Supports
- **Severity**: High
- **Kategorie**: Dependency Management
- **Datei/Zeile**: `package.json:41-89`
- **Beschreibung**: Unabhängig neu geprüft: `expo` 51.0.39 → aktuell 57.0.7, `expo-router` 3.5.24 → 57.0.7, `react-native` 0.74.5 → 0.86.0, `react` 18.2.0 → 19.2.7, `typescript` 5.3.3 → 7.0.2, `eslint` 8.57.1 → 10.7.0, `jest` 29.7.0 → 30.4.2, `zustand` 4.5.7 → 5.0.14, `tailwindcss` 3.4.19 → 4.3.3, `wrangler` 3.114.17 → 4.112.0. Alle Expo-Native-Module sind an die SDK-51-Ära gebunden und müssten koordiniert mitwandern.
- **Mögliche Auswirkung**: Sicherheitspatches für RN/Expo-Native-Module werden für SDK 51 irgendwann eingestellt; neue Drittanbieter-RN-Bibliotheken verlangen zunehmend SDK 53+; der eventuelle Upgrade-Sprung wird umso riskanter, je länger er aufgeschoben wird.
- **Empfohlene Lösung**: Inkrementellen Expo-SDK-Upgrade-Pfad planen (51→52→...→57) statt Big-Bang-Sprung, mit `npm run verify` + Maestro-Smoke-Suite nach jedem Schritt.
- **Geschätztes Änderungsrisiko**: Hoch — volle SDK-Migration, nativer Rebuild und Regressionstests nötig; Projektplanungs-Entscheidung, keine automatisierbare Cleanup-Aktion.
- **Benötigte Tests**: Vollständiges `npm run verify` + `e2e:smoke` nach jedem SDK-Inkrement.
- **Sicher automatisch behebbar**: Nein

### [MAINT-13] Keine `console.log`-Debug-Leftovers gefunden — positiver Befund, aber verstreute `console.error`/`warn` bestätigen fehlenden zentralen Logger
- **Severity**: Low
- **Kategorie**: Logging
- **Datei/Zeile**: Repo-weit (keine spezifische Zeile)
- **Beschreibung**: Repo-weiter Grep nach `console.log` ergab null Treffer. Allerdings existieren 26 verstreute `console.error`/`console.warn`-Aufrufe mit Ad-hoc-String-Tags statt eines gemeinsamen strukturierten Loggers.
- **Mögliche Auswirkung**: Keine dringende Aktion nötig — nichts zu entfernen. Fehlender gemeinsamer Logger könnte künftig zu Namenskonventions-Drift führen.
- **Empfohlene Lösung**: Kein Cleanup in diesem Durchgang nötig. Bei künftiger Einführung eines zentralen Loggers das bereits im Worker genutzte `"event_name", {details}`-Muster als Konvention übernehmen.
- **Geschätztes Änderungsrisiko**: N/A — informativ, keine Änderung vorgeschlagen.
- **Benötigte Tests**: N/A.
- **Sicher automatisch behebbar**: N/A (keine Entfernung nötig)

---

## Empfohlene Priorisierung

1. **Sofort (Critical)**: A11Y-01 (Inventory-A11y), PERF-01 (Fetch-Fan-out-Limit), PERF-02 (Cron-Modul-Filterung) — reales Ausfallrisiko (Worker-Subrequest-Limit) bzw. Compliance-relevante Kernfunktion.
2. **Kurzfristig (High)**: DB-01 (Privacy-Export-Vollständigkeit — DSGVO-relevant), TS-01 (Evidence-Integrität bei Provider-Ausfällen), RN-01–04 (Hook-Lint, Safe-Area, Keyboard, ScoreRing-Performance), A11Y-02–07 (Farbe-als-einziger-Indikator an sechs Stellen), PERF-03 (Timeout-Lücke), MAINT-01 (Score-Tone-Inkonsistenz — echter, sichtbarer Bug), MAINT-12 (Dependency-Upgrade-Planung anstoßen).
3. **Mittelfristig (Medium)**: Die übrigen DB/API-Design-Lücken (Idempotenz, Kostenbremse, Pagination), Performance-Lücken (React-Query-Nutzung, Dashboard/Monitoring-Konsolidierung), Wartbarkeits-/Testbarkeitslücken (MAINT-02/03/04/06/08/09/10), restliche A11Y-Medium-Findings.
4. **Opportunistisch (Low)**: Konfigurations-Cleanup (ARCH-05/06/07), tote Exporte/Dateien (MAINT-05/11, RN-12), Index-Feinschliff (DB-11/13, PERF-08/09).

**Hinweis**: MAINT-08 (`eslint-config-expo`-Falle) sollte vor jedem generellen "ungenutzte Dependencies entfernen"-Durchgang beachtet werden, da eine naive Entfernung `npm run lint`/CI bricht.
