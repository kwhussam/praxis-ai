# PraxisShield – Aktueller Stand

Stand: 2026-09-02

Diese Datei ist die kompakte operative Übergabe. Sie beantwortet nach jedem Arbeitspaket:

1. Was wurde gemacht?
2. Welche Nachweise sind grün oder rot?
3. Welche Befunde sind offen?
4. Was ist der nächste konkrete Schritt?

Der normative Umfang und die langfristige Reihenfolge bleiben in
`docs/UMSETZUNGSPLAN_2026.md`. Diese Datei ersetzt den Umsetzungsplan nicht.

## Aktueller Arbeitskontext

- Stufe: kontrollierte Wartung der geprüften GitHub-Actions-Baseline nach abgeschlossener
  Dependency-Wartung.
- Branch: `codex/github-actions-maintenance-2026-09`, direkt von `origin/main` am Stand
  `dae766bdc001247d98263a308123eb5709b03550` abgezweigt.
- Ausgangspunkt: PR `#47` (konsolidierte Dependency-Wartung) und PR `#48`
  (`@cloudflare/workers-types` `5.20260830.1`) sind gemergt. Damit ist die Dependency-Stufe
  abgeschlossen; die aktive Dependency-Allowlist ist leer.
- Die Umsetzung liegt in einem separaten Git-Worktree. Die parallele UI-Redesign-Arbeit im
  Hauptbaum bleibt unberührt.

## Was in der Dependency-Wartung gemacht wurde (abgeschlossen, PR #47 und #48)

- **Vier Dependabot-Updates konsolidiert:** Hono `4.13.5` (Security-Patch), Supabase JS
  `2.112.4`, TanStack Query `5.102.8`, Wrangler `4.127.1` und Cloudflare Workers Types
  `5.20260829.1` liegen gemeinsam in einem reproduzierbaren Lockfile.
- **Baseline synchronisiert:** Die exakt installierten Runtime-Versionen sind in
  `security/mobile-upgrade-baseline.json` nachgezogen; künftige Drift bleibt fail-closed.
- **Zwei High-Ausnahmen geschlossen:** Die nicht benötigte optionale
  `@react-native/metro-config`-Peer-Kette wurde aus dem Lockfile entfernt. Damit sind
  `image-size` und beide zugehörigen High-Advisories nicht mehr installiert; die aktive
  Allowlist ist leer, der historische Nachweis bleibt erhalten.
- **Runtime-Verträglichkeit bewiesen:** Beide nativen Hermes-Produktionsbundles entstehen ohne
  die optionale Peer-Kette; Wrangler `4.127.1` paketiert den Worker im Dry-Run erfolgreich.
