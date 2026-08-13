# SP2-06 – Native Permission- und Release-Build-Härtung

Stand: 2026-08-13
Status: `verification`

## Ziel und Sicherheitsvertrag

Ein Release darf seine nativen Fähigkeiten nicht aus manuell gepflegten, von Git ignorierten
`ios/`- oder `android/`-Dateien beziehen. `app.json` und die eingecheckten Expo-Config-Plugins sind
die einzige Buildquelle. Ein Clean-Prebuild muss daraus beide Plattformen vollständig reproduzieren
und die CI muss die erzeugten Artefakte fail-closed prüfen.

## iOS

- `com.apple.developer.networking.wifi-info` wird explizit erzeugt. Ohne dieses Entitlement kann
  `CNCopyCurrentNetworkInfo` den verbundenen WLAN-Namen trotz Location-Freigabe nicht zuverlässig
  liefern.
- Location- und Local-Network-Nutzung besitzen enge deutschsprachige Zwecktexte. Beliebige ATS-
  Freigaben bleiben aus; lokaler Netzwerkverkehr ist gesondert zugelassen.
- Die bisher deklarierten Bonjour-Services wurden entfernt. PraxisShield browsed keine Bonjour-
  Service-Typen, sondern verwendet begrenzte TCP- und SSDP-Probes über `Network.framework`.
  Nicht verwendete Service-Claims wären unnötig breit und im Privacy-Dialog irreführend.
- Swift-Probe, Objective-C-Bridge, Bridging Header und Xcode-Build-Sources werden jetzt vollständig
  vom eingecheckten Plugin erzeugt. Ein frischer Checkout verliert die Capability nicht mehr.
- Öffentliche iOS-APIs liefern keinen allgemeinen Scan sichtbarer WLANs und keine WPA-
  Capability-Liste. Diese Sensoren bleiben deshalb ausdrücklich `unsupported`; das ist kein
  negativer Sicherheitsbefund und kann die Coverage nie künstlich erfüllen.

## Android

- Ziel-SDK und Compile-SDK sind 35, Minimum ist API 23.
- `ACCESS_FINE_LOCATION` bleibt erforderlich, weil PraxisShield `WifiManager.getScanResults()`
  nutzt. Ab API 33 wird zusätzlich `NEARBY_WIFI_DEVICES` angefordert. `neverForLocation` erklärt,
  dass PraxisShield aus Nearby-Wi-Fi-Daten keine physische Position ableitet; es ersetzt die für
  Scan-Ergebnisse weiterhin erforderliche Fine-Location-Berechtigung nicht.
- `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE` und `SYSTEM_ALERT_WINDOW` werden über
  Manifest-Merger-Removal-Einträge aus dem Release entfernt. Kein Praxisinventar oder Report
  benötigt allgemeinen externen Speicher oder Overlay-Rechte.
- `allowBackup=false`; zusätzlich schließen Legacy-Backup-Regeln und Android-12+-Data-Extraction-
  Rules alle Credential- und Device-Protected-Domains sowohl von Cloud-Backup als auch
  Geräteübertragung aus. Damit hängt der Schutz nicht allein vom OEM-Verhalten zu `allowBackup` ab.
- Klartextverkehr ist im App-Manifest deaktiviert. Die lokale Netzwerkerhebung muss unterstützte
  sichere Transportpfade nutzen oder eine technisch begrenzte Messung als solche kennzeichnen.
- Der Expo-Template-Fallback, ein Release mit dem öffentlichen Debug-Keystore zu signieren, wird
  beim Prebuild entfernt. Produktionssignierung darf nur der geschützte CI-/EAS-Credential-
  Provider injizieren; der CI-Compile-Smoke erzeugt bewusst ein unsigniertes Release-Artefakt.

## Automatische Build-Gates

Der `quality`-Job erzeugt `ios/` und `android/` in jedem Lauf neu und prüft anschließend:

1. iOS-Entitlement, Purpose Strings, fehlende Bonjour-Claims sowie Einbindung beider Probe-Quellen;
2. Android-Berechtigungs- und Removal-Vertrag, Backup-/Transfer-Ausschlüsse, deaktivierten
   Klartextverkehr und fehlende Debug-Signatur im Release-Buildtyp;
3. einen vollständigen `assembleRelease`-Compile mit Java 17;
4. das tatsächlich zusammengeführte Release-Manifest: keine Storage-/Overlay-Rechte,
   `allowBackup=false` und `usesCleartextTraffic=false`.

Die CI installiert die von Expo SDK 51 fest erwartete NDK-Version `25.1.8937393` explizit. Der
erste Buildnachweis zeigte, dass ein bloßes `ubuntu-latest` diese Native-Toolchain nicht garantiert;
ein fehlendes NDK darf nicht erst in einem späteren Release-Build auffallen.

Damit kann eine Abweichung zwischen `app.json`, Config-Plugin, Xcode-Projekt, Gradle und
zusammengeführtem Manifest nicht unbemerkt veröffentlicht werden.

## Gerätematrix und Nachweise

| Plattform | Ziel | Ergebnis | Aussage |
|---|---|---|---|
| Clean Prebuild | SDK 51, leeres `ios/`/`android/`, danach Wiederholung | bestanden | Native Projekte und Probes sind reproduzierbar; Plugins sind idempotent |
| iOS Simulator | iPhone-SE-Viewport, iOS 18.6 | bestanden | Build, Installation und App-Start; simuliertes Xcode-Entitlement enthält Wi-Fi Information |
| iOS physisch | aktuelle unterstützte iOS-17/18-Version | offen | echter SSID-/Location-/Local-Network-Dialog und Keychain-/Netzwerkprobe |
| Android CI | API/Target 35, Java 17 | bestanden, Run `31705322225` | Release-Kompilierung, Release-Lint und zusammengeführtes Manifest |
| Android physisch | API 33 und API 35, mindestens ein Samsung- und ein AOSP/Pixel-Gerät | offen | Permission-Kombination, WLAN-Liste, Backup/Restore und lokale Probe |
| Android Minimum | API 23 | offen | Installation, Start und verständliche Capability-Degradierung |

Der lokale Rechner besitzt derzeit weder JDK noch Android-AVD/Gerät. Deshalb ist ein lokaler
Android-Compile-/Device-Nachweis nicht vorgetäuscht; der reproduzierbare CI-Compile ist ein eigenes
Gate, ersetzt aber nicht die zwei physischen Android-Smokes.

## Noch offene Release-Gates

- physischer iOS-Smoke: Freigabe verweigert/erteilt, SSID, Local-Network-Dialog, TCP/SSDP und
  korrekte `unsupported`-Anzeige für nicht verfügbare WLAN-Capabilities;
- physische Android-Smokes auf API 33 und 35: beide Runtime-Rechte, Ablehnungs-/Dauerhaft-
  Ablehnen-Pfade, Scan, App-Neustart sowie Backup-/Restore-Negativnachweis;
- Minimum-API-23-Smoke und finaler Store-/Production-Signing-Nachweis. Signierschlüssel und
  Passwörter dürfen niemals im Repository oder Buildlog erscheinen.

Automatisierter Nachweis: GitHub-CI-Run `31705322225` für Commit `8af2d52` bestand vollständig.
Der Quality-Job erzeugte ein unsigniertes Android-Release, bestand Release-Lint und prüfte das
zusammengeführte Manifest fail-closed; Secret-Scan, Gesamtverifikation und `rls-pgtap` waren ebenfalls
grün.

## Referenzgrenzen

- Android Wi-Fi Permissions: <https://developer.android.com/develop/connectivity/wifi/wifi-permissions>
- Android Auto Backup und Data Extraction Rules: <https://developer.android.com/identity/data/autobackup>
- Apple `CNCopyCurrentNetworkInfo`: <https://developer.apple.com/documentation/systemconfiguration/1614126-cncopycurrentnetworkinfo>
