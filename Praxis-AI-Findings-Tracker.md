# Praxis-AI Audit – Laufender Findings-Tracker

Projekt: /Users/hussam.kwider/Documents/Praxis-AI (Expo/React Native + Supabase/Postgres + Hono/Cloudflare Worker)

Status: Phase 1-6 abgeschlossen. Phase 7 (Abschlussbericht) ausstehend.

## Findings-Log

| ID | Phase | Kategorie | Beschreibung | Fundstelle | Schweregrad | Status |
|---|---|---|---|---|---|---|
| F-001 | 1 | Architektur/Dependencies | Kern-Dependencies mehrere Major-Versionen veraltet: Expo 51→57, React Native 0.74→0.86, React 18→19, TypeScript 5.3→7.0, Expo Router 3.5→57.0 | package.json / npm outdated | Hoch | Offen |
| F-002 | 1 | Doku-Konsistenz | Architektur-Dokumentation an SecureStore, zentrale Worker-Pfade und den deaktivierten External-Check-Flow angeglichen | docs/ARCHITECTURE.md, lib/store/secureAuthStorage.ts | Mittel | Behoben |
| F-003 | 1 | Dead Code / Backend-Redundanz | Ungenutzte Supabase Edge Functions für AI-Reports und externe Checks vollständig entfernt; produktiver Backend-Pfad läuft ausschließlich über den Hono Worker | supabase/functions/, workers/hono/src/index.ts | Mittel | Behoben |
| F-004 | 1 | Dead Code | Ungenutzte Legacy-Kompatibilitätsrouten aus dem Hono Worker entfernt | workers/hono/src/index.ts | Niedrig-Mittel | Behoben |
| F-005 | 1 | Deployment/Doku-Lücke | Kein eas.json, keine EAS Build/Submit-Konfiguration im Repo gefunden – Mobile Release-Prozess außerhalb des Repos oder nicht vorhanden | app.json (einzige App-Config) | Info/Nachfragen | Offen |
| F-006 | 1 | Konfiguration | Kein versioniertes Environment→Supabase-Projekt Mapping; URLs/Keys kommen direkt aus process.env ohne zentrale Zuordnungstabelle | lib/config/environment.ts | Mittel | Offen |
| F-007 | 1 | API-Design | graphql_public in Supabase lokal exponiert, aber im gesamten App-/Worker-Code nirgends genutzt – unnötige Angriffsfläche | supabase/config.toml | Niedrig-Mittel | Offen |

