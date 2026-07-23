# PraxisShield AI — Umsetzungsplan in Phasen

Basiert auf `docs/reviews/03-full-code-review.md` (84 Findings, 8 Review-Bereiche). Dieses Dokument gliedert alle Findings in 8 sequenzielle Phasen und liefert für jede Phase einen eigenständigen, direkt einsetzbaren Prompt (für eine neue Claude-Code-Session, einen Entwickler oder einen Implementierungs-Agenten).

**Reihenfolge-Logik**: Phase 1 zuerst (Produktionsrisiko + Compliance), dann High-Severity-Cluster nach Themengebiet, dann Medium/Low nach Abhängigkeit (z. B. Dependency-Falle MAINT-08 vor jeder generellen Dependency-Bereinigung). Jede Phase ist so geschnitten, dass sie unabhängig review- und mergebar ist.

| Phase | Titel | Findings | Schwerpunkt-Severity |
|---|---|---|---|
| 1 | Kritische Stabilitäts- und Compliance-Risiken | PERF-01, PERF-02, A11Y-01 | Critical |
| 2 | Evidence-Integrität & Datenschutz-Vollständigkeit | TS-01, DB-01, SEC-02 | High |
| 3 | Mobile Grundlagen & Render-Performance | RN-01–04 | High |
| 4 | Accessibility (gesamt, ohne A11Y-01) | A11Y-02–13 | High/Medium/Low |
| 5 | Sicherheitshärtung & API-Robustheit | SEC-01/03/04/05/06, DB-02–13, TS-02, PERF-03 | Medium |
| 6 | Performance-Feinschliff | PERF-04–13 | Medium/Low |
| 7 | Wartbarkeit, Dead Code, Duplikate, Testbarkeit | RN-05–13, MAINT-01/02/03/04/05/09/10/11, TS-03/04/05, ARCH-04/08 | Medium/Low |
| 8 | Dependency- & Konfigurationsmanagement | ARCH-01/02/03/05/06/07, MAINT-06/07/08/12 | Medium/Low |

Nicht in einer Phase (kein Handlungsbedarf): **MAINT-13** — rein informativer Befund ("kein `console.log` gefunden"), keine Umsetzung nötig.

---

## Phase 1 — Kritische Stabilitäts- und Compliance-Risiken

**Warum zuerst**: PERF-01/02 sind ein reales Produktionsrisiko (Cloudflare-Worker-Subrequest-Limit kann überschritten werden, Provider-Rate-Limit-Bans drohen). A11Y-01 blockiert einen Kern-Compliance-Workflow (Inventarverwaltung) für Screenreader-Nutzer komplett.

### Prompt

```
Du arbeitest am Repository PraxisShield AI (Expo/React Native + Cloudflare Worker/Hono + Supabase, siehe CLAUDE.md für Architektur- und Sicherheitsvorgaben). Lies CLAUDE.md vollständig, bevor du beginnst.

AUFGABE: Behebe die folgenden 3 CRITICAL-Findings aus docs/reviews/03-full-code-review.md. Lies den vollständigen Abschnitt zu jedem Finding im Review-Dokument (Beschreibung, Auswirkung, empfohlene Lösung, benötigte Tests), bevor du Code änderst.

1. [PERF-01] workers/hono/src/index.ts — performExternalCheck() fächert für einen einzelnen Domain-Check in ~150-160 Outbound-Fetches auf (checkEmailSecurity mit 11 parallelen DKIM-Selektoren, discoverCommonDnsSubdomains mit 30 Fetches, evaluateSubdomain für bis zu 12 Subdomains mit je 8 Fetches). Deckle die Subdomain-Discovery/-Evaluation auf 3-5 statt 12 Subdomains, nutze die bereits vorhandene mapInBatches-Bündelung konsequent für findDkim und evaluateSubdomain. Bewahre die Evidence-Coverage-Semantik: nicht geprüfte Subdomains müssen weiterhin als "not_checked", nicht als "passed", markiert werden.

2. [PERF-02] workers/hono/src/index.ts — runScheduledMonitoring() ruft bei JEDEM Cron-Trigger (5 Kadenzen, 10 Trigger-Zeiten/Tag) die VOLLE performExternalCheck-Kette auf, statt nur die zum jeweiligen Cron-Modul (MONITORING_SCHEDULE/CRON_MODULES) gehörenden Provider-Checks auszuführen. Erweitere performExternalCheck um einen modules-Parameter und überspringe Provider-Calls außerhalb des aktuellen Cron-Modul-Sets. Achte darauf, dass buildMonitoringComparison und das Snapshot-Schema mit partiellen Check-Daten (nicht alle 7 Checks vorhanden) weiterhin korrekt funktionieren.

3. [A11Y-01] app/(tabs)/inventory/index.tsx — durchgängig fehlende Accessibility-Semantik: drei Icon-only-Löschbuttons (Zeile ~553, 592, 627) ohne accessibilityLabel; Segmented-Picker/FilterChip/ConfigToggle ohne accessibilityRole/accessibilityState; 13 TextInput-Felder ohne accessibilityLabel (verlassen sich nur auf placeholder). Ergänze:
   - accessibilityRole="button" + sprechendes accessibilityLabel (z. B. "Gerät entfernen: {hostname}") an allen Lösch-Buttons
   - accessibilityRole + accessibilityState={{selected}} an allen Segmented-Options/Chips/Toggles
   - explizite accessibilityLabel an allen 13 TextInput-Feldern, die den sichtbaren Feldnamen spiegeln

VALIDIERUNG:
- Für PERF-01/02: Erweitere/ergänze Tests in workers/hono/__tests__/external-check.test.ts mit einem gemockten fetch-Zähler, der eine begrenzte Fetch-Anzahl pro performExternalCheck-Aufruf verifiziert, sowie einen Test, der belegt, dass ein Cron-Trigger nur die zu seinem Modul gehörenden Provider-Funktionen aufruft.
- Für A11Y-01: Manueller VoiceOver/TalkBack-Pass durch den kompletten Inventory-Flow (Gerät hinzufügen, Access Point hinzufügen, löschen, Router-Konfiguration togglen).
- Führe npm run verify (lint + typecheck + test) und npm run test:worker aus. Beide müssen grün sein.

OUT OF SCOPE: Alle anderen Findings aus dem Review-Dokument. Keine Refactorings über das zur Behebung dieser 3 Findings Nötige hinaus. Keine Änderungen an der Cron-Zeitplan-Konfiguration selbst (MONITORING_SCHEDULE-Werte bleiben unverändert), nur an der Ausführungslogik.

DEFINITION OF DONE: Alle 3 Findings behoben, npm run verify grün, npm run test:worker grün, neue/erweiterte Tests wie oben beschrieben vorhanden, manueller A11y-Pass für Inventory dokumentiert.
```

