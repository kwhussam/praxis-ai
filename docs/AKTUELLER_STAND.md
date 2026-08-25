# PraxisShield – Aktueller Stand

Stand: 2026-08-25

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
- Arbeitsstand ist **nicht committet**. Die Arbeit liegt in einem separaten Git-Worktree, damit
  die parallele UI-Redesign-Arbeit im Hauptbaum unberührt bleibt.

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
| `npm run verify` | grün: 485 Tests bestanden, 6 übersprungen | neue New-Architecture-, Doctor-, Persistenz- und WLAN-Probe-Evidenzverträge eingeschlossen |
| Expo Doctor 1.20.2 | **18/18, keine Beanstandungen** | die bisher sichtbare Reanimated-Abweichung entfällt |
| Clean Prebuild | grün | `newArchEnabled` in beiden Generaten belegt |
| `verify:native-config` | grün | |
| iOS-/Android-Bundles | grün | belegt, dass Reanimated 4 mit dem Worklets-Babel-Plugin sauber transformiert |
| **iOS Release-Build** | **grün** | `** BUILD SUCCEEDED **` unter New Architecture |
| Android Release-Build | nicht belegbar | lokal fehlt das SDK-Paket `platforms;android-36` |
| iOS-Simulator-Smoke | offen | nicht ausgeführt |

Der grüne iOS-Release-Build belegt zugleich, dass die Reanimated-4-/Worklets-Pods, der
Fabric-/TurboModule-Codegen und die native Probe mit ihrer Legacy-Bridge unter der
Interop-Schicht **auf Compile-Ebene** tragen.

## Offene Befunde

### P2 – Laufzeitnachweis der nativen Probes fehlt

Der Registereintrag `custom_network_probe_bridge` bleibt offen. Der iOS-Build belegt nur, dass die
Legacy-Bridge-Module unter Interop **kompilieren**. Ob sie zur Laufzeit Daten liefern, zeigt erst
der Smoke.

**Wichtig für die Auswertung:** Ein grüner WLAN-Flow allein beweist das nicht. Der E2E-Vertrag liest
deshalb die persistierte `nativeProbeEvidence` und verlangt für TCP und SSDP jeweils
`status: collected`, `source: measured` und mindestens einen Messwert. Ein beliebiger grüner
NetInfo-/WLAN-Sensor reicht nicht; fehlende Module, leere Ergebnisse und Probe-Fehler brechen den
Flow fail-closed ab. Der tatsächliche Lauf dieses verschärften Vertrags steht noch aus.

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

1. Seriellen iOS-Simulator-Smoke ausführen (15/15) und dabei gezielt WLAN, verschlüsselte
   Inventarpersistenz, SecureStore, PDF-Cache und Logout prüfen. Bei WLAN den
   persistierte `nativeProbeEvidence` auswerten, nicht nur das Flow-Ergebnis.
2. Commit, Push, PR gegen `main`, CI und unabhängiges Review.
3. `android-release-compile` in CI als Merge-Gate abwarten.
4. Erst nach grünem Merge die isolierte SDK-55-Stufe beginnen.

## Bewusste Grenzen

- Die physische iOS-/Android-Gerätematrix bleibt wie vereinbart für das spätere
  Produktionsfreigabe-Gate zurückgestellt.
- Der lokale Datenträger lief während dieser Stufe zweimal voll. Die dadurch abgebrochenen Builds
  sind keine Migrationsbefunde; sie wurden nach Freigabe von Speicherplatz wiederholt.

## Abnahmekriterium für den nächsten Schritt

- serieller iOS-Simulator-Smoke 15/15 grün, native TCP-/SSDP-Probe-Evidenz ausgewertet;
- `npm run verify`, `verify:native-config` und Expo Doctor 18/18 grün;
- iOS Release-Build grün, `android-release-compile` in CI grün;
- keine New-Architecture-Änderung mit der UI-Redesign-Arbeit vermischt.
