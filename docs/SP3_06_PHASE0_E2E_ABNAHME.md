# SP3-06 – Phase-0-End-to-End-Abnahme

Stand: 2026-09-28 · Basis: `origin/main` / PR #69 (`452dab0`)

## Entscheidung und Grenzen

**Status: `evidence_collection` – keine Phase-0- oder Produktionsfreigabe.** Ein grüner
Unit-Test, eine grüne PR-CI oder ein synthetischer Restore ersetzt keinen gerätebasierten
End-to-End-Nachweis und keine benannte fachliche oder betriebliche Entscheidung. Ein Gate ist
nur `passed`, wenn Ausführung, Ergebnis, Revision, Umgebung und verantwortliche Person
nachvollziehbar dokumentiert sind. `technical_passed` bedeutet ausschließlich: Der
automatisierte technische Teilnachweis ist grün; fachliche und betriebliche Voraussetzungen
fehlen noch. `technical_passed`, `not_run`, `partial` und `blocked` zählen **nicht** als
erfolgreicher Phase-0-Exit.

Der Product Owner hat am 28.09.2026 mitgeteilt, dass **noch keine produktiven verschlüsselten
Daten** existieren. Das ist eine Owner-Auskunft, keine Prüfung der Cloud-Konfiguration oder
Produktionsdatenbank. Synthetische Entwicklungs- und Testarbeit darf weiterlaufen; D-05 bleibt
für Produktion vollständig offen. D-05 ist **nicht erlassen**: Vor dem ersten produktiven verschlüsselten
Datensatz müssen Schlüssel, unabhängige Verwahrung, Zugriffsregel und Wiederherstellung
nachgewiesen sein. Die Aussage „noch keine produktiven Daten“ ist **kein Release-Gate** und
rechtfertigt keine Produktionsfreigabe. Bis ein überprüfbarer technischer Auslöser und eine
benannte Owner-Freigabe existieren, bleiben produktive Verschlüsselungswrites, Snapshoterzeugung,
Manifest-Cutover und Schlüsselrotation für SP3-06 **blockiert**. D-06/D-07 und die
ADR-001-Freigaben bleiben eigenständige Blocker.

**P3-1 – Produktions-Auslöser noch nicht instrumentiert:** Vor jeder Produktionsfreigabe muss
ein benannter Operations-Owner zusammen mit Security einen unmittelbar aktuellen,
schreibgeschützten Nachweis über nicht-leere verschlüsselte Bestände in
`security_checks`, `reports`, `assessment_manifests` und `monitoring_snapshots` liefern.
Zusätzlich ist die unabhängige Verwahrung des dann verwendeten Schlüssels zu testen. Der
technische Pre-Release-Check, der namentliche Owner und ein Prüftermin sind derzeit **offen**;
die Owner-Auskunft allein ersetzt keinen dieser Beweise. Bis der Check implementiert und
ausgeführt ist, ist die D-05-Verschiebung nur eine Entwicklungspriorisierung, keine Ausnahme vom
Produktions-Gate.

Alle lokalen Seeds verwenden ausschließlich synthetische Praxen und den expliziten lokalen
Testschlüssel. Dieses Dokument enthält weder Produktions-Secrets noch Patientendaten.

## Verbindliche Phase-0-Exit-Gates

Die fünf Kriterien stammen aus `docs/UMSETZUNGSPLAN_2026.md`, Abschnitt 10.

| Gate | Soll-Nachweis | Belegter Stand auf PR-#69-Basis | Status / nächster Beweis |
|---|---|---|---|
| E1 – identische Fakten | Eine Golden-Testpraxis liefert dieselben Fakten in App, API, Bericht und kanonischem PDF; Hash/Manifest stimmen überein. | Golden-Fixture, Worker-PDF-Integritätstests und nativer PDF-Flow existieren. Der Flow prüft das Öffnen/Teilen, aber **nicht** denselben Faktenwert in allen vier Oberflächen in einem Lauf. | `partial`; querschnittlichen Test samt Fixture-ID, Report-ID, Manifest-ID und PDF-Hash ausführen oder ergänzen. |
| E2 – KI ohne Faktenautorität | Manipulierter Modelloutput verändert weder Zahl noch Rechts-/Complianceaussage. | Serverseitige Faktenprojektion und Manipulationstests sind vorhanden; vollständiges `npm run verify` auf dieser Revision grün. | `technical_passed`; fachliche Claim-Freigabe bleibt separat. |
| E3 – kein Grün bei geringer Abdeckung | Fehlende, abgelaufene oder nicht unterstützte Quellen wirken korrekt auf Coverage und Green Gate. | Collection-, Coverage-, Posture- und Dashboard-Contract-Tests im vollständigen `verify` grün. | `partial`; Referenzprofil und reale Sensorgrenzen gerätebasiert nachweisen. |
| E4 – Inventarbeständigkeit | Neustart, Offlinephase und Konfliktsynchronisierung verlieren oder duplizieren nichts. | Lokale verschlüsselte Persistenz und Maestro-Flow `13-inventory-persistence` vorhanden. Die Cloud-/Delta-Synchronisierung ist bis ADR-001 gesperrt. | `blocked`; lokalen Neustart-/Offlinepfad erneut messen, Konfliktsynchronisierung erst nach ADR-001-Freigabe. |
| E5 – Recovery und Geräte | Restore innerhalb freigegebenem RTO, Schlüsselrotation und physische iOS-/Android-Matrix bestanden. | Synthetischer lokaler Restore-Drill 8/8 ist dokumentiert. RTO/RPO, produktionsnahe Recovery, Rotation und physische Gerätematrix sind offen. | `blocked`; D-01/D-02/D-05/D-06/D-07, produktionsnahe Messung und echte Gerätefreigaben erforderlich. |

