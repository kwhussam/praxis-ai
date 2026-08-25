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

- Branch: `codex/sp3-01b-sdk54`, abgezweigt von `origin/main` (`341d60b`, enthält SDK 53 aus
  PR `#29` und die Dependabot-Guardrails aus PR `#32`).
- Die Arbeit liegt in einem separaten Git-Worktree, damit die parallele UI-Redesign-Arbeit im
  Hauptbaum unberührt bleibt.

## Was gemacht wurde

- **SDK-54-Paketgraph installiert und Lockfile erzeugt.** Expo `~54.0.37`, React Native `0.81.5`,
  React `19.1.x`, `expo-router` `6.0.24`, `react-native-screens` `4.16.0`,
  `react-native-gesture-handler` `2.28.0`, `react-native-safe-area-context` `5.6.0`,
  `react-native-svg` `15.12.1`. Werkzeugversionen nachgezogen: `jest-expo` `54.0.18`,
  `@types/react` `19.1.17`, `typescript` `~5.9.2`.
- **Vendor-Patches geprüft und bereinigt.**
  - `expo-modules-core`: Der Patch lag mit der veralteten Zielversion `2.5.0` vor und erzeugte bei
    jedem `postinstall` eine Versionswarnung. Eine Gegenprobe ohne Patch zeigte, dass
    `expo-modules-core@3.0.30` den Nullsicherheitsfehler
    `requestedPermissions!!.contains(permission)` weiterhin enthält – der Patch ist also **nicht**
    obsolet. Er wurde als `patches/expo-modules-core+3.0.30.patch` neu erzeugt; die Warnung entfällt.
  - `@expo/plist`: bleibt erforderlich. `@expo/plist@0.4.9` fordert `@xmldom/xmldom: ^0.8.8`, was in
    den verwundbaren Bereich `<=0.8.12` auflöst. Der Override auf `^0.9.11` ist damit weiterhin
    sicherheitsrelevant, und der Patch hält plist mit der strengeren 0.9-API kompatibel.
- **Reanimated für `newArchEnabled: false` abgesichert.** Installiert ist `3.19.5` statt der von
  SDK 54 vorgeschlagenen `4.1.1`, weil Reanimated 4 die New Architecture zwingend voraussetzt.
  Die Abweichung wird **nicht** über `expo.install.exclude` stummgeschaltet: Der Baseline-Test
  erzwingt `exclude: []`, und diese Guardrail ist beabsichtigt. Die Abweichung bleibt in Expo
  Doctor sichtbar und wird hier begründet.
- **`lib/ai/report-pdf.ts` an einen Breaking Change angepasst.** `expo-file-system` v19 entfernt
  `EncodingType` und `cacheDirectory` aus dem Hauptexport. Der Import wurde verhaltenserhaltend auf
  `expo-file-system/legacy` umgestellt. Die Migration auf die neue `File`/`Directory`-API ist
  bewusst **nicht** Teil dieses Versionssprungs, weil sie Schreib-, Lösch- und Verzeichnislogik
  des PDF-Caches samt Logout-Cleanup anfassen würde.
- **Baseline und Baseline-Tests auf SDK 54 gezogen**, Werte jeweils aus dem erzeugten Lockfile
  statt aus Annahmen.
- **Native Probe an das SDK-54-Template angepasst.** Der Android-Pluginpfad registriert
  `PraxisShieldNetworkProbePackage()` jetzt auch im neuen `PackageList(this).packages.apply {}`-
  Block und bricht fail-closed ab, wenn Import oder Registrierung nicht eindeutig gepatcht werden
  kann. Ein Regressionstest deckt diesen Templatewechsel ab.
- **Android-Zielplattform auf API 36 angehoben.** `compileSdkVersion` und `targetSdkVersion` folgen
  damit dem SDK-54-Stack; `minSdkVersion` bleibt 24.

## Verifikation