---

## Phase 2 — Evidence-Integrität & Datenschutz-Vollständigkeit

**Warum als nächstes**: Diese drei High-Findings betreffen die Vertrauenswürdigkeit der Sicherheitsbewertung selbst (TS-01) und DSGVO-Kernpflichten (DB-01, SEC-02) — inhaltlich zusammengehörig, weil alle drei den "Evidence"/"Consent"-Vertrauensvertrag mit dem Nutzer berühren, den CLAUDE.md als nicht verhandelbar markiert.

### Prompt

```
Du arbeitest am Repository PraxisShield AI. Lies CLAUDE.md, insbesondere den Abschnitt "Scoring & evidence model" und "Security constraints (non-negotiable)".

AUFGABE: Behebe die folgenden 3 HIGH-Findings aus docs/reviews/03-full-code-review.md. Lies jeden vollständigen Finding-Eintrag vor der Umsetzung.

1. [TS-01] workers/hono/src/index.ts — In checkPorts (Shodan, ~L3063-3065), checkVirusTotal (~L3210-3212), checkSecurityTrailsHistory (~L3261), discoverSecurityTrailsSubdomains (~L3317), checkLeaks/HIBP (~L3146-3164), queryDns/Cloudflare (~L3378) wird eine Non-2xx-HTTP-Antwort (!response.ok) fälschlich wie ein "sauber geprüft, nichts gefunden"-Ergebnis behandelt statt den Provider als "unavailable" zu markieren. Rufe in jeder dieser Funktionen markProviderUnavailable(context, "<provider>", new Error("http_" + response.status)) auf, BEVOR bei !response.ok das Default-/Leer-Ergebnis zurückgegeben wird. Ausnahme: HIBPs 404 bleibt "kein Breach gefunden" (legitimer Erfolgsfall), nicht "unavailable" — alle anderen Non-2xx-Codes (401, 429, 5xx) müssen als unavailable gelten.

2. [DB-01] workers/hono/src/index.ts — handlePrivacyExport (~L2161-2200) liefert einen unvollständigen DSGVO-Art.-15/20-Export: wlan_scans, monitoring_snapshots und data_processing_agreements fehlen, obwohl complete_privacy_deletion genau diese Tabellen bei Löschung erfasst. Ergänze wlan_scans und monitoring_snapshots (praxis-gefiltert) als zusätzliche Felder im Export-Payload; prüfe, ob data_processing_agreements ebenfalls ergänzt werden sollte.

3. [SEC-02] lib/security/external.ts (~L158-167) und workers/hono/src/index.ts handleExternalCheck (~L843-892) — der HIBP-E-Mail-Leak-Check hängt an einem generischen consent-Flag für den GESAMTEN External Check statt an einem eigenen, HIBP-spezifischen Consent wie handleMonitoringRun es korrekt mit leakConsentAccepted umsetzt. lib/security/external.ts sendet zudem hartcodiert consent: true. Erweitere /api/check/external um ein eigenes leakConsentAccepted-Feld analog zu handleMonitoringRun; rufe checkLeaks() nur bei explizitem Flag auf; entferne das hartcodierte consent: true im Client. Beachte: Dieser Flow ist aktuell über TODO(external-check) in app/(tabs)/report/index.tsx:51 deaktiviert — die Worker-/Client-API-Änderung soll trotzdem korrekt sein, bevor der Flow reaktiviert wird.

VALIDIERUNG:
- TS-01: Unit-Tests in workers/hono/__tests__/external-check.test.ts, die für HTTP 401/429/500 von jedem betroffenen Provider provider_statuses.<provider> === "unavailable" und ein "unavailable-<provider>"-Finding statt eines leeren Ergebnisses erwarten.
- DB-01: Integrationstest für /api/privacy/export, der prüft, dass alle von complete_privacy_deletion betroffenen Tabellen auch im Export-Payload vorkommen.
- SEC-02: Worker-Test, der belegt, dass checkLeaks()/HIBP nur bei explizitem leakConsentAccepted-Flag aufgerufen wird, auch wenn eine E-Mail übergeben wurde.
- npm run test:worker und npm run verify müssen grün sein.

OUT OF SCOPE: Reaktivierung des external-check-Flows selbst (bleibt hinter dem bestehenden TODO deaktiviert). Alle anderen Findings.

DEFINITION OF DONE: Alle 3 Findings behoben, neue Tests vorhanden und grün, npm run verify grün.
```

---

## Phase 3 — Mobile Grundlagen & Render-Performance

**Warum als nächstes**: Vier High-Findings, die die Grundqualität jedes Mobile-Screens betreffen (Lint-Tooling, Safe-Area, Keyboard-Verhalten, Animation) — technische Basis, auf der viele spätere UI-Phasen aufbauen.

### Prompt

