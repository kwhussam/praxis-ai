# PraxisShield – aktueller Umsetzungsstand

Stand: 20. August 2026

Aktiver Arbeitszweig: `codex/sp3-01b-sdk52`

Pull Request: #26

Diese Datei ist das kurze operative Übergabeprotokoll zum ausführlichen
`UMSETZUNGSPLAN_2026.md`. Sie beantwortet bei jedem Arbeitspaket drei Fragen:
Was wurde umgesetzt, wie wurde es verifiziert und was kommt als Nächstes?

## Aktuelles Arbeitspaket: SP3-01B – Expo-SDK-52-Verifikation

### Umgesetzt

- `react-native-screens` ist auf die kleinste für React Native 0.77 mit der
  bewusst beibehaltenen Paper-Architektur geeignete Linie `~4.9.0` angehoben;
  der Lockfile-Stand ist 4.9.2. Damit ist die fehlerhafte Elternsuche des
  `RNSScreenContentWrapper` aus 4.8.0 geschlossen.
- Ein Regressionstest bindet Paketversion, Package-Spec und den tatsächlich
  installierten nativen Paper-Fix. Ein stilles Downgrade auf die inkompatible
  4.8-Linie fällt dadurch in `npm run verify` auf.
- Der Expo-Dev-Client-Bootstrap behandelt jetzt auch das einmalige, verspätet
  erscheinende First-Run-Developer-Menu. Dieses Testinfrastrukturproblem wird
  nicht mehr mit einem Produkt- oder Navigationfehler verwechselt.
- Die absichtlich korrigierte `react-native-svg`-Paper-Version ist auch im
  Expo-Doctor-Vertrag vollständig dokumentiert; Expo Doctor bleibt ohne
  pauschale Prüfungsunterdrückung grün.
- Der iOS-Network-Probe hält die React-Native-Bridge vollständig in Objective-C.
  Swift verwendet eigene Promise-Closure-Typen und benötigt dadurch keinen
  React-Import im Bridging Header mehr.
- Clean Prebuild und der native iOS-Build prüfen diesen Vertrag fail-closed.
- Der Maestro-Smoke führt alle Flow-Dateien explizit und seriell aus. Ein fehlender,
  leerer, abgebrochener oder inkonsistenter JUnit-Bericht lässt den Lauf scheitern;
  ein irreführender Erfolg mit null ausgeführten Flows ist damit ausgeschlossen.
- Die normale Maestro-Projektkonfiguration bleibt für manuelle/Cloud-Läufe erhalten;
  der lokale Smoke besitzt eine getrennte Minimal-Konfiguration.
- Der PDF-Flow erzeugt auch im vollständigen Smoke seine kanonische Testevidenz,
  scrollt robust zum Export und prüft weiterhin das Löschen der Klartext-Cachedatei.
- Der Privacy-Owner-Flow erzeugt seine Wegwerfpraxis über die autorisierten
  Backoffice-RPCs, überträgt die Eigentümerschaft und testet danach die echte
  Löschroute. Direkte Service-Role-Tabellenschreibrechte werden nicht vorausgesetzt.
- Nach einem lokalen Datenbankreset wird ein veralteter Kong/GoTrue-Upstream erkannt
  und kontrolliert neu verbunden, bevor Seed-Benutzer geprüft werden.

### Verifiziert

- Clean Expo Prebuild und Native-Konfigurationsprüfung: bestanden.
- Frischer nativer iOS-18.6-Simulator-Build mit `react-native-screens` 4.9.2:
  bestanden, installiert und ohne den früheren `RNSScreenContentWrapper`-Crash.
- Gezielte Regressionsmatrix `01-registration`, `04-onboarding` und
  `12-invitation-auth-handoff`: 3/3 Flows grün.
- Vollständige iOS-Matrix: 15/15 JUnit-Reports grün, 0 Fehler. Nach einem rein
  lokalen Datenträger-/Docker-Ausfall nach Flow 12 wurden nur die noch fehlenden
  Flows 13–15 fortgesetzt und anschließend alle 15 Reports gemeinsam fail-closed
  validiert; kein Produktfehler wurde übersprungen.
- PDF-Export: nativer Öffnen-/Teilen-Pfad grün und anschließend keine
  `PraxisShield-Bericht-*.pdf`-Klartextdatei im iOS-Cache vorhanden.
- `npm run verify`: 52 Suites und 467 Tests grün; 6 bekannte Remote-Tests
  explizit übersprungen.
- Claude-Folgereview: Maestro-Standardkonfiguration ist explizit fail-closed; der lokale
  Auth-Healthcheck unterscheidet normale Kaltstarts von wiederholtem Kong-502; Splash-Ablösung
  und Dependency-Remediation sind durch Regressionstests gebunden.
- Dependency-Gate: grün; 12 genehmigte, zeitlich begrenzte Ausnahmen ausschließlich
  für die Build-Toolchain, keine neue Laufzeit-Ausnahme.
- Expo Doctor 1.20.2: 18/18 Prüfungen grün.

## Nächster Schritt

1. Die GitHub-Gates für Pull Request #26 abwarten, insbesondere
   Android-Release-Compile, Secure SDLC und CodeQL.
2. Pull Request #26 nach grünen Pflichtchecks und abschließendem Review mergen;
   der Merge benötigt eine gesonderte Freigabe.
3. Danach mit dem getrennten SDK-53-Commit beginnen.
4. Die physischen iOS-/Android-Geräte-Smokes aus SP2-06/P0-09 einschließlich
   Android-PDF-Cleanup bleiben verpflichtende Gates vor einer Produktionsfreigabe,
   blockieren nach Product-Owner-Entscheidung aber nicht mehr diesen Merge.

## Bewusste Grenzen

- Der aktuelle Native-Nachweis stammt aus einem iOS-Simulator; reale Geräte sind
  dadurch nicht ersetzt.
- Der lokale Android-Release-Compile wird weiterhin durch CI belegt; ein physisches
  Android-Gerät ist durch Emulator oder CI nicht ersetzt.
- Die physische Gerätematrix ist ausdrücklich verschoben, nicht als bestanden oder
  entfallen markiert; ohne sie darf keine Produktionsfreigabe erfolgen.
- Die parallele UI-Redesign-Arbeit bleibt getrennt und ist nicht Bestandteil dieses
  Pull Requests.
