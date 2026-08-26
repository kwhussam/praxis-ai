# PraxisShield – Aktueller Stand

Stand: 2026-08-26

Diese Datei ist die kompakte operative Übergabe. Sie beantwortet nach jedem Arbeitspaket:

1. Was wurde gemacht?
2. Welche Nachweise sind grün oder rot?
3. Welche Befunde sind offen?
4. Was ist der nächste konkrete Schritt?

Der normative Umfang und die langfristige Reihenfolge bleiben in
`docs/UMSETZUNGSPLAN_2026.md`. Diese Datei ersetzt den Umsetzungsplan nicht.

## Aktueller Arbeitskontext

- Stufe: `sdk54_new_arch` – isolierte Aktivierung der New Architecture auf dem stabilen
  SDK-54-Stand. **Kein SDK-55-Upgrade.**
- Branch: `codex/sp3-01b-sdk54-new-arc`, abgezweigt von `origin/main` (`9ee2b48`, enthält den
  gemergten SDK-54-Legacy-Stand aus PR `#37`).
- Die Umsetzung liegt in einem separaten Git-Worktree, damit die parallele UI-Redesign-Arbeit im
  Hauptbaum unberührt bleibt.

## Was gemacht wurde

- **New Architecture aktiviert.** `app.json` setzt `newArchEnabled: true`. Der Clean Prebuild
  reicht die Einstellung nachweislich in beide Generate durch:
  `ios/Podfile.properties.json` enthält `"newArchEnabled": "true"`, `android/gradle.properties`
  enthält `newArchEnabled=true`. Das wurde ausdrücklich geprüft, weil eine nur in `app.json`
  gesetzte Flag einen unbemerkten Legacy-Build erzeugen würde, den alle Tests bestehen.
- **Reanimated 3 durch Reanimated 4 mit Worklets ersetzt.** Der deklarierte Paketbereich ist
  `react-native-reanimated: ~4.1.1`, aufgelöst wird daraus laut Lockfile `4.1.7`; dazu
  `react-native-worklets@0.5.1`. Reanimated 4 verlangt
  Worklets als eigenständiges Peer-Paket ab Version 0.5.0.
- **Babel-Plugin umgestellt.** `react-native-reanimated/plugin` → `react-native-worklets/plugin`.
  Ohne diesen Wechsel kompiliert der Build meist weiter, aber Worklets laufen zur Laufzeit auf dem
  JS-Thread statt auf dem UI-Thread – ein Fehler, der weder im Build noch im Test auffällt.
- **Baselineverträge auf den neuen Sollzustand gedreht**, nicht gelockert:
  `current.newArchitecture` von `explicitly_disabled` auf `explicitly_enabled`, die Zusicherung
  `appConfig.newArchEnabled` von `false` auf `true`, `react-native-worklets` in die
  architektursensitiven Pakete aufgenommen.
- **Risikoeintrag `reanimated_legacy_architecture_pin` entfernt.** Seine Begründung – Reanimated 4
  verlangt die New Architecture, die aber deaktiviert war – entfällt mit dieser Stufe. Deshalb
  meldet Expo Doctor jetzt 18/18 statt 17/18.

## Verifikation

| Nachweis | Ergebnis | Einordnung |
|---|---|---|
| `npm ci` | grün | |
| `npm run verify` | grün: 487 Tests bestanden, 6 übersprungen | neue New-Architecture-, Doctor-, Persistenz- und WLAN-Probe-Evidenzverträge eingeschlossen |
| Expo Doctor 1.20.2 | **18/18, keine Beanstandungen** | die bisher sichtbare Reanimated-Abweichung entfällt |
| Clean Prebuild | grün | `newArchEnabled` in beiden Generaten belegt |
| `verify:native-config` | grün | |
| iOS-/Android-Bundles | grün | belegt, dass Reanimated 4 mit dem Worklets-Babel-Plugin sauber transformiert |
| **iOS Release-Build** | **grün** | `** BUILD SUCCEEDED **` unter New Architecture |
| Android Release-Build | nicht belegbar | lokal fehlt das SDK-Paket `platforms;android-36` |
| iOS-Simulator-Smoke | **alle 15 Flow-Pfade grün belegt** | 14/15 im vollständigen seriellen Lauf; danach bestand der allein fehlgeschlagene Flow 06 mit dem selbstständigen Runner `e2e:wlan:ios` in 5:22 Minuten. Zwischen beiden Nachweisen wurde nur der WLAN-Testvertrag/Runner korrigiert, kein Produktcode. Das ist transparente zusammengesetzte Evidenz und kein einzelner nachträglicher 15/15-Gesamtlauf. |