```
Du arbeitest am Repository PraxisShield AI (Expo/React Native, Expo Router, Reanimated, Zustand). Lies CLAUDE.md, Abschnitt "Directory map" und "Mobile app (Expo Router, app/)".

AUFGABE: Behebe die folgenden 4 HIGH-Findings aus docs/reviews/03-full-code-review.md.

1. [RN-01] eslint.config.mjs — kein eslint-plugin-react-hooks, kein eslint-plugin-jsx-a11y konfiguriert. Ergänze beide Plugins (rules-of-hooks: error, exhaustive-deps: warn oder error; jsx-a11y mit sinnvollem Regelsatz für React Native). Triagiere danach ALLE neu aufgedeckten Lint-Warnungen/-Fehler im gesamten Repo (erwarte mehrere, u. a. durch RN-04/RN-06 aus diesem Review bereits bekannte Fälle) — behebe sie oder committe begründete, gezielte eslint-disable-Kommentare, bis npm run lint wieder mit --max-warnings=0 grün ist.

2. [RN-02] components/ui/Screen.tsx (~L13, 37-42) — hartcodiertes paddingTop: 68 / paddingBottom: 36 statt useSafeAreaInsets() aus react-native-safe-area-context (bereits installiert, SafeAreaProvider bereits in app/_layout.tsx eingebunden). Nutze useSafeAreaInsets() in Screen und kombiniere mit sinnvollem Basis-Padding statt der fixen Konstante. Screen wird von praktisch jedem Screen der App genutzt — visuelle Prüfung auf mind. einem Notch-Gerät und einem Nicht-Notch-Gerät danach zwingend.

3. [RN-03] Kein KeyboardAvoidingView irgendwo im Repo. Betroffen v. a.: app/(auth)/login.tsx, app/(auth)/onboarding/index.tsx, app/(tabs)/inventory/index.tsx (3 Formularblöcke mit je 5+ gestapelten TextInput), app/(tabs)/monitoring/index.tsx (TargetInput). Wrappe den Content-Bereich in Screen (oder die einzelnen Formular-Screens) in KeyboardAvoidingView (behavior="padding" auf iOS). Manuelle QA auf iOS UND Android für jeden betroffenen Formular-Screen danach zwingend.

4. [RN-04] components/ui/ScoreRing.tsx (~L24-50) — die Score-Zahl wird über einen manuellen setInterval (16ms) + setState animiert statt über den bereits vorhandenen Reanimated Shared Value (progress), der den Ring animiert. Ersetze den setInterval-Loop durch useAnimatedReaction/useDerivedValue auf dem bestehenden progress-Wert. Korrigiere dabei auch das unvollständige Dependency-Array (fehlendes displayScore in [clampedScore]). ScoreRing wird auf Dashboard, Monitoring-Hero und WLAN-Scan-Ergebnis gemountet — visuelle Prüfung der Count-up-Animation an allen drei Stellen danach.

VALIDIERUNG:
- npm run lint (muss mit --max-warnings=0 grün sein, inkl. neuer react-hooks/jsx-a11y-Regeln)
- npm run typecheck
- Bestehende RTL-Snapshot-Tests (u. a. app/(tabs)/dashboard/__tests__/dashboard.test.tsx) müssen weiter bestehen
- Manuelle QA wie oben pro Finding beschrieben

OUT OF SCOPE: Migration zu React Testing Library (nur falls durch RN-01-Lint-Fixes zufällig berührt, sonst separater Scope). Andere Screens/Komponenten als die vier genannten Findings.

DEFINITION OF DONE: Alle 4 Findings behoben, npm run verify grün, manuelle QA-Ergebnisse dokumentiert (welche Geräte/Plattformen getestet wurden).
```

---

## Phase 4 — Accessibility (gesamt, ohne A11Y-01)

**Warum als eigene Phase**: 12 zusammengehörige A11y-Findings (6× High, 3× Medium, 3× Low), die alle dasselbe Grundmuster betreffen (Farbe/Geste als einziger Indikator, fehlende Textäquivalente). Gemeinsam als Accessibility-Sprint sinnvoller als über mehrere Phasen verteilt.

### Prompt

```
Du arbeitest am Repository PraxisShield AI (Expo/React Native). Ziel: WCAG 2.2 AA-Konformität für alle in docs/reviews/03-full-code-review.md, Abschnitt 6 "Accessibility", gelisteten Findings (A11Y-02 bis A11Y-13, A11Y-01 ist bereits in Phase 1 behoben). Orientiere dich am bereits vorhandenen guten Pattern in app/(tabs)/check/questionnaire.tsx und components/modules/WlanScanner.tsx (Consent-Checkboxen) — dort ist accessibilityRole/Label/Hint/State bereits konsistent gesetzt.

AUFGABE: Behebe der Reihe nach (High zuerst):

HIGH:
1. [A11Y-02] components/ui/Ampel.tsx (~L20-59) — Status nur über Farbe. Ergänze accessible accessibilityRole="text" mit accessibilityLabel wie "Status: Sicher (grün)".
2. [A11Y-03] components/charts/BarChart.tsx (~L19-41) — Kategorie-Scores nur über Balkenbreite, showValues defaultet auf false und wird an beiden Call-Sites (app/(tabs)/monitoring/index.tsx:277, app/(tabs)/report/[id].tsx:136) nicht gesetzt. Ergänze accessibilityLabel pro Zeile unabhängig vom showValues-Flag.
3. [A11Y-04] components/charts/RadarChart.tsx (~L17-61) und components/charts/ScoreHistory.tsx (~L20-73) — SVG-Text ist für Screenreader unsichtbar. Ergänze berechnetes accessibilityLabel auf der umschließenden Karte (Radar: alle Kategorie-Werte; ScoreHistory: Trend-Zusammenfassung), markiere das Svg-Element mit importantForAccessibility="no-hide-descendants".
4. [A11Y-05] components/ui/VulnerabilityCard.tsx (~L64-97) — Swipe-only "Bestätigen"-Geste ohne Alternative (WCAG 2.5.1). Ergänze eine explizite "Bestätigen"-Pressable mit accessibilityRole="button" zusätzlich zur Swipe-Geste.
5. [A11Y-06] components/modules/DomainCheck.tsx (~L35-42) — Status nur über Farbpunkt. Ergänze Statuswort neben dem Punkt, analog zum statusLabel()-Pattern in WlanScanner.tsx.
6. [A11Y-07] app/(tabs)/monitoring/index.tsx (~L380-382, 395, 335-342, 500-505) — unbeschrifteter Plus-Button, unbeschriftete Remove-Chips, unbeschriftete Consent-Checkbox, Filter-Chips ohne State. Ergänze accessibilityLabel/Role/State an allen vier Stellen.

MEDIUM:
7. [A11Y-08] components/ui/ScoreRing.tsx (~L89-101) — Schweregrad nur über Farbe. Ergänze accessibilityLabel mit Zahl + Klartext-Tier (z. B. "48 von 100, Status kritisch").
8. [A11Y-09] app/(tabs)/check/questionnaire.tsx, components/modules/WlanScanner.tsx, app/(auth)/onboarding/index.tsx, app/(auth)/login.tsx, app/(tabs)/report/index.tsx — accessibilityLiveRegion wirkt nur auf Android. Ergänze AccessibilityInfo.announceForAccessibility(message) an allen genannten Stellen zusätzlich zu den bestehenden Props.
9. [A11Y-10] components/modules/EvidenceCoveragePanel.tsx, ReportFindings.tsx, DomainCheck.tsx, components/ui/VulnerabilityCard.tsx — Expand/Collapse-Toggles ohne accessibilityRole/accessibilityState.expanded. Ergänzen.

LOW:
10. [A11Y-11] components/ui/ScoreRing.tsx — kein maxFontSizeMultiplier, Clipping-Risiko bei großen Systemschriftgrößen. Setze sinnvollen maxFontSizeMultiplier (1.3-1.5) für die Score-Anzeige.
11. [A11Y-12] components/modules/WlanScanner.tsx (~L258-277) — Segment-Picker ohne radiogroup-Container. Wrappe mit accessibilityRole="radiogroup" + Label, analog zum Fragebogen-Pattern.
12. [A11Y-13] app/(modal)/action-guide.tsx — kein Dismiss-Control. Da die Route aktuell unerreichbar ist (siehe RN-12 in Phase 7), genügt hier: Datei entweder entfernen ODER "Zurück"-Button ergänzen — triff diese Entscheidung nicht selbst, sondern kläre kurz mit dem Anfragenden, bevor du diesen einen Punkt umsetzt; die anderen 11 Findings kannst du ohne Rückfrage umsetzen.

VALIDIERUNG:
- Manueller VoiceOver-Pass (iOS) UND TalkBack-Pass (Android) für: Onboarding, Monitoring, Dashboard, Report-Detail, WLAN-Scan-Ergebnis, Domain-Check-Karte.
- npm run verify muss grün sein.

OUT OF SCOPE: A11Y-01 (bereits in Phase 1). Alle Nicht-Accessibility-Findings.

DEFINITION OF DONE: 11 der 12 Findings umgesetzt ohne Rückfrage, A11Y-13 nach kurzer Klärung; VoiceOver/TalkBack-Pass für alle betroffenen Screens dokumentiert; npm run verify grün.
```

