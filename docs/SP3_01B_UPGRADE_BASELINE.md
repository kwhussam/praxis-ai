# SP3-01B – Mobile Upgrade Baseline

Stand: 2026-08-20
Status: `verification`

## Ziel

Die SDK-Migration darf nicht allein durch einen erfolgreichen Compile als bestanden gelten. Diese
Baseline bindet jeden direkten Laufzeitbaustein, jedes Config-Plugin und die sicherheitskritischen
Produktverträge an einen reproduzierbaren Ausgangsstand. Die maschinenlesbare Quelle ist
`security/mobile-upgrade-baseline.json`; ihr Regressionstest läuft in `npm run verify`.

## Belegter SDK-52-Zwischenstand

| Bereich | Baseline |
|---|---|
| Expo / React Native / React | SDK 52.0.49 / RN 0.77.3 / React 18.3.1 |
| Architektur | Legacy Architecture explizit mit `newArchEnabled: false`; kein stilles Aktivieren |
| Android | min API 24, compile/target API 35 |
| iOS | Deployment Target 15.1 |
| Toolchain | Node 22.x, npm 10.9.2 |
| Expo Doctor 1.20.2 | 18/18 Prüfungen grün; React-Native-Directory-Prüfung grün |
| Offener Doctor-Befund | keiner |

Die zuvor dokumentierte SDK-51-Baseline wurde vor der Migration vollständig grün belegt. Im ersten
isolierten Migrationsschritt wurden zusätzlich folgende Punkte umgesetzt:

1. Expo SDK 52 nutzt die offiziell unterstützte React-Native-0.77-Variante, damit Xcode 16.3+
   unterstützt wird; Expo Go ist für diese Kombination ausdrücklich kein Prüfgate, Dev Builds sind
   maßgeblich.
2. Android 7/API 24 ist als freigegebene Mindestversion konfiguriert. Das iOS-Zwischenziel bleibt
   15.1; iOS 16.4 ist für das finale SDK-57-Ziel freigegeben.
3. Die New Architecture bleibt für diese Stufe explizit deaktiviert. Ihre Aktivierung erfolgt erst
   im getrennten SDK-54-Commit, damit Architektur- und SDK-Regressionen nicht vermischt werden.
4. React Navigation 7 verwendet `tabBarButtonTestID`; die bestehenden stabilen E2E-Identifier
   bleiben unverändert. Expo Router 4 ersetzt den früher gepatchten Splash-Startpfad durch eine
   optionale Native-Module-Auflösung und `internalPreventAutoHideAsync`; ein Vendor-Code-Test bindet
   diese Ablösung fail-closed. Der Expo-51-Splash-Patch ist deshalb nicht mehr anwendbar. Die
   weiterhin nötigen plist- und Android-Permission-Härtungen sind versionsgenau erneuert.
5. `expo-asset` ist direkte SDK-52-Abhängigkeit und Config-Plugin. Ohne sie bestand der TypeScript-
   und Jest-Pfad, aber der echte iOS-Release-Bundler brach fail-closed ab.
6. Der erste Android-Release-Build in PR #26 deckte auf, dass Expos SDK-52-Standardversion
   `react-native-svg` 15.8.0 unter React Native 0.77/Paper noch die entfernte
   `BaseViewManagerInterface` referenziert. Die Abhängigkeit ist deshalb exakt auf 15.12.1
   angehoben; 15.13.0+ bleibt ausgeschlossen, weil diese Linie React Native 0.78+ voraussetzt.
   Ein Regressionstest prüft zusätzlich den tatsächlich installierten Paper-Delegate.
7. Der echte iOS-Smoke deckte eine zweite Architekturgrenze auf: `react-native-screens` 4.8.0
   unterstützt RN 0.77 nur mit Fabric vollständig. Für die bewusst beibehaltene Paper-
   Architektur ist 4.9 die erste kompatible Linie. Version 4.9.2 enthält den Upstream-Fix für
   die falsche Elternsuche des `RNSScreenContentWrapper`; ein Regressionstest bindet sowohl
   die Versionslinie als auch den tatsächlich installierten nativen Fix.

Der frühere Xcode-Befund ist durch React Native 0.77 geschlossen und wird nicht durch eine
Doctor-Ausnahme unterdrückt. Die fünf von Expo für RN 0.77 benannten Paketabweichungen sowie die
oben begründete `react-native-svg`-Paper-Korrektur stehen explizit in `expo.install.exclude`; der
Regressionstest fixiert diese eng begrenzte Liste.

