# PraxisShield – aktueller Umsetzungsstand

Stand: 20. August 2026

Aktiver Arbeitszweig: `codex/sp3-01b-sdk52`

Pull Request: #26

Diese Datei ist das kurze operative Übergabeprotokoll zum ausführlichen
`UMSETZUNGSPLAN_2026.md`. Sie beantwortet bei jedem Arbeitspaket drei Fragen:
Was wurde umgesetzt, wie wurde es verifiziert und was kommt als Nächstes?

## Aktuelles Arbeitspaket: SP3-01B – Expo-SDK-52-Verifikation

### Umgesetzt

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

- Clean Expo Prebuild: bestanden.
- Native-Konfigurationsprüfung: bestanden.
- Nativer iOS-18.6-Simulator-Build: bestanden und installiert.
- Vollständiger Smoke hat tatsächlich alle 15 Flows ausgeführt; fünf echte Fehler
  wurden sichtbar statt als null ausgeführte Tests grün zu erscheinen.
- Die beiden unabhängigen Fehler im PDF- und Privacy-Flow wurden anschließend
  behoben und jeweils im echten iOS-Simulator grün nachgewiesen.
- Die übrigen drei roten Flows `01-registration`, `04-onboarding` und
  `12-invitation-auth-handoff` zeigen denselben nativen Absturz in
  `RNSScreenContentWrapper.attachToAncestorScreenView`.

## Nächster Schritt

1. Den gemeinsamen `react-native-screens`-/Navigation-Absturz der drei betroffenen
   Flows als eigenes, enges Kompatibilitäts-Arbeitspaket reproduzieren und beheben.
2. Danach zuerst nur die drei betroffenen Flows, anschließend alle 15 iOS-Flows
   erneut ausführen. Abnahme: 15 ausgeführte Flows, null Fehler, vollständige und
   konsistente JUnit-Evidenz.
3. Pull Request #26 erst nach grünen GitHub-Checks und diesem iOS-Gate mergen.
4. Anschließend die noch offenen physischen iOS-/Android-Geräte-Smokes aus
   SP2-06/P0-09 sowie den Android-PDF-Cleanup-Smoke durchführen.

## Bewusste Grenzen

- Der aktuelle Native-Nachweis stammt aus einem iOS-Simulator; reale Geräte sind
  dadurch nicht ersetzt.
- Eine Änderung der `react-native-screens`-Version erfolgt erst nach einem
  reproduzierbaren Vergleich, weil ein blindes Up-/Downgrade den SDK-52-Vertrag
  oder andere Navigationspfade beschädigen könnte.
- Die parallele UI-Redesign-Arbeit bleibt getrennt und ist nicht Bestandteil dieses
  Pull Requests.