---

## Phase 5 — Sicherheitshärtung & API-Robustheit

**Warum als nächstes**: Bündelt die restlichen Security-/Datenbank-/API-Design-Findings (überwiegend Medium) zu einem kohärenten Backend-Härtungs-Sprint. Enthält bewusst PERF-03/SEC-05 (identischer Fund, zwei Perspektiven auf dieselbe Codestelle).

### Prompt

```
Du arbeitest am Cloudflare-Worker-Teil (workers/hono/src/) und Supabase-Schema (supabase/migrations/) von PraxisShield AI. Lies CLAUDE.md, Abschnitt "Cloudflare Worker" und "Supabase". Lies vor jeder Änderung den vollständigen Finding-Eintrag in docs/reviews/03-full-code-review.md, Abschnitte 2 und 3.

AUFGABE: Behebe die folgenden Findings, gruppiert nach Datei-Nähe (arbeite in dieser Reihenfolge, da spätere Punkte teils auf früheren aufbauen):

SICHERHEIT (Abschnitt 2):
1. [SEC-01] workers/hono/src/index.ts:475 — CORS origin: "*" fest verdrahtet. Leite erlaubte Origins aus Konfiguration/APP_ENV ab; in Produktion origin: "*" verbieten. Ergänze DELETE/PATCH/PUT in allowMethods.
2. [SEC-05 / PERF-03] workers/hono/src/index.ts:2942-2959 — checkHttpsSignal nutzt fetch ohne Timeout. Ersetze durch fetchWithTimeout mit OUTBOUND_TIMEOUT_MS.securityProvider, analog zu allen anderen Provider-Calls.
3. [SEC-03] lib/config/environment.ts:18,21-23 — Produktions-Guard prüft apiBaseUrl nicht auf https://. Ergänze: AppConfig.isProduction && !AppConfig.apiBaseUrl.startsWith("https://") → throw.
4. [SEC-04] workers/hono/src/index.ts:1429,1559 — zwei console.error-Aufrufe loggen rohe Error-Objekte statt safeErrorLog(error). Korrigiere beide Stellen auf das etablierte Pattern.
5. [SEC-06] supabase/migrations/ — deletion_requests.practice_id hat keine Foreign Key. Neue Migration: alter table public.deletion_requests add constraint ... foreign key (practice_id) references public.practices(id) on delete set null. Prüfe vorab per SELECT, ob Bestandsdaten verwaiste practice_id-Werte haben.

DATENBANK & API-DESIGN (Abschnitt 3, DB-02 bis DB-13):
6. [DB-02] Migration: grant select on public.ai_report_usage to authenticated; ergänzen (analog external_check_usage).
7. [DB-03] supabase/tests/rls_cross_tenant.sql — pgTAP-Cross-Tenant-Assertions für inventory_items, inventory_known_devices, inventory_access_points, router_wifi_configurations, router_firewall_rules, monitoring_targets ergänzen (mindestens inventory_items und monitoring_targets: Owner A ↛ Practice B, viewer-Partner read-only, manager-Partner read/write). docs/RLS_PARTNER_ROLE_MATRIX.md entsprechend erweitern.
8. [DB-04] workers/hono/src/index.ts:1116-1138 (handleReportsList) — limit/offset-Query-Parameter ergänzen, serverseitig auf 50 gedeckelt.
9. [DB-05] Optionalen clientSyncId/idempotencyKey für /api/check/questionnaire, /api/check/external, /api/report/generate einführen; per unique(practice_id, client_sync_id) where client_sync_id is not null absichern (neue Migration + Spalten auf security_checks/reports), analog zum bestehenden wlan_scans-Muster.
10. [DB-06] workers/hono/src/index.ts:1604-1605,1640-1641 (consumeExternalQuota, consumeAiReportQuota) — für Nicht-Free-Pläne aktuell keinerlei Limit. Ergänze ein endliches, höheres Tages-/Stundenlimit pro Plan plus ein globales Rate-Limit-Fenster. Kläre die konkreten Limit-Werte kurz mit dem Anfragenden, bevor du sie hartcodierst.
11. [DB-07] workers/hono/src/index.ts:2166-2190 (handlePrivacyExport) — vier sequentielle Supabase-Queries in Promise.all überführen.
12. [DB-08] workers/hono/src/index.ts:2279-2299,2302-2327 (handleConsent) — type-Wert vor dem Insert gegen die sechs erlaubten Enum-Werte validieren, bei ungültigem Wert 400 statt generischem 500 zurückgeben.
13. [DB-09] Gleiche Migration wie SEC-06 (deletion_requests-FK) — nicht doppelt umsetzen, nur einmal.
14. [DB-10] Retention-Policy für email_outbox definieren (Cron-Job/Scheduled Function, der sent-Zeilen älter als konfigurierbaren Cutoff löscht/anonymisiert).
15. [DB-11] Nach Verifikation per pg_stat_user_indexes in einer Staging-/Test-Umgebung: redundanten security_checks_practice_id_idx droppen (durch Composite-Index abgedeckt).
16. [DB-12] Neue/geänderte Endpunkte künftig unter /api/v1/... — für diese Phase: nur vorbereitende Konvention dokumentieren (z. B. in docs/ARCHITECTURE.md), keine bestehenden Pfade umbenennen.
17. [DB-13] Migration: Indizes auf external_check_usage(practice_id) und ai_report_usage(practice_id) ergänzen.

FEHLERBEHANDLUNG (Abschnitt 4):
18. [TS-02] lib/api/client.ts:20-37 (apiRequest) — kein Timeout/AbortController. Ergänze AbortController mit 15-30s Timeout (länger für Report-Generierung), distinktiven Timeout-Fehlertyp einführen.

VALIDIERUNG:
- npm run test:worker, npm run test:rls, npm run verify müssen grün sein.
- Für jede neue Migration: supabase db reset lokal durchlaufen lassen, danach npm run test:rls.
- Neue Endpoint-Tests für DB-04, DB-05, DB-08 wie im Review-Dokument unter "Benötigte Tests" beschrieben.

OUT OF SCOPE: DB-06 und DB-05 erfordern jeweils eine kurze Rückfrage zu konkreten Limit-Werten bzw. zum Rollout der Idempotenz-Spalte — halte an diesen zwei Punkten inne, wenn keine Vorgabe vorliegt, und setze den Rest der Phase ohne Rückfrage um. Alle anderen Findings aus dem Review-Dokument.

DEFINITION OF DONE: Alle 18 Punkte umgesetzt (DB-05/DB-06 ggf. nach kurzer Klärung), alle Migrationen laufen sauber gegen eine frische lokale DB, npm run verify + npm run test:rls + npm run test:worker grün.
```

