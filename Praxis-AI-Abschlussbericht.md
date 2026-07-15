# Praxis-AI – Audit-Abschlussbericht

**Projekt:** Praxis-AI (Expo/React Native + Supabase/Postgres + Hono/Cloudflare Worker)
**Umfang:** Statische Code-/Repo-Analyse über 6 Phasen (Architektur, Features/Daten, API/DB, Security/Performance, UI/UX, Code/Tests/Betrieb), kein Test gegen laufende Instanz.
**Gesamtzahl Findings:** 82 (davon 6 Positiv-Befunde ohne Handlungsbedarf)

---

## 1. Zusammenfassung

Praxis-AI ist architektonisch sauber aufgebaut (klare Modultrennung, dokumentiertes Datenmodell, RLS-Grundlage, keine klassischen Injection-/XSS-/CSRF-Schwachstellen, solide Passwortspeicherung über Supabase Auth). Das grundlegende Sicherheitsfundament ist in Ordnung.

Das eigentliche Risiko liegt in zwei wiederkehrenden Mustern, die sich durch fast alle Phasen ziehen:

1. **Autorisierung ist lückenhaft, nicht die Authentifizierung.** Mehrere sensible und mutierende Endpunkte (Datenlöschung, Datenexport, Report-Erzeugung, kostenpflichtige Checks) prüfen nicht die richtige Mindestrolle. Ein einfacher `viewer` kann Aktionen auslösen, die eigentlich `owner`/`manager` vorbehalten sein sollten. Ein Endpunkt ist ganz ohne Auth erreichbar, wenn ein Parameter fehlt.
2. **Die App zeigt an mehreren Stellen etwas, das nicht echt ist, ohne das klar zu kennzeichnen.** Am gravierendsten: Bei Fehlern in der KI-Berichtserzeugung wird automatisch ein hartcodierter Beispielbericht angezeigt – ohne für den Nutzer erkennbaren Hinweis, dass es sich nicht um eine echte Auswertung handelt. Das ist bei einer Sicherheits-Auditing-App ein Integritätsproblem im Kern des Produktversprechens, nicht nur ein UX-Detail.

Zusätzlich ist die aktuelle CI-Pipeline nicht grün (Lint- und Testfehler), und ausgerechnet der Test, der die Mandanten-Trennung (RLS) prüft, ist in CI falsch verdrahtet und läuft vermutlich nicht wirksam durch. Das bedeutet: Die Autorisierungslücken hätten durch die vorhandene Testinfrastruktur eigentlich auffallen sollen, sind es aber nicht.

Mehrere Kernfunktionen (Login/Logout-Zyklus, Passwort-Reset, Inventar- und Report-Persistenz, externer Check) sind nur teilweise oder gar nicht fertig – die App wirkt in der Bedienung oft weiter, als der tatsächliche Implementierungsstand hergibt.

---

## 2. Fehlende Informationen für eine vollständige Bewertung

- Zugriff auf eine laufende Instanz oder Staging-Umgebung (bisher nur statische Code-Analyse)
- `eas.json` bzw. Informationen zum EAS Build/Submit-Prozess für Mobile Releases (F-005)
- Versioniertes Mapping Environment → Supabase-Projekt/URL (F-006)
- Klärung, ob GraphQL (`graphql_public`) bewusst weiter exponiert bleiben soll (F-007)
- Entscheidung zu Supabase Edge Functions und Legacy-Worker-Routen: löschen oder dokumentiert als Fallback behalten (Bezug F-003/F-004/F-012/F-030/F-074)
- Test-Secrets für den RLS-Integrationstest in CI (F-072)
- Klarheit, ob Payments/Billing zeitnah eingeführt werden (F-082)

---

## 3. Findings nach Schweregrad

### Kritisch (Release-Blocker — vor jedem Produktivbetrieb zwingend beheben)

| ID | Kategorie | Finding |
|---|---|---|
| F-036 | Sicherheit | `privacy/delete` ohne Mindestrolle — jede Rolle inkl. `viewer` kann irreversible Datenlöschung auslösen |
| F-022/F-038 | Sicherheit | `/api/monitoring/run` kann ohne `practiceId` komplett unauthentifiziert laufen |
| F-023/F-039 | Sicherheit | Mehrere mutierende/kostenpflichtige Endpunkte ohne Mindestrollen-Prüfung (report/generate, check/external, alert/acknowledge, legal/consent, legal/avv/accept) |
| F-009/F-056 | Datenintegrität/UX | KI-Bericht fällt bei Fehlern unerkennbar auf hartcodierten Beispielbericht zurück — bestätigt sowohl in Code-Analyse als auch im UX-Test |
| F-008/F-057 | Funktionalität | Externer Check wird beworben, aber nie ausgeführt — Reports zeigen immer `external: null` |
| F-069 | Betrieb | Lint schlägt aktuell fehl trotz `--max-warnings=0` als CI-Gate — Release-Prozess ist derzeit nicht funktionsfähig |

### Hoch