| F-008 | 2 | Funktionalität / Datenintegrität | Externer Praxis-/Domain-Check wird im Check-Flow beworben, aber `runExternalCheck` wird nie aufgerufen — Reports zeigen immer `external: null` | app/(tabs)/check/index.tsx, lib/security/external.ts, app/(tabs)/report/index.tsx | Kritisch | Offen |
| F-009 | 2 | Datenintegrität / Vertrauenswürdigkeit | KI-Bericht fällt bei jedem Fehler automatisch auf einen hartcodierten `SAMPLE_REPORT` zurück; zusätzlich wird initial immer ein `SAMPLE_STORED_REPORT` angezeigt — Nutzer können reale von Demo-Berichten nicht unterscheiden | lib/ai/report.ts, lib/ai/sample-report.ts, lib/store/report.ts, app/(tabs)/report/index.tsx | Kritisch | Offen |
| F-010 | 2 | Datenpersistenz | Report Store ist reines In-Memory-Zustand, kein DB-Laden/Speichern im Client — Reports gehen nach App-Neustart verloren, Report-Detailseite ist nicht reload-sicher | lib/store/report.ts, app/(tabs)/report/[id].tsx | Hoch | Offen |
| F-011 | 2 | Datenpersistenz | Inventar (inkl. Firewall-Regeln) existiert nur im Zustand ohne Supabase/API-Persistenz | app/(tabs)/inventory/index.tsx, lib/store/inventory.ts | Hoch | Offen |
| F-012 | 2 | Sicherheit / Stub-Gefahr | Edge-Function mit hartcodiertem DMARC-Fake-Finding vollständig entfernt | supabase/functions/ | Hoch | Behoben |
| F-013 | 2 | Funktionalität | WLAN-Scan: erweiterte TCP/UDP/mDNS/SMB/SNMP/IPv6-Prüfungen hängen am nativen Modul; ohne dieses werden Ergebnisse `unavailable`, ohne dass das für Nutzer klar kommuniziert wird | lib/security/wlan.ts, lib/security/networkProbes.ts, components/modules/WlanScanner.tsx | Hoch | Offen |
| F-014 | 2 | Funktionalität | Monitoring-Ziele werden aus lokalem (nicht persistiertem) Inventar gespeist, obwohl Monitoring selbst echte Supabase-Daten nutzt — inkonsistente Datenbasis | lib/monitoring/service.ts, app/(tabs)/monitoring/index.tsx | Hoch | Offen |
| F-015 | 2 | UX / irreführende UI | Mehrere Buttons ohne echte Funktion: "Bericht exportieren" im Monitoring navigiert nur zur Report-Seite; "Bericht erzeugen" nach WLAN-Scan prüft nichts und startet keine Erzeugung | app/(tabs)/monitoring/index.tsx, app/(tabs)/check/wlan-scan.tsx | Mittel | Offen |
| F-016 | 2 | Funktionalität | Alert-Quittierung: Worker-Endpunkt `/api/alert/acknowledge` existiert, wird aber von der App nie aufgerufen — Alert-Detail bietet nur "Zurück" | workers/hono/src/index.ts, app/(modal)/alert-detail.tsx | Mittel | Offen |
| F-017 | 2 | Unvollständiges Feature | Action Guide Modal ist reine Dummy-Seite ohne Rollenlogik oder Inhalte | app/(modal)/action-guide.tsx | Mittel | Offen |
| F-018 | 2 | Fehlerbehandlung | Onboarding: AVV/Legal-Sync zum Worker schlägt non-blocking fehl (nur `console.warn`) — Nutzer merkt nichts von einem fehlgeschlagenen rechtlich relevanten Sync | app/(auth)/onboarding/index.tsx | Mittel | Offen |
| F-019 | 2 | Feature-Lücke | Push-Notifications: nur lokale Notifications bei Realtime-Events implementiert, kein Push-Token-Registration-/Backend-Pfad erkennbar | lib/monitoring/notifications.ts | Mittel | Offen |
| F-020 | 2 | Persistenz | MMKV-Storage-Helper existiert, wird aber von Inventar/Report (den Stores, die Persistenz bräuchten) nicht genutzt | lib/store/storage.ts, lib/store/inventory.ts | Mittel | Offen |
| F-021 | 2 | Positiv-Befund | Demo-Modus (Demo-Praxis, Demo-Monitoring) ist klar über Banner gekennzeichnet und sauber von echten Daten getrennt | lib/demo/demo-data.ts, components/ui/DemoBanner.tsx | Niedrig (kein Fix nötig, sofern Kennzeichnung bleibt) | OK |