---

## Phase 6 — Performance-Feinschliff

**Warum als eigene Phase**: Zehn Medium/Low-Performance-Findings, unabhängig von den kritischen PERF-01–03 (bereits behoben), lassen sich als eigener Optimierungs-Sprint bündeln.

### Prompt

```
Du arbeitest am Repository PraxisShield AI (Worker + Mobile App). Lies die vollständigen Finding-Einträge PERF-04 bis PERF-13 in docs/reviews/03-full-code-review.md, Abschnitt 7, vor jeder Änderung.

AUFGABE:

1. [PERF-04] workers/hono/src/index.ts:2747-2763 (fetchMonitoringTargets) — unbegrenzter Full-Scan von practices ohne Index auf domain. Migration: partiellen Index (domain) where domain is not null ergänzen. Cron-Pagination (Batching über Cursor) ist ein separater, größerer Schritt — setze dafür nur den Index in dieser Phase um und dokumentiere die Pagination als Folgearbeit, sofern nicht explizit anders gewünscht.
2. [PERF-05] app/_layout.tsx, app/(tabs)/dashboard/index.tsx, app/(tabs)/monitoring/index.tsx — QueryClientProvider ist eingerichtet, aber useQuery/useMutation wird nirgends genutzt. Migriere die Fetch-Logik in loadDashboardData (dashboard) und loadMonitoringDashboard-Aufruf (monitoring) zu useQuery, mit sinnvollem staleTime/retry. Bestehende Loading-/Error-State-Tests müssen weiter bestehen (ggf. anpassen).
3. [PERF-06] lib/monitoring/service.ts vs. workers/hono/src/index.ts handleDashboard — dokumentiere explizit (Code-Kommentar oder docs/ARCHITECTURE.md), warum Monitoring-Tab einen separaten Client-seitigen Pfad statt des Worker-Dashboard-Endpunkts nutzt (Realtime-Anforderung), ODER konsolidiere auf den Worker-Endpunkt plus Realtime-Layer darüber — triff diese Entscheidung nicht selbst, sondern kläre kurz, welche der beiden Optionen gewünscht ist.
4. [PERF-07] workers/hono/src/index.ts:939-1006 (handleDashboard) — optional: einzelne Postgres-RPC statt 6 REST-Roundtrips erwägen. Nur umsetzen, wenn Phase-6-Kapazität reicht; sonst als dokumentierte Folgearbeit zurückstellen.
5. [PERF-08] Migration: ergänzenden Index (practice_id, completed_at desc) ohne type auf security_checks für die ungetypte History-Query.
6. [PERF-09] Migration: Index (practice_id, anonymized_at, created_at desc) auf reports.
7. [PERF-10] package.json — @shopify/react-native-skia entfernen (keine Importe im Repo gefunden). Nach Entfernung: vollständigen nativen Rebuild (expo run:ios / expo run:android) als Smoke-Test durchführen.
8. [PERF-11] metro.config.js, tailwind.config.js — NativeWind/Tailwind-Wiring entfernen, falls kein Plan zur className-Adoption besteht. Kläre kurz, ob NativeWind absichtlich für später vorgehalten wird, bevor du es entfernst.
9. [PERF-12] app/(tabs)/inventory/index.tsx — Listen (Known-Devices, Access Points, Inventar) auf FlatList migrieren statt ScrollView + .map(). Hinweis: identisch mit RN-10 aus Phase 7 — setze diesen Punkt nur EINMAL um, in welcher Phase auch immer du zuerst hier ankommst, und verweise in der jeweils anderen Phase darauf.
10. [PERF-13] workers/hono/src/index.ts:2071-2093 (handleMonitoringStatus) — zwei sequentielle Supabase-Queries (snapshots, events) in Promise.all überführen.

VALIDIERUNG:
- Für Indizes (PERF-04, 08, 09): EXPLAIN ANALYZE vor/nach dokumentieren.
- Für PERF-05: neue/angepasste Screen-Tests, die belegen, dass bei schnellem Remount kein doppelter Netzwerk-Call ausgelöst wird.
- Für PERF-10: expo run:ios / expo run:android nach Entfernung erfolgreich.
- npm run verify, npm run test:worker müssen grün sein.

OUT OF SCOPE: PERF-01/02/03 (bereits in Phase 1/5 behoben). Bei PERF-06 und PERF-11: nicht ohne kurze Klärung entscheiden, alles andere ohne Rückfrage umsetzen.

DEFINITION OF DONE: Mindestens PERF-04, 08, 09, 10, 12, 13 umgesetzt ohne Rückfrage; PERF-05/06/07/11 nach Kapazität bzw. kurzer Klärung; npm run verify grün.
```