| Nachweis | Ergebnis | Einordnung |
|---|---|---|
| `npm ci --offline` | grün | alle Vendor-Patches wenden ohne Warnung an |
| `npm run verify` | grün | 53 Suites / 472 Tests bestanden, 2 Suites / 6 Tests übersprungen |
| Dependency-Gate | grün | vier einzeln dokumentierte, zeitlich begrenzte Build-Toolchain-Ausnahmen; keine Runtime-Ausnahme |
| Expo Doctor 1.20.2 | 17/18 | einzige Abweichung: Reanimated, bewusst und begründet |
| Clean Prebuild | grün | `npx expo prebuild --clean --no-install` |
| Native-Konfigurationsgate | grün | `npm run verify:native-config`, inklusive zusammengeführter Android-Konfiguration |
| iOS-/Android-Produktionsbundles | grün | beide Metro-Exports auf SDK 54 erfolgreich |
| iOS Release-Simulator-Build | grün | arm64, Legacy Architecture, Pods/Swift/ObjC/Hermes und App-Linking erfolgreich |
| iOS Development-Build | grün | kompiliert, signiert, installiert und auf iPhone-16-Plus-Simulator geöffnet |
| iOS-Simulator-Smoke | grün | 15/15 serielle Maestro-Flows, 0 Fehler |
| Android Release-Build lokal | nicht belegt | Gradle-Konfiguration bis API 36/Reanimated erfolgreich; Download von `dl.google.com` lief wiederholt in Netzwerk-Timeouts, kein Compilerfehler beobachtet |

## Offene Befunde

### P3 – Android-Compile muss in CI belegt werden

Der lokale Android-Release-Build erreichte die SDK-54-Konfiguration mit API 36, scheiterte aber
wiederholt an Zeitüberschreitungen beim Abruf der Android-Repositories von `dl.google.com`. Das ist
kein beobachteter Compilerfehler, aber auch kein bestandener Buildnachweis. Der PR darf deshalb erst
gemergt werden, wenn der CI-Job `android-release-compile` auf diesem Commit grün ist.

### P3 – `expo-file-system`-Legacy-Import ist technischer Rückstand

Der Legacy-Einstiegspunkt ist von Expo unterstützt, aber endlich. Die Migration des PDF-Caches auf
die neue `File`/`Directory`-API braucht ein eigenes Arbeitspaket mit eigenem Nachweis, weil sie den
  sicherheitsrelevanten Cache-Cleanup berührt.

### P4 – React Test Renderer bleibt vorerst auf 19.0

`react-test-renderer` ist reine Test-Infrastruktur, akzeptiert React 19.1 über seinen Peer-Bereich
und die vollständige Jest-Suite ist damit grün. Die ohnehin vorgesehene Ablösung des veralteten
Renderers bleibt ein getrenntes Arbeitspaket und berührt weder App-Bundle noch Native Runtime.

### P4 – Reanimated bleibt in Expo Doctor rot

Beabsichtigt: Reanimated 4 verlangt die New Architecture, `newArchEnabled` ist `false`. Der rote
Doctor-Check ist der ehrliche Zustand und wird nicht per `install.exclude` unterdrückt – die
Baseline verbietet das ausdrücklich. Die Abweichung ist im `riskRegister` als
`reanimated_legacy_architecture_pin` geführt (severity `high`, status
`accepted_visible_deviation_no_install_exclude`) und dort begründet. Sie löst sich erst mit der
New-Architecture-Migration auf.

## Als Nächstes

1. SDK-54-Änderung committen, Branch pushen und einen eigenen PR gegen `main` erstellen.
2. CI/Secure SDLC vollständig abwarten; besonders `android-release-compile` ist der noch fehlende
   native Nachweis und bleibt Merge-Gate.
3. Unabhängiges Review ohne offene P1/P2 und ohne unakzeptierten P3-Befund einholen.
4. Nach grünem Merge die nächste getrennte Stufe `sdk54_new_arch` beginnen. Dort Reanimated 4,
   `newArchEnabled: true` und die Entfernung der sichtbaren Doctor-Abweichung gemeinsam migrieren.
5. Die neue `expo-file-system`-`File`/`Directory`-API und die Ablösung von
   `react-test-renderer` als getrennte Folgepakete planen, nicht in die New-Architecture-Umstellung
   hineinmischen.

## Abnahmekriterium für den nächsten Schritt

- PR-CI und Secure-SDLC-Gates vollständig grün;
- Expo Doctor ohne andere Abweichung als das dokumentierte Reanimated-Pin;
- `android-release-compile` in CI erfolgreich;
- vorhandener serieller iOS-Simulator-Smoke 15/15 grün und im PR dokumentiert;
- keine SDK-Änderung mit der UI-Redesign-Arbeit vermischt.