**Gesamtvotum:** `blocked`. SP3-06 kann technische Teilbeweise sammeln, aber kein Phase-0-Exit
und keine Freigabe für Phase 2 erklären, solange E1, E4 und E5 offen sind.

## Ausführungsregister

| Prüfung | Kommando / Quelle | Evidenzgrenze | Ergebnis dieser Revision |
|---|---|---|---|
| PR #69 | GitHub PR-Gates und Post-Merge-Läufe auf `452dab0` | Quellcode-/CI-Nachweis, keine App-Runtime | PR-CI und Secure SDLC grün; Post-Merge-CI `36429034850` und Secure SDLC `36429035010` grün |
| Projektqualität | `npm run verify` mit Node 22.17.1 | Lint, Typen, Jest; keine native Runtime | grün: 58 Suites, 545 Tests, 2 Snapshots; 6 Tests bewusst übersprungen |
| Full-Suite-Vollständigkeit | `npm test -- --runInBand --runTestsByPath security/__tests__/maestro-flow-manifest.test.ts security/__tests__/maestro-results-gate.test.ts security/__tests__/native-release-config.test.ts` | Beweist Fail-Closed-Harness, nicht 15 native App-Flows | grün: 30/30 Tests außerhalb der Loopback-Sandbox; ein erster Sandboxlauf scheiterte nur am blockierten lokalen Listener |
| Lokaler Recovery-Drill | `npm run recovery:drill` | Setzt den repository-lokalen Supabase-Stack zurück; ausschließlich synthetisch | Referenz 8/8 vor PR #69; Wiederholung auf dieser Revision offen |
| iOS-Simulator | `npm run e2e:app:ios`, dann `npm run e2e:smoke` | Erfordert gestarteten Simulator und Docker; `e2e:smoke` startet/verwaltet den lokalen Teststack selbst | `not_run`: Xcode 26.6 vorhanden, aber kein Simulator gebootet und Docker-Daemon am 28.09.2026 nicht erreichbar; letzter dokumentierter vollständiger Lauf 13/15 vor Harness-Fixes |
| Android/physische Geräte | `npm run e2e:app:android`, `npm run e2e:smoke:android`; echte Gerätematrix separat | Emulator ist kein Beweis für alle realen OS-/Netzwerk-Capabilities | offen |
| Externe Freigaben | SP3-04 SafeScan, SP3-05 KBV-Mapping, ADR-001, SP3-02 D-01…D-10 | Keine technische Simulation ersetzt benannte Owner-Entscheidungen | offen |

Der Full-Suite-Smoke muss genau die **15 namentlich im Manifest festgelegten Flow-Dateien und
JUnit-Testcases** liefern. Entfernte, ersetzte, doppelte oder umbenannte Flows sind Fehler,
auch wenn weiterhin 15 Tests gezählt werden. Die Klartext-PDF-Cache-Prüfung ist auch im
vollständigen Smoke verpflichtend, nicht nur im PDF-Einzellauf.

## Sichere Durchführung der noch offenen lokalen Läufe

1. Vor jedem E2E-Lauf prüfen, dass der lokale Supabase-Stack keine erhaltenswerten Daten enthält.
   `e2e:smoke` und `recovery:drill` setzen die lokale Testdatenbank zurück.
2. Einen Simulator starten, den Development-Build für **diesen Worktree** installieren und
   keinen fremden Metro-Server auf Port 8081 laufen lassen.
3. Den seriellen vollständigen Smoke ausführen. Der Runner startet seinen eigenen Metro-Prozess,
   seedet den kanonischen Testbericht und prüft alle JUnit-Dateien fail-closed.
4. Nur nach 15/15 plus PDF-Cache-Prüfung eine Runtime-Evidenz mit Git-Commit, Xcode-/OS-Version,
   Simulator-ID, Laufzeit, Flow-Ergebnissen und Artefaktpfad eintragen. Fehlgeschlagene Läufe
   bleiben als fehlgeschlagen sichtbar.
5. Die physische iOS-/Android-Matrix und alle Owner-Entscheidungen separat signieren. Bis dahin
   bleiben aktive Scans, produktive Snapshots und Phase-2-Connectoren deaktiviert.

## Unmittelbare Folgeschritte

1. E1 als echte Vier-Oberflächen-Prüfung auf einer Golden-Testpraxis automatisieren.
2. Den vollständigen 15/15-iOS-Simulatorlauf und einen Android-Lauf auf einer kontrollierten
   lokalen Umgebung wiederholen; fehlende Umgebungen als `not_run` dokumentieren.
3. Die 92 KBV-Mappings einzeln durch Healthcare Compliance, Security Architecture und
   Privacy/Legal prüfen; nur unabhängig freigegebene Kontrollen dürfen Claims speisen.
4. SafeScan fachlich/rechtlich/datenschutzrechtlich freigeben, ohne Scanqueue oder Probes vorher
   zu aktivieren.
5. D-05 vor der ersten produktiven Verschlüsselung entscheiden und testen. Es ist vertagt, nicht
   geschlossen.
