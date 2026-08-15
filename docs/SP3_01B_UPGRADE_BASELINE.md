# SP3-01B Phase 2 – Mobile Upgrade Baseline

Stand: 2026-08-15
Status: `in_progress`

## Ziel

Die SDK-Migration darf nicht allein durch einen erfolgreichen Compile als bestanden gelten. Diese
Baseline bindet jeden direkten Laufzeitbaustein, jedes Config-Plugin und die sicherheitskritischen
Produktverträge an einen reproduzierbaren Ausgangsstand. Die maschinenlesbare Quelle ist
`security/mobile-upgrade-baseline.json`; ihr Regressionstest läuft in `npm run verify`.

## Belegter Ausgangsstand

| Bereich | Baseline |
|---|---|
| Expo / React Native / React | SDK 51.0.39 / RN 0.74.5 / React 18.2.0 |
| Architektur | Legacy Architecture; kein stilles Aktivieren während eines SDK-Schritts |
| Android | min API 23, compile/target API 35 |
| iOS | Deployment Target 15.1 |
| Toolchain | Node 22.x, npm 10.9.2 |
| Expo Doctor 1.20.2 | 17/18 Prüfungen grün; React-Native-Directory-Prüfung grün |
| Offener Doctor-Befund | SDK 51 unterstützt offiziell höchstens Xcode 16.2; lokal ist Xcode 16.4 installiert |

Vor Erfassung der Baseline wurden drei echte Projektfehler geschlossen:

1. `expo-font` ist jetzt direkte Abhängigkeit und Config-Plugin, wie von `@expo/vector-icons`
   gefordert. Damit droht außerhalb von Expo Go kein fehlendes natives Peer-Modul.
2. NetInfo und Safe Area Context sind exakt auf die von SDK 51 erwarteten Versionen fixiert.
3. Das nicht schemafähige Feld `android.usesCleartextTraffic` wurde aus der dynamischen Expo-Config
   entfernt. Lokaler Android-E2E-Klartext ist nun nur bei der doppelten Bedingung
   `EXPO_PUBLIC_APP_ENV=test` plus `PRAXISSHIELD_ALLOW_LOCAL_CLEARTEXT=1` möglich. Jeder andere Build
   bleibt fail-closed bei `false`; das Release-Manifest-Gate prüft dies weiterhin.

Der verbleibende Xcode-Befund wird nicht unterdrückt. Er wird durch den ersten SDK-Schritt behoben;
bis dahin gelten die bereits vorhandenen iOS-Buildbelege, und jeder neue iOS-Nachweis nennt die
abweichende Toolchain ausdrücklich.

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

## Offene Entscheidungen vor Phase 3

1. Product Owner bestätigt Android 7/API 24 als neue Mindestversion ab SDK 52.
2. Product Owner bestätigt iOS 16.4 als Mindestversion für das finale SDK 57.
3. Mobile/Security entscheiden nach dem SDK-54-New-Arch-Smoke, ob die eigene Network Probe über
   Interop verbleiben darf oder vor SDK 55 als typed TurboModule neu gebaut wird.
4. Ein physisches Android-Gerät und ein physisches iOS-Gerät werden für die Golden-Smokes benannt.
5. Xcode 26.4 wird vor dem SDK-56/57-iOS-Gate bereitgestellt; Node erfüllt ab SDK 57 mindestens
   22.13.

## Verifikation dieses Baseline-Commits

- `npm run verify`: 51 Suites und 450 Tests grün; 6 bekannte Remote-Tests explizit übersprungen.
- `npm run security:dependencies`: grün; 13 bereits genehmigte, zeitlich begrenzte
  Build-Toolchain-Ausnahmen, keine neue High-/Critical-Abhängigkeit.
- Expo Public Config: schemafähig; `expo-font`, Plattformgrenzen und sämtliche lokalen Plugins
  werden korrekt aufgelöst.
- Clean Prebuild und `npm run verify:native-config`: iOS-/Android-Projekte reproduzierbar und alle
  Native-Sicherheitsverträge grün.
- Der lokale Android-Release-Compile konnte nicht gestartet werden, weil auf dem Host kein JDK
  installiert ist. Er bleibt deshalb ein zwingendes CI-Gate nach dem Push und darf nicht als lokal
  bestanden gewertet werden.

## Primärquellen

- <https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/>
- <https://docs.expo.dev/guides/new-architecture/>
- <https://docs.expo.dev/versions/latest/>
- <https://expo.dev/changelog/2024-11-12-sdk-52>
- <https://expo.dev/changelog/xcode-16-3-patches>
- <https://expo.dev/changelog/sdk-54>
- <https://expo.dev/changelog/sdk-56>
- <https://reactnative.dev/blog/2024/10/23/release-0.76-new-architecture>
- <https://reactnative.dev/blog/2026/04/07/react-native-0.85>