| F-022 | 3 | Sicherheit / Broken Authorization | `/api/monitoring/run` kann OHNE `practiceId` komplett unauthentifiziert Provider-Checks auslösen — Auth und Quota greifen dann gar nicht | workers/hono/src/index.ts:1793 | Kritisch | Offen |
| F-023 | 3 | Sicherheit / Broken Authorization | Mehrere mutierende/sensible Endpunkte ohne Mindestrollen-Prüfung: `privacy/delete`, `report/generate`, `check/external`, `alert/acknowledge`, `legal/consent`, `legal/avv/accept` — jede vorhandene Practice-Rolle (auch `viewer`) reicht aus | workers/hono/src/index.ts (requirePracticeAccess, privacy_delete) | Kritisch | Offen |
| F-024 | 3 | Datenkonsistenz / Fehlerbehandlung | Consent-API/DB-Mismatch: Frontend sendet `wlan_audit_scan`/`wlan_ipv6_reachability_scan`, DB-Constraint erlaubt nur 4 andere Werte → führt zu 500 statt sauberem 400 | components/modules/WlanScanner.tsx:415, supabase/migrations/20260625120000_launch_hardening.sql:5 | Hoch | Offen |
| F-025 | 3 | Robustheit | Kein Timeout/AbortController für externe Provider- und LLM-Aufrufe (Anthropic, Supabase, Resend, SSL Labs, Shodan etc.) — Risiko hängender Requests und Worker-Limit-Verletzungen | workers/hono/src/index.ts (Anthropic-Fetch, Supabase REST) | Hoch | Offen |
| F-026 | 3 | Datenmodell-Lücke | Kein DB-Datenmodell für Inventar/Monitoring-Ziele/Firewall-Regeln, obwohl Frontend/Scan-Logik sie nutzt (Bezug zu F-011, F-014) | lib/store/inventory.ts, app/(tabs)/monitoring/index.tsx | Hoch | Offen |
| F-027 | 3 | Backend/Frontend-Lücke | Report-Persistenz halb fertig: Worker schreibt `reports`, aber es fehlen `GET /api/reports` und `GET /api/reports/:id` — Frontend kann Reports nie per ID laden (Bezug zu F-010) | workers/hono/src/index.ts (persistReport), app/(tabs)/report/[id].tsx | Hoch | Offen |
| F-028 | 3 | Deployment-Risiko | Versionierte `service_role`-Grants decken nicht alle Tabellen ab, in die der Worker tatsächlich schreibt (reports, monitoring_snapshots, monitoring_events, consent_log, data_processing_agreements, deletion_requests, email_outbox) — kann Produktiv-Deployment brechen | supabase/migrations/20260714173000_worker_service_role_table_grants.sql | Hoch | Offen |
| F-029 | 3 | API-Konsistenz | Uneinheitliche Response-/Fehlerformate (teils `{error}`, teils `{error,message}`, teils kein Envelope, PDF als Binary); keine API-Versionierung | workers/hono/src/index.ts (dashboard, requirePracticeAccess) | Mittel | Offen |
| F-030 | 3 | Dead Code / Angriffsfläche | Überlappende Legacy-Endpunkte vollständig entfernt; nur die autorisierten kanonischen Worker-Endpunkte bleiben bestehen | workers/hono/src/index.ts | Mittel | Behoben |
| F-031 | 3 | Datenschutz-Lücke | Privacy-Delete anonymisiert Kernobjekte, lässt aber `monitoring_events`/`monitoring_snapshots` unangetastet, obwohl Privacy-Export diese als personenbezogenen Kontext mit ausliefert | workers/hono/src/index.ts (privacy_delete, privacy_export) | Mittel | Offen |
| F-032 | 3 | Performance | Fehlender zusammengesetzter Index `(practice_id, type, completed_at desc)` auf `security_checks` für Dashboard-Query | workers/hono/src/index.ts:867, initial_schema.sql:147 | Mittel | Offen |
| F-033 | 3 | Datenmodell | `deletion_requests.practice_id` initial ohne Foreign Key angelegt | supabase/migrations/20260624150000_initial_schema.sql:122 | Niedrig-Mittel | Offen |
| F-034 | 3 | Ungenutzte Struktur | `partner_plan_pricing`, `white_label_partners`, `partner_practices` sind Scaffold-Tabellen, im Frontend kaum/nicht produktiv genutzt | supabase/migrations | Niedrig | Offen |
| F-035 | 3 | Bestätigung von F-003/F-012 | Fake-Stub und parallele Edge-Function entfernt | supabase/functions/ | Bezug F-003/F-012 | Behoben |