Die zwölf verbleibenden High-/Critical-Ausnahmen sind ausdrücklich kein durch SDK 52 erledigter
Rückstand. Ihre maschinenlesbare Policy verweist auf den gestuften SDK-53-bis-57-Plan mit Zieltermin
07.09.2026 und unverändertem Hard-Expiry 13.09.2026. Jede auf einer Zwischenstufe behobene Ausnahme
muss unmittelbar entfernt werden; das Gate akzeptiert keine pauschale Verlängerung.

## Revidierte Zielentscheidung

Der frühere Plan endete bei SDK 56. Das ist am 15.08.2026 nicht mehr sachgerecht:

- Expo führt SDK 57 mit React Native 0.86 und React 19.2.3 als aktuelle Linie.
- SDK 56 dokumentiert eine Hermes-v1-/Reanimated-Speicherregression; Expo empfiehlt betroffenen
  Anwendungen den Wechsel auf SDK 57.
- Expo empfiehlt SDK-Upgrades ausdrücklich inkrementell und einzeln.

Darum gilt folgende Commit- und Gatefolge:

`SDK 51 → 52 → 53 → 54 Legacy → 54 New Architecture → 55 → 56 Übergang → 57 Ziel`

SDK 56 erhält einen Compile-/Testnachweis, aber keine Produktionsfreigabe. Jeder Pfeil ist ein
eigener Commit. Nach einem roten Gate beginnt keine nächste Stufe.

SDK 52 verwendet dabei bewusst die von Expo unterstützte React-Native-0.77-Variante statt der
ursprünglichen 0.76-Vorgabe: React Native 0.77 behebt die Xcode-16.3+-Inkompatibilität der älteren
Linie und erlaubt damit einen belastbaren Build auf der vorhandenen Xcode-16.4-Toolchain.

## Kritische Migrationsrisiken

| Risiko | Sicherheitsrelevanz | Verbindliches Gate |
|---|---|---|
| SecureStore, SQLite, AES und Crypto | Verlust, Offenlegung oder Vermischung praxisgebundener Daten | Verschlüsselungs-, Neustart-, Logout- und Zwei-Praxis-Tests je Stufe; physische Geräte vor Release |
| WLAN, NetInfo und `react-native-wifi-reborn` | falsche Coverage oder überbreite Berechtigungen | Permission-/Coverage-Vertrag plus physischer Android-/iOS-Smoke |
| Eigene Swift-/ObjC-/Kotlin-Probe | Legacy Bridge kann unter New Architecture nur über Interop laufen | SDK-54-New-Arch-Build und Funktionssmoke; andernfalls typed TurboModule vor SDK 55 |
| `expo-file-system` und PDF-Cache | SDK 54 ändert Standard-API, SDK 56 copy/move-Semantik | PDF-Öffnen, Cache-Cleanup, Logout und Praxiswechsel je betroffener Stufe |
| Expo Router plus React Navigation | SDK 56 entkoppelt beide Systeme | direkte Nutzung inventarisieren; ungenutzte direkte Dependency vor SDK 56 entfernen |
| Reanimated/Moti/Hermes | New-Architecture-Zwang und SDK-56-Speicherregression | SDK 56 nur Übergang; Memory-/Start-Smoke auf SDK 57 |
| Icons und Fonts | `@expo/vector-icons` wird ab SDK 56 abgelöst | Codemod/Migration vor finaler Freigabe, visueller Snapshot und Font-Load-Smoke |
| Plattformgrenzen | Android 6 und später iOS 15 entfallen | Product-Owner-Freigabe, Nutzungs-/Gerätematrix und Supportkommunikation |

## Golden Baseline

Vor und nach jeder SDK-Stufe müssen mindestens bestehen:

- Lint, TypeScript und sämtliche Jest-Verträge;
- Expo Doctor einschließlich React Native Directory;
- Clean Prebuild aus ausschließlich eingecheckten Config-Plugins;
- iOS-Entitlements, Purpose Strings und native Probe-Einbindung;
- Android Backup-/Transfer-Ausschluss, Permissions, kein Klartext und kein Debug-Signing;
- unsignierter Android-Release-Compile und iOS-Release-Build;
- verschlüsselte Inventarpersistenz, Mandantenwechsel, Logout und Secure Auth Storage;
- WLAN-Coverage einschließlich `unsupported`/`unavailable`;
- kanonischer PDF-Pfad und Cache-Cleanup;
- Dashboard-Posture und Coverage ohne semantische Drift.