| ID | Kategorie | Finding |
|---|---|---|
| F-001 | Architektur | Kern-Dependencies mehrere Major-Versionen veraltet (Expo, React Native, React, TypeScript, Expo Router) |
| F-010/F-027 | Persistenz | Report-Persistenz halb fertig — keine `GET /api/reports(/:id)`, Reports gehen nach Neustart verloren |
| F-011/F-026 | Persistenz | Inventar/Monitoring-Ziele/Firewall-Regeln nur im Client-Zustand, kein DB-Modell |
| F-012 | Sicherheit | Supabase Edge Function `external-check` liefert hartcodierten Fake-Finding — gefährlich falls versehentlich reaktiviert |
| F-013 | Funktionalität | WLAN-Scan: erweiterte Checks ohne natives Modul stumm `unavailable`, ohne Nutzerhinweis |
| F-014 | Datenkonsistenz | Monitoring-Ziele aus nicht-persistiertem Inventar, obwohl Monitoring selbst echte DB-Daten nutzt |
| F-024 | Datenkonsistenz | Consent-Werte vom Frontend werden von DB-Constraint abgelehnt → 500 statt sauberem 400 |
| F-025/F-045 | Robustheit | Kein Timeout/AbortController für externe Provider-/LLM-Aufrufe |
| F-028 | Deployment | Service-Role-Grants decken nicht alle tatsächlichen Worker-Schreibpfade ab |
| F-037 | Sicherheit | `privacy/export` ohne Mindestrolle — voller Datensatz für jede Rolle abrufbar |
| F-043 | Performance | Bis zu 25 Domains × 7 Checks parallel — Risiko für Provider-Rate-Limits/Timeouts |
| F-054/F-055 | Kernfunktion fehlt | Kein Passwort-vergessen-Flow; keine Möglichkeit, sich abzumelden (kein Logout/Profil/Einstellungen) |
| F-058/F-059 | UI/Accessibility | Fehlende Accessibility-Labels; Onboarding nicht scrollbar mit Abschneide-Risiko |
| F-070/F-071/F-072/F-073 | Tests/Betrieb | Testlauf nicht grün; Secret-Leak im Logging; RLS-Test in CI unwirksam verdrahtet; keine E2E-Tests für Kernflows |
| F-074 | Architektur | Doppelte AI-Report-Logik in Edge Function und Worker |

### Mittel

F-002, F-006, F-015, F-016, F-017, F-018, F-019, F-020, F-029, F-030, F-031, F-032, F-040, F-041, F-042, F-044, F-046, F-047, F-048, F-060, F-061, F-062, F-063, F-064, F-066, F-067, F-075, F-076, F-077, F-078, F-079, F-080, F-081

*(Details siehe Findings-Tracker — überwiegend API-Konsistenz, fehlende Indizes, UI-Polish, Fehlerbehandlung, Architektur-Aufräumarbeiten)*

### Niedrig

F-004, F-007, F-033, F-034, F-065

### Info / zukünftig

F-005, F-082

### Positiv-Befunde (kein Handlungsbedarf)

F-021 (Demo-Modus sauber gekennzeichnet), F-049 (Secrets korrekt aus Repo gehalten), F-050 (keine Injection-Schwachstellen), F-051 (kein XSS-Risiko), F-052 (kein CSRF-Risiko), F-053 (Passwortspeicherung korrekt über Supabase Auth), F-068 (kurze Klickwege bei Kernfunktionen)

---

## 4. Bewertung nach Kategorie (0–100)

**Bewertungskriterien (vor der Bewertung festgelegt):**
- 90–100: keine offenen kritischen/hohen Findings in der Kategorie
- 70–89: keine kritischen, aber einzelne hohe Findings offen
- 50–69: mindestens ein kritisches Finding oder mehrere hohe Findings offen
- 30–49: mehrere kritische Findings oder strukturelles Grundproblem
- 0–29: Kategorie im Kern nicht funktionsfähig/nicht vertrauenswürdig

| Kategorie | Score | Begründung |
|---|---:|---|
| Funktionalität | 45 | Mehrere beworbene Kernfunktionen laufen nicht (externer Check, Alert-Quittierung) oder täuschen Funktionalität vor (Fake-Bericht-Fallback) |
| Sicherheit | 35 | Mehrere kritische Autorisierungslücken (Löschung, Export, kostenpflichtige Aktionen), einer davon komplett ohne Auth erreichbar; Grundfundament (Injection/XSS/CSRF/Passwörter) aber solide |
| Performance | 62 | Keine kritischen Findings, aber konkrete Skalierungsrisiken (Provider-Fanout, fehlende Indizes, kein Timeout-Handling) |
| Benutzerfreundlichkeit | 48 | Fehlende Kernfunktionen (Logout, Passwort-Reset), irreführende Buttons, aber kurze Klickwege und funktionierende Kern-Screens |
| Design | 58 | Kontrastproblem im Primärbutton, kein Tablet/Desktop-Handling, aber konsistente Navigation und klare Empty/Error-States an mehreren Stellen |
| Codequalität | 55 | Rotes Lint/Test-Gate, große Monolith-Datei im Worker, Code-Duplikation, aber saubere Modultrennung auf Projektebene |
| Architektur | 60 | Sinnvolle Grundstruktur (UI/Fachlogik/Backend getrennt), aber Redundanzen (Edge Functions vs. Worker) und fehlendes Datenmodell für mehrere Frontend-Features |
| Wartbarkeit | 50 | Fehlender zentraler Logger, inkonsistente Fehlerbehandlung, veraltete Major-Dependencies erschweren zukünftige Änderungen |
| Skalierbarkeit | 55 | Fehlende Indizes und unbegrenzter Provider-Fanout sind lösbar, aber aktuell nicht vorbereitet für Wachstum |
| Dokumentation | 72 | Sehr ausführliche README/Architektur-/Security-Doku vorhanden, aber stellenweise nicht synchron zum aktuellen Code, keine API-Spezifikation (OpenAPI) |