| F-036 | 4 | Sicherheit / Broken Authorization (vertieft F-023) | `privacy/delete` ohne Mindestrolle löscht WLAN-Scans und anonymisiert Praxis/Checks/Reports — jede Practice-Rolle inkl. `viewer` kann irreversible Datenlöschung auslösen | workers/hono/src/index.ts:1911,1935,1939,1948,1956 | Kritisch | Offen |
| F-037 | 4 | Sicherheit / Broken Authorization (vertieft F-023) | `privacy/export` ohne Mindestrolle liefert vollständigen Datensatz (Praxis, Checks, Reports, Events, Consent-Log) an jede Rolle | workers/hono/src/index.ts:1994,1997-2019 | Hoch | Offen |
| F-038 | 4 | Sicherheit / Broken Authorization (bestätigt F-022) | `/api/monitoring/run` läuft ohne `practiceId` mit `access = null` weiter — unauthentifizierter Kosten-/Enumerationspfad auf externe Provider-Checks | workers/hono/src/index.ts:1793,1816-1818 | Hoch | Offen |
| F-039 | 4 | Sicherheit / Broken Authorization (vertieft F-023) | Kostenpflichtige Aktionen (external check, report generate) verlangen nur allgemeinen Praxiszugriff statt `manager`-Rolle — Rollenprüfung greift nur, wenn `requiredRole` explizit gesetzt ist | workers/hono/src/index.ts:783,1042,1288-1299 | Hoch | Offen |
| F-040 | 4 | Sicherheit / CORS | Worker erlaubt global alle Origins (`origin: "*"`), auch vermutlich in Produktion | workers/hono/src/index.ts:396 | Mittel | Offen |
| F-041 | 4 | Sicherheit / HTTPS-Erzwingung | API-Base fällt auf `http://localhost:8787` zurück; Produktions-Validierung prüft nur Supabase-Werte, nicht ob API-Base tatsächlich `https://` ist | lib/config/environment.ts:15,18, .env.example:3 | Mittel | Offen |
| F-042 | 4 | Integrität | Alert-Acknowledge ohne Mindestrollen-Check setzt `resolved_at` (Bezug F-016) | workers/hono/src/index.ts:1889,1893-1896 | Mittel | Offen |
| F-043 | 4 | Performance | Monitoring kann bis zu 25 Domains parallel prüfen, je 7 Checks parallel via Promise.all — hohes Risiko für Provider-Rate-Limits/Timeouts unter Last | workers/hono/src/index.ts:2386,1742-1752,1816-1818 | Hoch | Offen |
| F-044 | 4 | Performance | Dashboard-Endpoint führt pro Aufruf 6 Supabase-REST-Abfragen aus; React Query ist als Provider eingerichtet, wird aber im App-Code nicht für Caching/Retry genutzt (Bezug F-Stack-Query aus Phase 1) | workers/hono/src/index.ts:865, app/(tabs)/dashboard/index.tsx:29, app/_layout.tsx:13 | Mittel | Offen |
| F-045 | 4 | Performance / Robustheit | Kein AbortController/Timeout für Anthropic-, Supabase- und Security-Provider-Fetches im Worker (bestätigt F-025) | workers/hono/src/index.ts:1203,2611,2696,2936 | Mittel | Offen |
| F-046 | 4 | Performance / DB | Fehlender Composite-Index (practice_id, type, completed_at desc) auf security_checks für Dashboard-Query (bestätigt F-032) | workers/hono/src/index.ts:869, initial_schema.sql:147 | Mittel | Offen |
| F-047 | 4 | Performance / Client | Monitoring lädt 3 Supabase-Queries parallel direkt im Client statt aggregiert über Worker/Cache; zusätzlich Realtime-Subscription | lib/monitoring/service.ts:51,99-118 | Mittel | Offen |
| F-048 | 4 | Rendering | Inventar-Liste und Screen-Wrapper nutzen ScrollView/`.map()` ohne Virtualisierung — Performance-Risiko bei wachsenden Listen | components/ui/Screen.tsx:19, app/(tabs)/inventory/index.tsx:515 | Mittel | Offen |
| F-049 | 4 | Positiv-Befund / Secrets | .env korrekt in .gitignore, Secret-Exposure-Tests blockieren privilegierte EXPO_PUBLIC_*-Namen | .gitignore:6, security/__tests__/secret-exposure.test.ts:45 | Niedrig (OK) | OK |
| F-050 | 4 | Positiv-Befund / Injection | Keine SQL/NoSQL-Injection-Schwachstelle gefunden — UUID-Prüfungen und encodeURIComponent korrekt eingesetzt | workers/hono/src/index.ts:1263,1471 | — | OK |
| F-051 | 4 | Positiv-Befund / XSS | Kein WebView/dangerouslySetInnerHTML im App-Code; PDF-HTML-Generator escaped dynamische Inhalte | lib/ai/report-pdf.ts:295 | — | OK |
| F-052 | 4 | Positiv-Befund / CSRF | Bearer-Token-Auth statt Cookie-Session — kein CSRF-Risiko im geprüften Scope | lib/api/client.ts:16 | — | OK |
| F-053 | 4 | Positiv-Befund / Passwörter | Passwortspeicherung läuft vollständig über Supabase Auth, kein eigenes Hashing im Repo | app/(auth)/login.tsx:42 | — | OK |