Die exakten Testpfade und Befehle stehen versioniert in der JSON-Baseline. Ein entferntes Paket,
Plugin, Test-Gate oder eine Versionsänderung ohne gleichzeitige Baselineentscheidung lässt den
Regressionstest fehlschlagen.

## Entscheidungen und verbleibende externe Gates

1. Product Owner hat Android 7/API 24 als neue Mindestversion ab SDK 52 bestätigt.
2. Product Owner hat iOS 16.4 als Mindestversion für das finale SDK 57 bestätigt.
3. Mobile/Security entscheiden nach dem SDK-54-New-Arch-Smoke, ob die eigene Network Probe über
   Interop verbleiben darf oder vor SDK 55 als typed TurboModule neu gebaut wird.
4. Die physischen Android-/iOS-Golden-Smokes sind durch Product-Owner-Entscheidung auf das
   Produktionsfreigabe-Gate verschoben. Sie blockieren den SDK-52-PR-Merge nicht, bleiben aber vor
   jedem produktiven Release zwingend und dürfen bis dahin nicht als bestanden markiert werden.
5. Xcode 26.4 wird vor dem SDK-56/57-iOS-Gate bereitgestellt; Node erfüllt ab SDK 57 mindestens
   22.13.

## Verifikation des SDK-52-Commits

- `npm run verify`: 52 Suites und 467 Tests grün; 6 bekannte Remote-Tests explizit übersprungen.
- `npm run security:dependencies`: grün; 12 bereits genehmigte, zeitlich begrenzte
  Build-Toolchain-Ausnahmen, keine neue High-/Critical-Abhängigkeit. Die behobene
  `turbo-stream`-Ausnahme wurde fail-closed als veraltet erkannt und entfernt.
- Expo Doctor 1.20.2: 18/18 Prüfungen einschließlich React Native Directory grün; keine
  unterdrückte Prüfung und kein offener Toolchain-Befund.
- Expo Public Config: schemafähig; `expo-font`, Plattformgrenzen und sämtliche lokalen Plugins
  sowie das für Release-Bundles erforderliche `expo-asset` werden korrekt aufgelöst.
- Clean Prebuild und `npm run verify:native-config`: iOS-/Android-Projekte reproduzierbar und alle
  Native-Sicherheitsverträge grün.
- Frischer nativer iOS-Simulator-Build: `BUILD SUCCEEDED`, einschließlich React Native 0.77.3,
  `react-native-screens` 4.9.2, Hermes, ExpoAsset und aller nativen Netzwerkmodule.
- Die gezielte iOS-Regressionsmatrix `01-registration`, `04-onboarding` und
  `12-invitation-auth-handoff` ist 3/3 grün. Die vollständige Matrix besitzt 15/15 gemeinsam
  validierte JUnit-Reports, null Fehler; der frühere `RNSScreenContentWrapper`-Absturz trat nicht
  erneut auf.
- Der native PDF-Export ist grün; nach dem Share-Dialog verblieb keine Klartext-PDF im iOS-Cache.
- Der Android-Release-Compile bleibt ein zwingendes GitHub-Gate nach dem Push. Der lokale
  iOS-Simulatornachweis und statische Paper-Regressionstests ersetzen weder dieses Gate noch einen
  physischen Android-Gerätesmoke.

## Primärquellen

- <https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/>
- <https://docs.expo.dev/guides/new-architecture/>
- <https://docs.expo.dev/versions/latest/>
- <https://expo.dev/changelog/2024-11-12-sdk-52>
- <https://expo.dev/changelog/2025-01-21-react-native-0.77>
- <https://expo.dev/changelog/xcode-16-3-patches>
- <https://expo.dev/changelog/sdk-54>
- <https://expo.dev/changelog/sdk-56>
- <https://reactnative.dev/blog/2024/10/23/release-0.76-new-architecture>
- <https://reactnative.dev/blog/2026/04/07/react-native-0.85>
- <https://github.com/software-mansion/react-native-svg/issues/2814>
- <https://github.com/software-mansion/react-native-svg#supported-react-native-versions>
- <https://github.com/software-mansion/react-native-screens/releases/tag/4.9.0>
- <https://github.com/software-mansion/react-native-screens#supported-react-native-version>