Der grüne iOS-Release-Build belegt zugleich, dass die Reanimated-4-/Worklets-Pods, der
Fabric-/TurboModule-Codegen und die native Probe mit ihrer Legacy-Bridge unter der
Interop-Schicht **auf Compile-Ebene** tragen.

## Offene Befunde

### Geschlossen – iOS-Laufzeitnachweis der nativen Probes

Der fokussierte WLAN-Smoke belegt die Swift-/Objective-C-Bridge unter der New-Architecture-
Interop-Schicht zur Laufzeit. Die anschließend aus der lokalen Datenbank gelesene
`nativeProbeEvidence` enthält für TCP `status: collected`, `source: measured`, elf Messwerte und
für SSDP `status: collected`, `source: measured`, einen Messwert. Damit kann weder NetInfo noch ein
synthetischer/leerer Rückgabewert diesen Nachweis erzeugt haben.

Der Coverage-Score des Simulators bleibt erwartungsgemäß `0`/`insufficient`, weil ein iOS-Simulator
kein reales WLAN und keine physische Gerätenachbarschaft bereitstellt. Das ist eine korrekt
ausgewiesene Plattformgrenze und kein Fehler der nativen TCP-/SSDP-Bridge. Der entsprechende
Android-Kotlin-Laufzeitnachweis bleibt Bestandteil des späteren physischen Geräte-Gates.

### P3 – Android-Compile muss in CI belegt werden

Der lokale Android-Release-Build scheitert an `Failed to find Platform SDK with path:
platforms;android-36`. Das ist eine fehlende Umgebungsvoraussetzung, kein Compilerfehler.
Nachladbar mit `sdkmanager "platforms;android-36"`; verbindlicher Nachweis bleibt der CI-Job
`android-release-compile`. Derselbe Vorbehalt galt bereits in PR `#37`.

### P3 – `ios/build` ist unter New Architecture kein reiner Cache mehr

Der Fabric-/TurboModule-Codegen legt seine Artefakte unter `ios/build/generated/` ab, und das
Pods-Ziel `ReactCodegen` referenziert sie als Eingabedateien. Ein Aufräumen von `ios/build`, das
unter der Legacy-Architektur folgenlos war, bricht den Build mit
`Build input file cannot be found: …/States.cpp`. Wiederherstellung über `pod install`.
Aufräumroutinen und Buildanleitungen müssen das berücksichtigen.

### P3 – `expo-file-system`-Legacy-Import bleibt technischer Rückstand

Unverändert aus der SDK-54-Stufe: Die Migration des PDF-Caches auf die neue `File`/`Directory`-API
braucht ein eigenes Arbeitspaket, weil sie den sicherheitsrelevanten Cache-Cleanup berührt.

### P4 – React Test Renderer bleibt vorerst auf 19.0

Unverändert: reine Test-Infrastruktur, getrenntes Arbeitspaket.

## Als Nächstes

1. Branch pushen und PR gegen `main` eröffnen; CI und unabhängiges Review abwarten.
2. `android-release-compile` in CI als Merge-Gate prüfen. Damit wird der lokal wegen des fehlenden
   Android-SDK-Pakets offene Compile-Nachweis geschlossen.
3. Nach grüner CI und Review mergen und `docs/AKTUELLER_STAND.md` auf dem Merge-Stand aktualisieren.
4. Erst danach die isolierte SDK-55-Stufe beginnen.

## Bewusste Grenzen

- Die physische iOS-/Android-Gerätematrix bleibt wie vereinbart für das spätere
  Produktionsfreigabe-Gate zurückgestellt.
- Der lokale Datenträger lief während dieser Stufe zweimal voll. Die dadurch abgebrochenen Builds
  sind keine Migrationsbefunde; sie wurden nach Freigabe von Speicherplatz wiederholt.

## Abnahmekriterium für den nächsten Schritt

- alle 15 iOS-Simulator-Flow-Pfade grün belegt und native TCP-/SSDP-Probe-Evidenz ausgewertet;
- `npm run verify`, `verify:native-config` und Expo Doctor 18/18 grün;
- iOS Release-Build grün, `android-release-compile` in CI grün;
- keine New-Architecture-Änderung mit der UI-Redesign-Arbeit vermischt.