| F-054 | 5 | Fehlendes Kernfeature | Kein "Passwort vergessen"-Flow im Auth-UI vorhanden | Auth-Screens | Hoch | Offen |
| F-055 | 5 | Fehlendes Kernfeature | Keine UI für Profil bearbeiten, Einstellungen oder Logout im gesamten App-Code erkennbar — Nutzer kann sich nicht aktiv abmelden | app-weite Suche, app/(tabs)/_layout.tsx, lib/store/session.ts | Hoch | Offen |
| F-056 | 5 | UX-Bestätigung von F-009 | Aus Nutzersicht bestätigt: KI-Bericht wirkt bei Fehler-Fallback auf Musterbericht wie ein echter Bericht — größtes UX-Vertrauensrisiko der App laut Tester | Bericht-Flow | Kritisch | Offen |
| F-057 | 5 | UX-Bestätigung von F-008 | Startscreen kündigt "3. Externer Check" im Check-Flow an, dieser wird im geführten Flow aber nie sichtbar ausgeführt | Check-Flow-Screens | Hoch | Offen |
| F-058 | 5 | Accessibility | Viele Pressable-Controls ohne accessibilityRole/Label; AnimatedButton setzt nur accessibilityState | components/ui/AnimatedButton.tsx:30 | Hoch | Offen |
| F-059 | 5 | UI / Layout-Risiko | Onboarding nicht scrollbar (scroll=false) mit fixen Elementen — Abschneide-Risiko bei kleinen Displays/Dynamic Type/langen Fehlermeldungen | app/(auth)/onboarding/index.tsx:63,332 | Hoch | Offen |
| F-060 | 5 | Design / Kontrast | Primärbutton-Kontrast ca. 3.71:1 — unter WCAG AA für normalen Text | components/ui/AnimatedButton.tsx:60,79, constants/colors.ts:36 | Mittel | Offen |
| F-061 | 5 | Responsive Design | Kein Tablet-/Desktop-Breakpoint-Handling, kein maxWidth — reines Mobile-first ohne Anpassung | components/ui/Screen.tsx:13,37 | Mittel | Offen |
| F-062 | 5 | Formvalidierung | Registrierung ohne Passwortbestätigung und ohne sichtbare Passwortanforderungen außer Länge | Auth-Screens | Mittel | Offen |
| F-063 | 5 | Formvalidierung | Inventar/Monitoring-Ziele: MAC/BSSID/Datum/E-Mail/Domain-Formate und lange Strings nicht sauber validiert | Inventar-/Monitoring-Screens | Mittel | Offen |
| F-064 | 5 | UX / fehlendes Feedback | Fragebogen kann mit leeren Antworten abgeschlossen werden, keine Fortschrittsanzeige "x/y beantwortet" | Fragebogen-Screen | Mittel | Offen |
| F-065 | 5 | UX / fehlende Funktion | Keine Suche in Inventar, Warnungen oder Berichten — nur Filter-Chips | app-weite Prüfung | Niedrig | Offen |
| F-066 | 5 | UX | Dashboard-Error-State ohne Retry-Button | Dashboard-Screen | Mittel | Offen |
| F-067 | 5 | UX | PDF-Export zeigt nur lokalen Pfad per Alert, kein Share-Flow — auf Mobile wenig handlungsfähig | Report-Screen | Mittel | Offen |
| F-068 | 5 | Positiv-Befund | Klickwege der Kernfunktionen sind kurz (Registrierung bis Dashboard 5-6 Schritte, Fragebogen bis WLAN ca. 2, WLAN bis Bericht ca. 2) | — | — | OK |