- **Abgeschlossen:** PR [`#47`](https://github.com/kwhussam/praxis-ai/pull/47) ist als
  `8282ae1` gemergt. Der nachgezogene Dependabot-Gruppen-PR
  [`#48`](https://github.com/kwhussam/praxis-ai/pull/48) hebt `@cloudflare/workers-types` auf
  `5.20260830.1` und ist als `dae766b` gemergt; er ist der Ausgangspunkt dieser Stufe.

## Was in der aktuellen Actions-Wartung gemacht wurde

- **Drei Dependabot-Action-PRs konsolidiert:** [`#44`](https://github.com/kwhussam/praxis-ai/pull/44),
  [`#45`](https://github.com/kwhussam/praxis-ai/pull/45) und
  [`#46`](https://github.com/kwhussam/praxis-ai/pull/46) liegen in einem kontrollierten Commit.
  Sie werden bewusst nicht einzeln gemergt: `setup-java` wird in zwei Workflows verwendet und
  CodeQL `init`/`analyze` müssen denselben SHA tragen. Einzelmerges würden zwischenzeitlich
  uneinheitliche Pins erzeugen, die das fail-closed Inventar zurückweist.
- **`actions/setup-java` v5.7.0 → v6.0.0** (`dd06d9cba3e5552c54d9f8ea23572deb30010f7c`) in
  `.github/workflows/ci.yml` und `.github/workflows/release-android.yml`. Beide Stellen tragen
  denselben SHA und bleiben unverändert auf Temurin 17.
- **`github/codeql-action/init` und `analyze` v4.37.7 → v4.37.9**
  (`cdf488f595d80d6e07e03d4674febd5ab45fa938`) gemeinsam in `.github/workflows/security.yml`.
- **Inventar und Plan nachgezogen:** `security/github-action-inventory.json` führt SHA, Release,
  Quelle und `reviewedAt: 2026-09-02`; die Runtime bleibt für alle drei Einträge belegt `node24`.
  Die Tabelle in `docs/SP3_01B_SUPPLY_CHAIN_UPGRADE_PLAN.md` ist mit der Breaking-Change-Prüfung
  ergänzt.
- **Pins gegen den Upstream verifiziert:** Jeder SHA wurde über den exakten Tag-Ref aufgelöst
  (annotierte CodeQL-Tags über ihr gepeeltes Commit-Objekt) und die `runs.using`-Deklaration am
  gepinnten Stand als `node24` geprüft. Alle Verwendungen bleiben auf vollständige 40-stellige
  Commit-SHAs gepinnt.
- **Keine Abschwächung:** Permissions unverändert, kein `continue-on-error`, keine gelockerten
  Gates, keine weiteren Dependency-Änderungen.

## Was in der SDK-55-Stufe gemacht wurde

- **Kernplattform migriert:** Expo `55.0.30`, React Native `0.83.10`, React/React DOM `19.2.0`,
  Expo Router `55.0.18`, Reanimated `4.2.1` und Worklets `0.7.4`.
- **New Architecture als Pflichtzustand modelliert:** SDK 55 unterstützt die Legacy Architecture
  nicht mehr. Das entfernte Feld `newArchEnabled` wurde aus `app.json` entfernt; der
  Android-Generate muss weiterhin `newArchEnabled=true` enthalten.
- **Native Pakete mit Expo abgestimmt:** `expo install --fix` aktualisierte die Expo-Module und
  ergänzte erforderliche Config-Plugins für SecureStore, Sharing und SQLite.
- **Produktionsbundles repariert:** SDK 55 hoistet `babel-preset-expo` nicht mehr zuverlässig aus
  Expos eigener Abhängigkeitsstruktur. Das Preset ist deshalb nun als direkte, exakt zur SDK-Linie
  passende Dev-Abhängigkeit versioniert und durch einen Regressionstest gebunden.
- **Notification-Permissions fail-closed angepasst:** Nur ein explizites `granted === true` gilt
  als Freigabe, ohne die von Expo verbotene direkte Installation von `expo-modules-core`.
- **Alte Patch-Dateien entfernt:** Ein versionierter Postinstall-Härtungsschritt prüft jetzt exakt
  `@expo/plist@0.5.4` und `expo-modules-core@55.0.25`, verändert nur bekannte Quellformen und
  bricht bei Versions- oder Quellcode-Drift ab. `patch-package` wird nicht mehr benötigt.
- **Release-Konfiguration angepasst:** Expo Dev Launcher benötigt im Debug-Generate exakt
  `_expo._tcp`. Der Verifier erlaubt nur diesen einzelnen Debug-Dienst und verlangt zugleich Expos
  Release-Build-Phase, die Local-Network-Schlüssel für Nicht-Debug-Builds entfernt.
- **Dependency-Allowlist neu bewertet:** Zwei PostCSS-Advisories sind mit PostCSS `8.5.26`
  behoben. Die damals noch befristeten `image-size`-Advisories wurden in der anschließenden
  kontrollierten Dependency-Wartung ebenfalls geschlossen.

## Verifikation

| Nachweis | Ergebnis | Einordnung |
|---|---|---|
| `npm ci` | grün | Lockfile und Vendor-Härtung aus einem frischen Install reproduziert |
| `npm run verify` | grün: 487 Tests bestanden, 6 übersprungen | Lint, TypeScript und Jest einschließlich SDK-/Supply-Chain-Verträgen |
| `npm run security:dependencies` | grün | 0 aktive High-/Critical-Ausnahmen; `image-size` nicht mehr installiert |
| Clean Prebuild | grün | native Projekte reproduzierbar aus versionierter Konfiguration erzeugt |
| `verify:native-config` | grün | Android New Architecture, iOS-Entitlements und Release-Stripping geprüft |
| Expo Doctor 1.20.3 | **20/20** | nach Installation von Xcode `26.6` vollständig grün |
| iOS Release-Build | grün | signaturfreier Release-Build mit Xcode `26.6` / iOS SDK `26.5`: `BUILD SUCCEEDED` |
| Android Release-Build | grün | PR-Job `android-release-compile` einschließlich Manifest-Verifikation bestanden |
| iOS-/Android-Bundles | grün | beide Hermes-Produktionsbundles mit Expo Router und Worklets erzeugt |
| Wrangler Worker-Dry-Run | grün | Wrangler `4.127.1` paketiert den Hono-Worker ohne Deployment |
| iOS Simulator-Smoke | grün über kombinierte Nachweise | vollständiger Wiederholungslauf: 14/15 laut Terminalausgabe; anschließend Flow 15 fokussiert: 1/1 einschließlich nativer Share-UI und Klartext-Cache-Gate |
| Physische Geräte-Smokes | zurückgestellt | iOS-/Android-Gerätematrix bleibt wie vereinbart ein späteres Release-Gate |

## Offene Befunde

### Geschlossen – Xcode-26-Tooling und iOS Release-Build

Die lokale Maschine läuft jetzt mit Xcode `26.6` (Build `17F113`) und iOS SDK `26.5`. Expo Doctor
besteht 20/20 Prüfungen. Clean Prebuild, CocoaPods-Installation, vollständiger signaturfreier
iOS-Release-Build und ein installierbarer Simulator-Debug-Build sind grün.

### Geschlossen – iOS-26-Systemdialoge und PDF-Smoke im Maestro-Harness

Der erste vollständige Lauf bestand 4/15 Flows. Die Screenshots belegten keine elf unabhängigen
Produktfehler: Ein zweiter Deep-Link-Bestätigungsdialog blockierte 01/02, der iOS-26-Dialog
`Passwort sichern?` blockierte die Login-basierten Flows, `hideKeyboard` war in Flow 12 nicht
verfügbar und das neue Share-Sheet ließ sich in Flow 15 nicht mehr über einen beschrifteten
Abbrechen-Button schließen. Der Harness quittiert diese Zustände jetzt explizit beziehungsweise
nutzt sichere Tap-/Swipe-Fallbacks.

Im vollständigen Wiederholungslauf wurden laut Terminalausgabe 14/15 Flows grün; nur Flow 15
schlug fehl. Das Fenster wurde danach geschlossen, weshalb für diesen Gesamtlauf kein
übernehmbares zusammengefasstes JUnit-Artefakt vorliegt. Der verbleibende Flow wurde deshalb
fokussiert reproduziert: Der Worker lieferte das PDF mit HTTP 200, iOS zeigte das native
Share-Sheet mit dem kanonischen 5-KB-Dokument und entfernte die Klartextdatei nach dem Schließen.
Der Fehler lag ausschließlich in der letzten Maestro-Assertion: Der iOS-26-Schließen-Drag
scrollte zugleich den darunterliegenden Bericht und schob den erwarteten Export-Button aus dem
Viewport. Der Flow prüft nun stattdessen, dass der native Dateiname verschwindet und der feste
Berichte-Tab wieder sichtbar ist. Der fokussierte Wiederholungslauf bestand 1/1; auch das
nachgelagerte Klartext-Cache-Gate war grün.

### Geschlossen – Zwei befristete `image-size`-Ausnahmen

Die optionale Peer-Auflösung installierte neben Expos Metro-Konfiguration zusätzlich
`@react-native/metro-config` und darüber `image-size@1.2.1`, obwohl PraxisShield diesen Pfad nicht
verwendet. Der kontrollierte Lockfile-Refresh entfernt diese optionale Kette. `npm ci`, alle Tests
und beide nativen Produktionsbundles belegen die Verträglichkeit; das Dependency-Gate akzeptiert
nun 0 Ausnahmen.

### P3 – Physischer Runtime-Nachweis bleibt offen

Der Android-Release-Compile ist in GitHub grün. Die iOS-Simulator-Smokes decken Netzwerk-/WLAN-,
Persistenz-, Auth-/Tenant- und PDF-Cache-Pfade nun über den vollständigen 14/15-Lauf und den
anschließenden fokussierten 1/1-PDF-Nachweis ab. Die vollständige physische iOS-/Android-Matrix
bleibt wie vereinbart das spätere Produktions-Gate.

### Technische Rückstände außerhalb dieses SDK-Schritts

- Migration des PDF-Caches von `expo-file-system/legacy` auf die neue API;
- React Test Renderer `19.0` als reine Test-Infrastruktur;
- Icon-Migration vor dem endgültigen SDK-57-Ziel;

## Als Nächstes

1. Den konsolidierten Actions-Wartungsbranch pushen und einen Pull Request gegen `main`
   erstellen.
2. GitHub-CI und Secure SDLC grün prüfen. Entscheidend sind `setup-java` in `quality` und im
   Android-Release-Compile sowie ein vollständiger CodeQL-Lauf mit anschließendem
   `security:sarif:gate`.
3. Nach grünem Review und Merge die Dependabot-PRs `#44`, `#45` und `#46` als überholt schließen.
   Vorher bleiben sie bewusst offen.
4. Danach SDK 56 als eigene, nicht produktiv freigegebene Übergangsstufe beginnen.

## Bewusste Grenzen

- Die physische iOS-/Android-Gerätematrix bleibt wie vereinbart für das spätere
  Produktionsfreigabe-Gate zurückgestellt.
- Die lokale Simulatorprüfung ersetzt keine spätere Prüfung auf physischen iOS-/Android-Geräten.

## Abnahmekriterium für den nächsten Schritt

- `npm ci`, `npm run verify` und `npm run security:dependencies` grün;
- Actions-Inventartest fail-closed grün: jede Verwendung SHA-gepinnt, CodeQL `init`/`analyze` und
  beide `setup-java`-Stellen jeweils identisch;
- GitHub-CI und Secure SDLC grün, insbesondere CodeQL v4.37.9 und `security:sarif:gate`;
- Dependency-Gate, Clean Prebuild und Native-Config grün;
- iOS- und Android-Produktionsbundle grün;
- Android-Release-Compile in GitHub-CI grün;
- iOS-Release-Build, vollständiger 14/15-Simulatorlauf und fokussierter 1/1-PDF-Smoke unter
  Xcode 26 grün;
- keine High-/Critical-Abhängigkeiten und keine aktive Dependency-Ausnahme;
- unabhängiges Review ohne offenen P1-/P2-/P3-Codebefund.