---

## Phase 7 — Wartbarkeit, Dead Code, Duplikate, Testbarkeit

**Warum als eigene Phase**: Bündelt Cleanup-Arbeit, die keine Produktentscheidung außer bei MAINT-01 erfordert. Bewusst nach den funktionalen Phasen platziert, damit Refactorings nicht mit gleichzeitig laufenden funktionalen Änderungen kollidieren.

### Prompt

```
Du arbeitest am Repository PraxisShield AI. Lies die vollständigen Finding-Einträge in docs/reviews/03-full-code-review.md, Abschnitt 5 (RN-05 bis RN-13), Abschnitt 4 (TS-03 bis TS-05), Abschnitt 1 (ARCH-04, ARCH-08) und Abschnitt 8 (MAINT-01 bis MAINT-05, MAINT-09 bis MAINT-11) vor jeder Änderung.

AUFGABE — in dieser Reihenfolge:

1. [MAINT-01] Score-Tone-Mapping ist 7-fach dupliziert (lib/security/scoring.ts:462-466 [tot], app/(tabs)/report/[id].tsx:203-205, lib/security/practiceGuidance.ts:147-149, lib/monitoring/types.ts:94-96, lib/security/wlan.ts:1441-1443, components/modules/WlanScanner.tsx:744-746, lib/security/segmentationAssessment.ts:68) mit inkonsistenten Schwellen (75/50 aus decideAmpel vs. 80/55 in allen 7 Kopien). BEVOR du Code änderst: kläre mit dem Anfragenden, welche Schwelle kanonisch ist (75/50, wie in CLAUDE.md/docs/SCORING.md dokumentiert, oder 80/55). Extrahiere danach eine einzige exportierte toneForScore(score): RiskTone-Funktion mit der geklärten Schwelle in ein gemeinsames Modul, migriere alle 6 aktiven Call-Sites darauf, entferne den toten Export in scoring.ts. Füge einen Test hinzu, der den Helper gegen die dokumentierten Score-Bänder verifiziert.

2. [ARCH-08] lib/security/scoring.ts:462-466 / components/modules/WlanScanner.tsx:744-746 — deckt sich mit MAINT-01, wird durch obigen Fix mit erledigt.

3. [MAINT-02] UUID-Regex 9-fach dupliziert (app/(tabs)/report/index.tsx:18, app/(tabs)/report/[id].tsx:20, lib/security/external.ts:4, lib/dashboard/service.ts:4, lib/ai/report.ts:103, lib/monitoring/service.ts:27, lib/ai/report-service.ts:4, lib/security/wlan.ts:1447-1449, workers/hono/src/index.ts:839-841). Extrahiere einen isUuid/UUID_RE-Export in ein gemeinsames App-seitiges Util (z. B. lib/utils/validation.ts) für die 7 App-Kopien und die wlan.ts-Kopie; Worker-Kopie separat belassen (andere Runtime-Grenze). Ergänze isUuid.test.ts.

4. [MAINT-03] lib/ai/report.ts:131-161 (generateAiReport) — vollständig toter Code (keine Aufrufer). Entferne die Funktion und ausschließlich von ihr genutzte Typen (Zeilen 7-90), nach Verifikation per Grep, dass keine externen Re-Exports existieren.

5. [MAINT-04] Fünf unreferenzierte Dateien: constants/animations.ts, constants/typography.ts (risikofrei löschen); components/ui/RiskCard.tsx, components/modules/DomainCheck.tsx, lib/store/storage.ts (halbfertige Features — kläre kurz, ob entfernt oder für spätere Reaktivierung behalten werden soll, bevor du sie löschst).

6. [MAINT-05] lib/security/networkSecurityAssessment.ts:72-79 (networkContextFindings) — toter Code, dupliziert bereits inline vorhandene Logik in assessGatewaySecurity (Zeilen 40-43). Entferne die tote Funktion.

7. [MAINT-11] components/ui/Ampel.tsx:61 (TrafficLight-Alias) — toten Export entfernen.

8. [MAINT-09] workers/hono/src/index.ts (3726 Zeilen, God-Module) — teile in Module auf: routes/, auth/, providers/, ai/, privacy/, monitoring/, supabase-rest, angelehnt an das bereits vorhandene, aber ungenutzte Präzedenzbeispiel workers/hono/src/privacy.ts. Gehe inkrementell vor: nach JEDEM Extraktionsschritt npm run test:worker ausführen, erst dann weiter extrahieren. Dies ist der risikoreichste Punkt dieser Phase — plane entsprechend Zeit für sorgfältige, kleine Schritte ein.

9. [MAINT-10] Ergänze lib/monitoring/__tests__/service.test.ts und lib/dashboard/__tests__/service.test.ts (aktuell null Testabdeckung), die die Fehlerpfade von MonitoringFetchError/DashboardFetchError sowie die Erfolgspfade abdecken. Orientiere dich am Mocking-Pattern in lib/security/__tests__/wlan-sync.test.ts.

10. [TS-03] lib/security/scoring.ts:537,429-431,68,562-564 — review_status hartcodiert auf "ok", evidence_sources-Override nie produktiv befüllt. Entferne die tote Override-Fläche/den toten review_status-Zweig (empfohlen, da kein aktiver Produktnutzen erkennbar) — falls stattdessen eine echte Verdrahtung gewünscht ist, kläre das kurz.

11. [TS-04] lib/ai/report.ts:131-150 — deckt sich mit MAINT-03, wird durch dessen Fix mit erledigt.

12. [TS-05] lib/security/wlan.ts:559-598, Zeile 595 (syncWlanScanResultToSupabase) — reason-Union wird durch error.message auf string aufgeweitet. Führe expliziten Return-Type mit geschlossener reason-Union + separatem detail-Feld ein. Erweitere wlan-sync.test.ts entsprechend.

13. [RN-05] lib/store/inventory.ts:61-65 — Selektoren geben bei jedem Aufruf ein neues leeres Array-Literal zurück. Memoize eine stabile leere Array-Konstante auf Modulebene, gib diese zurück statt []-Literalen.

14. [RN-06] app/(tabs)/check/questionnaire.tsx:100-102 — Score-Neuberechnung über useEffect statt direkt beim setAnswer-Aufruf. Rufe recalculate() direkt in der Store-Action oder im onPress-Handler auf, entferne den Effect.

15. [RN-07] app/(tabs)/report/index.tsx:68-85 (handleExportPdf) — kein Share-Flow nach PDF-Export, nur Alert mit rohem Pfad. Ergänze Sharing.shareAsync(pdfPath) (expo-sharing) nach erfolgreichem Export.

16. [RN-08] app/(tabs)/check/wlan-scan.tsx:15-25, app/(tabs)/monitoring/index.tsx:246-252 — Buttons "Bericht erzeugen"/"Bericht exportieren" tun nicht, was ihr Label verspricht. Für diese Phase: Labels korrigieren (z. B. "Weiter zum Bericht"), da echte Verdrahtung ein größerer Scope wäre — kläre kurz, falls stattdessen echte Funktionalität gewünscht ist.

17. [RN-09] components/modules/WlanScanner.tsx, app/(tabs)/inventory/index.tsx, app/(tabs)/monitoring/index.tsx — 1000+ Zeilen, mischen Datenladen/Formular-State/Präsentation. Extrahiere Formularblöcke (InventoryItemForm, KnownDeviceForm, AccessPointForm, RouterConfigForm) und Listen-Sektionen in eigene Dateien/Komponenten. Gehe inkrementell vor, mit Testabdeckung pro extrahiertem Teil.

18. [RN-10] app/(tabs)/inventory/index.tsx — Listen nicht virtualisiert (ScrollView + .map() + BlurView pro Zeile). Migriere zu FlatList mit stabilem keyExtractor. HINWEIS: identisch mit PERF-12 — nur einmal umsetzen (siehe Hinweis in Phase 6).

19. [RN-11] components/ui/VulnerabilityCard.tsx:4-14,59-89 — Legacy Animated/PanResponder statt react-native-gesture-handler. Portiere auf Gesture.Pan() + useAnimatedStyle.

20. [RN-12] app/(modal)/action-guide.tsx — verwaiste, unerreichbare Route. Entscheidung (entfernen oder mit Rollenlogik füllen und verlinken) siehe A11Y-13 in Phase 4 — setze hier nur um, was dort geklärt wurde.

21. [RN-13] app/(modal)/alert-detail.tsx:92-96 — keine Quittierungs-Aktion trotz Backend-Support. Ergänze "Als erledigt markieren"-Button mit optimistischem Update von event.resolved_at, unter Berücksichtigung der bestehenden Realtime-Subscription in monitoring/index.tsx.

VALIDIERUNG:
- Nach jedem größeren Schritt (insbesondere MAINT-09): npm run verify + npm run test:worker.
- Neue/erweiterte Tests wie oben pro Finding beschrieben.
- Für RN-09/RN-10: manuelle Regressionsprüfung von Inventory/Monitoring/WLAN-Scan-Screens nach Extraktion.

OUT OF SCOPE: Alle Findings aus anderen Phasen. Bei MAINT-01, MAINT-04 (teilweise), RN-08, RN-12: kurze Klärung nötig, bevor du diese konkreten Punkte umsetzt — der Rest der Phase kann ohne Rückfrage bearbeitet werden.

DEFINITION OF DONE: Alle 21 Punkte umgesetzt (mit den genannten Klärungen), npm run verify + npm run test:worker grün, MAINT-09-Extraktion in nachvollziehbaren kleinen Commits mit grünen Tests nach jedem Schritt.
```