**Gewichteter Gesamtscore: ca. 52/100**
(Gewichtung: Sicherheit und Funktionalität doppelt, da beide Release-kritisch sind; übrige Kategorien einfach gewichtet)

---

## 5. Gesamtempfehlung

## ⚠️ Nicht produktionsreif

Die App hat ein solides architektonisches Fundament und keine klassischen Sicherheitslücken (Injection/XSS/CSRF), aber mehrere **kritische Autorisierungslücken mit echtem Schadenspotenzial** (unautorisierte Datenlöschung, unautorisierter Datenexport, ein komplett unauthentifizierter Endpunkt) und ein **Kernintegritätsproblem** (Fake-Bericht-Fallback ohne Kennzeichnung) schließen einen Produktivbetrieb im aktuellen Zustand aus. Hinzu kommt, dass die eigene CI-Pipeline aktuell nicht grün ist und der Test, der die kritischste Sicherheitseigenschaft (Mandantentrennung) prüfen soll, in CI nicht wirksam läuft.

Mit gezielter Arbeit an den kritischen und hohen Findings (siehe Maßnahmenplan) ist "Fast produktionsreif" realistisch erreichbar, da es sich um klar lokalisierte, wiederkehrende Muster handelt (v. a. fehlende Rollenprüfung) und nicht um grundlegende Architekturfehler.

---

## 6. Priorisierter Maßnahmenplan

**Schritt 1 — Sofort, vor allem anderen (Sicherheit, ca. 1 Muster, viele Findings auf einmal lösbar)**
Alle `requirePracticeAccess`-Aufrufe im Worker durchgehen und für jeden mutierenden/sensiblen Endpunkt explizit die richtige Mindestrolle setzen (`owner` für Löschung, `manager` für kostenpflichtige/rechtliche Aktionen). Betrifft F-022, F-023, F-036, F-037, F-038, F-039, F-042 in einem Durchgang. `/api/monitoring/run` zusätzlich: Auth und `practiceId` verpflichtend machen.

**Schritt 2 — Sofort (Integrität)**
Fake-Bericht-Fallback entfernen oder klar und unübersehbar als "Beispielbericht — keine echte Auswertung" kennzeichnen, inklusive Sperre für produktive Nutzer. Betrifft F-009/F-056.

**Schritt 3 — Vor Release (CI/Testinfrastruktur reparieren, bevor weitere Fixes vertrauenswürdig verifiziert werden können)**
Lint-Fehler beheben (F-069), fehlgeschlagenen Test reparieren (F-070), RLS-Test in CI mit den nötigen Env-Variablen ausstatten und wirksam verifizieren (F-072), Secret-Leak im Logging beheben (F-071).

**Schritt 4 — Vor Release (Kernfunktionen vervollständigen)**
Logout/Profil/Einstellungen ergänzen (F-055), Passwort-vergessen-Flow ergänzen (F-054), externen Check tatsächlich in den Check-Flow einbauen oder aus der Bewerbung entfernen (F-008/F-057), Report-Persistenz fertigstellen (`GET /api/reports(/:id)`, F-010/F-027).

**Schritt 5 — Vor Release (Aufräumen redundanter/gefährlicher Altlasten)**
Supabase Edge Functions und Legacy-Worker-Routen entweder entfernen oder eindeutig als deaktiviert markieren (F-003, F-004, F-012, F-030, F-074) — besonders der Fake-DMARC-Stub in `external-check` ist ein Risiko, falls versehentlich reaktiviert.

**Schritt 6 — Kurzfristig nach Release-Vorbereitung**
Inventar-/Monitoring-Ziele-Datenmodell in der DB nachziehen (F-011/F-014/F-026), Timeout/AbortController für externe Fetches einführen (F-025/F-045), fehlende Indizes ergänzen (F-032/F-046), Consent-Werte zwischen Frontend und DB synchronisieren (F-024).

**Schritt 7 — Mittelfristig**
Dependency-Major-Upgrade (Expo/RN/React/TS) als eigenes, isoliertes Projekt planen (F-001), zentralen Logger/Crash-Reporting einführen (F-078), E2E-Tests für Kernflows aufbauen (F-073), Worker-Datei modularisieren (F-075), UI-Polish (Kontrast, Accessibility-Labels, Tablet-Handling: F-058 bis F-061).

---

*Vollständige Fundstellen-Referenzen (Datei + Zeile) für jedes Finding befinden sich im begleitenden Findings-Tracker.*