| F-069 | 6 | CI / Release-Gate defekt | `npm run lint` schlägt aktuell fehl trotz `--max-warnings=0` als CI-Gate — Release-Prozess ist faktisch nicht funktionsfähig, solange das nicht behoben ist | package.json:11, onboarding/index.tsx:248, lib/security/wlan.ts:559,1489, dashboard.test.tsx:179 | Kritisch | Offen |
| F-070 | 6 | CI / Tests nicht grün | `npm test` ergibt 1 Failed von 13 Tests — Typecheck ist grün, aber Testlauf blockiert sauberes Release-Gate | CI-Testlauf | Hoch | Offen |
| F-071 | 6 | Sicherheit / Logging (bestätigt Muster aus Phase 4) | Secret-Exposure-Test schlägt zurecht an: rohes `error`-Objekt wird im Worker geloggt, potenziell mit sensiblen Request-/Token-Daten | security/__tests__/secret-exposure.test.ts:116, workers/hono/src/index.ts:1293 | Hoch | Offen |
| F-072 | 6 | CI / Testabdeckung unwirksam | RLS-Integrationstest verlangt 6 Env-Variablen, CI übergibt nur 3 Supabase-Secrets — RLS-Tests laufen in CI vermutlich gar nicht wirksam durch, obwohl RLS für Tenant-Trennung sicherheitskritisch ist | supabase/__tests__/rls.test.ts:10, .github/workflows/ci.yml:31 | Hoch | Offen |
| F-073 | 6 | Testabdeckung | Keine E2E-/Flow-Tests (Detox/Playwright) für kritische Screen-Flows: Login, Registrierung, Onboarding, Fragebogen, WLAN-Sync-Fehler, Report-Generierung | package.json:13 | Hoch | Offen |
| F-074 | 6 | Architektur / Code-Duplikation | Parallele AI-Report-Edge-Function entfernt; Prompt-, Anthropic- und Parsing-Logik liegt nur noch im Hono Worker | workers/hono/src/index.ts | Hoch | Behoben |
| F-075 | 6 | Architektur | Worker bündelt Routing, Auth, Quotas, AI, PDF, Privacy, Monitoring, Provider-Checks und Supabase-REST in einer einzigen großen Datei | workers/hono/src/index.ts:396,767,1198,2602 | Mittel | Offen |
| F-076 | 6 | Deaktiviertes Feature | `DomainCheck` und `runExternalCheck` bleiben bewusst als getestete Ergebnis-UI und Service für die spätere Reaktivierung erhalten; der Check-Flow ist bis zu Provider-Timeouts zentral deaktiviert und als „In Vorbereitung“ gekennzeichnet | components/modules/DomainCheck.tsx, lib/security/external.ts, lib/config/environment.ts | Mittel | Akzeptiert / deaktiviert |
| F-077 | 6 | Architektur / Inkonsistenz (bestätigt F-020/F-044) | React Query global bereitgestellt, aber ungenutzt für produktive Loads (manuelles useEffect/State); MMKV-Helper existiert, Auth nutzt aber SecureStore | app/_layout.tsx:3, lib/store/storage.ts:12, package.json:51 | Mittel | Offen |
| F-078 | 6 | Betrieb / Observability | Kein zentraler Logger/Crash-Reporting; nur verstreute console.error/warn; @opentelemetry/api als ungenutzte Dependency | components/modules/WlanScanner.tsx:168, app/(auth)/onboarding/index.tsx:285, workers/hono/src/index.ts:1573, package.json:23 | Mittel | Offen |
| F-079 | 6 | Fehlerbehandlung | Inkonsistente Fehlerbehandlung: manche Pfade zeigen UI-Fehler+Retry, andere schlucken Fehler komplett im catch-Block | components/modules/WlanScanner.tsx:174, app/(tabs)/monitoring/index.tsx:180 | Mittel | Offen |
| F-080 | 6 | Observability-Lücke | Audit-Logging für Praxiszugriffe vorhanden, aber kein Runtime-Monitoring für Latenzen, Fehlerraten, Provider-Ausfälle oder Worker-Exceptions | workers/hono/src/index.ts:1530 | Mittel | Offen |
| F-081 | 6 | Betrieb | Service-Fehler (supabaseRest) werfen nur Status ohne Body/Request-ID — sicher, aber erschwert Debugging im Betrieb | workers/hono/src/index.ts:2622 | Niedrig-Mittel | Offen |
| F-082 | 6 | Zukünftiges Risiko (kein akuter Fund) | Billing/Payments nur als statische Plan-Definitionen vorhanden, keine Checkout-/Webhook-Integration — bei Einführung müssen Webhook-Signatur, Quota-Transitions und Idempotenz separat getestet werden | lib/billing/plans.ts:19 | Info | Offen (zukünftig) |

## Offene Fragen (noch nicht final geklärt)

- Bewusste Entscheidung nötig: Supabase Edge Functions + Legacy-Routen löschen oder dokumentiert als Fallback behalten?
- graphql_public bewusst deaktivieren, falls nicht gebraucht?

## Nächste Schritte

- Phase 2 (Feature- & Datenanalyse) ausstehend
- Phase 3 (API/DB) ausstehend
- Phase 4 (Security/Performance) ausstehend
- Phase 5 (UI/UX/Funktionstests) ausstehend
- Phase 6 (Code/Tests/Logging) ausstehend
- Phase 7 (Abschlussbericht) ausstehend