---

## Phase 8 — Dependency- & Konfigurationsmanagement

**Warum zuletzt**: Enthält die riskanteste, planungsintensivste Einzelmaßnahme (MAINT-12, Expo-SDK-Upgrade) sowie die MAINT-08-Falle, die vor jeder generellen Dependency-Bereinigung verstanden sein muss. Konfigurations-Cleanup (ARCH) ist risikoarm, aber niedrigpriorisiert — daher ans Ende gestellt.

### Prompt

```
Du arbeitest am Repository PraxisShield AI. Lies die vollständigen Finding-Einträge ARCH-01/02/03/05/06/07 und MAINT-06/07/08/12 in docs/reviews/03-full-code-review.md vor jeder Änderung.

AUFGABE — Reihenfolge ist hier besonders wichtig:

SCHRITT 1 — ZUERST, vor jeder anderen Dependency-Änderung in dieser Phase:
[MAINT-08] package.json:80 (eslint-config-expo) — wird nirgends referenziert (keine .eslintrc*, eslint.config.mjs ist eine handgeschriebene Flat-Config), ist aber der EINZIGE Grund, warum @typescript-eslint/eslint-plugin und @typescript-eslint/parser (von eslint.config.mjs direkt importiert) in node_modules existieren — beide sind nur transitive Dependencies von eslint-config-expo, nicht direkt deklariert. Ergänze @typescript-eslint/eslint-plugin und @typescript-eslint/parser als explizite devDependencies (gepinnt auf die aktuell installierte Version, prüfe mit npm ls @typescript-eslint/eslint-plugin @typescript-eslint/parser), führe npm run lint aus und verifiziere, dass es weiterhin grün ist — ERST DANACH eslint-config-expo entfernen und npm run lint erneut verifizieren.

SCHRITT 2:
[MAINT-06] package.json — @shopify/react-native-skia ist bereits in Phase 6 (PERF-10) behandelt, falls dort schon erledigt, hier nur react-native-mmkv behandeln: falls lib/store/storage.ts in Phase 7 (MAINT-04) entfernt wurde, entferne react-native-mmkv jetzt ebenfalls aus package.json; führe npm run typecheck und einen nativen Rebuild-Smoke-Test aus.

SCHRITT 3:
[MAINT-07] package.json:76,77,83 (@testing-library/jest-native, @testing-library/react-native, msw) — ungenutzte devDependencies, da alle Tests react-test-renderer direkt nutzen. jest.config.js nutzt zudem nicht das deklarierte jest-expo-Preset. Entferne die drei ungenutzten Pakete aus package.json. Kläre kurz, ob stattdessen eine Migration zu React Testing Library gewünscht ist (größerer, separater Scope) — falls nicht, nur entfernen.

SCHRITT 4 — Konfigurationsmanagement (risikoarm, kann parallel zu Schritt 1-3 erfolgen):
[ARCH-01] lib/config/environment.ts:18,21-23 — Produktions-Guard ergänzen, dass apiBaseUrl gesetzt ist und mit https:// beginnt (deckt sich mit SEC-03 aus Phase 5 — falls dort bereits umgesetzt, hier überspringen).
[ARCH-02] .env.example um alle app-seitig gelesenen EXPO_PUBLIC_*-Variablen ergänzen; neues workers/hono/.dev.vars.example mit allen server-seitigen Variablen aus dem Env-Interface (workers/hono/src/index.ts:9-26) anlegen.
[ARCH-03] workers/hono/src/index.ts:475 — deckt sich mit SEC-01 aus Phase 5, hier überspringen falls dort bereits umgesetzt.
[ARCH-05] workers/hono/wrangler.toml:5-6 — APP_ENV="development" ist die einzige Umgebung, Variable wird im Code nie gelesen. Entweder APP_ENV entfernen oder [env.production]-Block anlegen und die Variable tatsächlich auswerten — kläre kurz, welche Option gewünscht ist.
[ARCH-06] Neues eas.json mit Build-Profilen (development/preview/production) inkl. profilbezogener EXPO_PUBLIC_*-Zuordnung anlegen. Benötigt reale Projektwerte — kläre diese, bevor du die Datei befüllst.
[ARCH-07] supabase/config.toml:13 — graphql_public aus schemas entfernen, nach Bestätigung, dass die produktive Supabase-Projekt-Einstellung ebenfalls angepasst werden soll.

SCHRITT 5 — Größte Einzelmaßnahme, nur nach explizitem Go des Anfragenden starten:
[MAINT-12] package.json:41-89 — Kern-Dependencies mehrere Majors veraltet (Expo 51→57, React Native 0.74→0.86, React 18→19, TypeScript 5.3→7.0, u. v. m.). Dies ist KEINE Aufgabe für einen einzelnen Durchlauf: Plane einen inkrementellen Expo-SDK-Upgrade-Pfad (51→52→...→57), einen SDK-Major pro Schritt. Nach JEDEM Schritt: npm run verify + npm run e2e:smoke (Maestro) müssen grün sein, bevor der nächste Schritt beginnt. Erstelle zunächst NUR einen Migrationsplan (welche Breaking Changes pro SDK-Schritt laut Expo-Changelog zu erwarten sind, welche der in diesem Repo genutzten Libraries betroffen sind) und lege ihn dem Anfragenden zur Freigabe vor, bevor du den ersten SDK-Schritt tatsächlich ausführst.

VALIDIERUNG:
- Nach Schritt 1: npm run lint zweimal grün (vor und nach eslint-config-expo-Entfernung).
- Nach Schritt 2-3: npm run typecheck, npm run test.
- Nach Schritt 4: npm run verify.
- Schritt 5: nur Planungsdokument in dieser Phase, keine Codeänderung ohne gesonderte Freigabe.

OUT OF SCOPE: Tatsächliche Durchführung des Expo-SDK-Upgrades (nur Planung in dieser Phase). ARCH-01/03, falls bereits in Phase 5 erledigt — nicht doppelt umsetzen.

DEFINITION OF DONE: Schritte 1-4 vollständig umgesetzt, npm run verify grün; für Schritt 5 liegt ein reviewfähiger Migrationsplan vor, aber keine SDK-Version wurde ohne gesonderte Freigabe geändert.
```

---

## Hinweise zur Nutzung dieses Plans

- Jeder Phasen-Prompt ist bewusst so geschrieben, dass er als Startpunkt einer NEUEN Session/eines neuen Auftrags an einen Coding-Agenten oder Entwickler dient — er enthält genug Kontext (Datei-Pfade, Zeilenangaben, erwartete Lösung, Tests, Abgrenzung), um ohne Rückgriff auf diese Unterhaltung ausführbar zu sein.
- An mehreren Stellen sind bewusste Klärungspunkte markiert (z. B. MAINT-01-Schwellenwert, DB-06-Limits, ARCH-06-Projektwerte, MAINT-12-Freigabe) — diese sollten vor bzw. während der jeweiligen Phase mit dem Anfragenden geklärt werden, nicht von einem Agenten eigenmächtig entschieden werden.
- Phasen 1-4 sind unabhängig von Phasen 5-8 und könnten bei Bedarf parallel von unterschiedlichen Personen/Sessions bearbeitet werden; Phasen 5-8 haben untereinander leichte Abhängigkeiten (siehe Querverweise in den Prompts, z. B. RN-10/PERF-12, SEC-01/ARCH-03).
- Jede Phase sollte mit einem eigenen `/ecc:code-review` (Local Review Mode) abgeschlossen werden, bevor sie gemerged wird.
