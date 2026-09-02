# SP3-01B – Supply-Chain-Bereinigung

Stand: 2026-09-02

Status: `in_progress`

Zieltermin: 2026-09-07; Sicherheitsreserve vor Ablauf der Ausnahmen: 2026-09-13

## Ziel und Sicherheitsnutzen

SP3-01B beseitigt den befristeten Expo-SDK-51-Rückstand, die 13 dokumentierten High-/Critical-
Advisories der Buildkette sowie den lokalen `@expo/plist`-Kompatibilitätspatch. Gleichzeitig werden
alle JavaScript-basierten GitHub Actions auf die von GitHub ab 2026 verlangte Node-24-Laufzeit
gebracht. Das verhindert einen Ausfall der Releasepipeline, reduziert das Risiko manipulierter
Buildwerkzeuge und macht die bestehende Ausnahme-Allowlist vollständig entfernbar.

Betroffene Plattformen: CI/Cloud, Android, iOS und die gemeinsame TypeScript-Codebasis.

Sicherheitsgewinn: sehr hoch.

Gesamtaufwand: hoch, weil Expo SDK 55+ ausschließlich die React-Native-New-Architecture unterstützt.

## Phasen und Gates

| Phase | Inhalt | Exit-Gate | Status |
|---|---|---|---|
| 1 – CI-Laufzeit | `checkout`, `setup-node`, `upload-artifact` und Gitleaks auf geprüfte Node-24-Releases aktualisieren; vollständige SHAs und Regressionstest | lokale Gesamtverifikation und grüne GitHub-CI/Secure-SDLC-Läufe ohne Node-20-Warnung | `released` |
| 2 – Upgrade-Baseline | SDK-/Native-/Plugin-Inventar, New-Architecture-Kompatibilität, Golden-Builds, Android-/iOS-Mindestversionen und Breaking-Changes erfassen | freigegebene Migrationsmatrix; unveränderte Funktions-, Crypto-, SQLite-, Permission- und Coverage-Baseline | `released` |
| 3 – Gestufte SDK-Migration | SDK 52, 53 und 54 einzeln stabilisieren; New Architecture auf SDK 54 separat aktivieren; danach SDK 55 und 56 als Übergangsstufen sowie SDK 57 / React Native 0.86 / React 19.2.3 als Ziel migrieren | je Stufe `expo-doctor`, Clean-Prebuild, TypeScript/Jest, Android Release und iOS Release Build grün | `in_progress` – SDK 52, 53, 54 Legacy und 54 New Architecture sind `released` (PR #39, Merge `165fea5`); SDK 55 ist technisch migriert und in Verifikation; SDK 56 und 57 stehen aus |
| 4 – Ausnahmen entfernen | Abhängigkeitsgraph neu auditieren; `@xmldom/xmldom`-Override, Vendor-Härtung und alle behobenen Allowlist-Einträge entfernen | kein unbekannter oder ausgenommener High/Critical-Befund; SBOM und Lockfile reproduzierbar | `in_progress` – SDK 55 entfernt 2 PostCSS-Ausnahmen und `patch-package`; 2 transitive Metro-/`image-size`-Ausnahmen bleiben bis zur SDK-56-Prüfung |
| 5 – Plattformnachweis | physische Android-/iOS-Smokes, verschlüsselte Inventarpersistenz, WLAN/Permissions, PDF-Cache, Logout/Praxiswechsel sowie signierte Testreleases prüfen | Device-Matrix, Store-Signing und Attestation unabhängig bestätigt; SP3-01B `released` | `pending` |

## Technische Leitplanken

- Jede SDK-Stufe erhält einen eigenen Commit und muss vor der nächsten Stufe vollständig grün sein.
- Native Verzeichnisse werden ausschließlich aus den eingecheckten Config-Plugins reproduziert und
  im Clean-Prebuild gegen die Releaseverträge geprüft.
- Expo SDKs werden gemäß offizieller Expo-Empfehlung einzeln migriert. Die New Architecture wird
  auf SDK 54 separat aktiviert und getestet. Erst danach folgen SDK 55 und höher, weil dort die
  Legacy Architecture nicht mehr unterstützt wird.
- Das Ziel SDK 57 setzt mindestens Android 7, iOS 16.4, Xcode 26.4 und Node 22.13 voraus. Diese bewusste
  Sicherheits-/Kompatibilitätsgrenze wird vor Phase 3 gegen die unterstützte Gerätematrix geprüft.
- SDK 56 ist nur eine technische Übergangsstufe und wird nicht produktiv freigegeben: Expo
  dokumentiert eine Hermes-v1-/Reanimated-Speicherregression und empfiehlt betroffenen Apps SDK 57.
- Keine Ausnahme wird pauschal verlängert. Behobene Advisories müssen aus der Allowlist entfernt
  werden; verbleibende Einträge benötigen wieder eine einzelne, zeitlich begrenzte Owner-Entscheidung.
- Ein erfolgreiches Kompilieren genügt nicht: Verschlüsselung, SecureStore/Keychain/Keystore,
  Tenant-Isolation, Netzwerk-Coverage und Berechtigungssemantik bleiben verpflichtende Gates.

## Phase 1 – geprüfte Action-Baseline

Die folgenden Releases wurden über die offiziellen Repositories und ihre exakten Tag-Refs geprüft.
Ihre JavaScript-Entrypoints deklarieren `node24`; Supabase Setup CLI ist eine Composite Action und
besitzt keine eigene JavaScript-Runtime:

| Action | Release | Runtime | Commit-SHA |
|---|---:|---:|---|
| `actions/attest` | v4.2.2 | Node 24 | `1e69f48acb82d1966a394da916b4c1698aa569d6` |
| `actions/checkout` | v7.0.1 | Node 24 | `3d3c42e5aac5ba805825da76410c181273ba90b1` |
| `actions/dependency-review-action` | v5.0.0 | Node 24 | `a1d282b36b6f3519aa1f3fc636f609c47dddb294` |
| `actions/setup-java` | v6.0.0 | Node 24 | `dd06d9cba3e5552c54d9f8ea23572deb30010f7c` |
| `actions/setup-node` | v7.0.0 | Node 24 | `820762786026740c76f36085b0efc47a31fe5020` |
| `actions/upload-artifact` | v7.0.1 | Node 24 | `043fb46d1a93c77aae656e7c1c64a875d1fc6a0a` |
| `github/codeql-action/init` und `analyze` | v4.37.9 | Node 24 | `cdf488f595d80d6e07e03d4674febd5ab45fa938` |
| `gitleaks/gitleaks-action` | v3.0.0 | Node 24 | `e0c47f4f8be36e29cdc102c57e68cb5cbf0e8d1e` |
| `supabase/setup-cli` | v3.0.0 | Composite | `46f7f98c7f948ad727d22c1e67fab04c223a0520` |

Das versionierte Inventar `security/github-action-inventory.json` ist fail-closed mit allen
Workflowdateien verbunden. Jede unbekannte neue Action, jeder nicht inventarisierte Unterpfad, ein
abweichender SHA, Releasekommentar oder eine entfernte inventarisierte Action lässt den Test
scheitern. Damit werden auch `setup-java`, `attest`, Dependency Review, CodeQL und Supabase erfasst;
ein späteres Downgrade oder ein neu eingeführter Node-20-Runner kann nicht unbemerkt landen.

### Formale Breaking-Change-Prüfung v4 bis v7

- `actions/checkout`: v5 hebt ausschließlich Runtime und Mindest-Runner auf Node 24/2.327.1. v6
  speichert persistierte Git-Credentials sicherer unter `RUNNER_TEMP`. v7 blockiert standardmäßig
  unsichere Fork-Checkouts aus `pull_request_target`/`workflow_run`; PraxisShield nutzt diese Trigger
  nicht. Die verwendeten Inputs bleiben kompatibel.
- `actions/setup-node`: v5 führt automatisches Caching bei vorhandenem `packageManager` ein. Im
  normalen PR-CI wird es explizit mit `package-manager-cache: false` deaktiviert; die bereits zuvor
  ausdrücklich gesetzten npm-Caches in Supply-Chain- und Releasejobs bleiben beabsichtigt. v6
  begrenzt Auto-Caching auf npm. v7 migriert intern auf ESM, entfernt nur den ungenutzten Dummy-
  `NODE_AUTH_TOKEN` und ergänzt Cache-Outputs; keiner dieser Punkte ändert die PraxisShield-Inputs.
- `actions/upload-artifact`: v5/v6 migrieren die Runtime auf Node 24. v7 ergänzt optional direkte,
  nicht archivierte Einzeldatei-Uploads und ESM. PraxisShield setzt `archive` nicht und behält damit
  das Archiv-Standardverhalten. Die drei Uploads liegen in getrennten Workflows und verwenden
  unterschiedliche Artefaktnamen; die v4+-Kollisionsregel ist nicht betroffen.
- `actions/dependency-review-action`: v5 ändert die Runtime auf Node 24 und verlangt denselben
  Mindest-Runner. `fail-on-severity` und `fail-on-scopes` bleiben unverändert unterstützt; die
  PraxisShield-Policy wird daher ohne semantische Abschwächung übernommen.
- Alle Jobs laufen auf GitHub-hosted Runnern und erfüllen damit die Mindestversion. Für
  selbstgehostete Runner bleibt `2.327.1` ein hartes Aufnahme-Gate.

### Actions-Wartung 2026-09

Turnus-Review der geprüften Action-Baseline am 2026-09-02. Dependabot hatte die drei Anhebungen
einzeln vorgeschlagen ([`#44`](https://github.com/kwhussam/praxis-ai/pull/44),
[`#45`](https://github.com/kwhussam/praxis-ai/pull/45),
[`#46`](https://github.com/kwhussam/praxis-ai/pull/46)). Sie werden bewusst **nicht** einzeln
gemergt, sondern in einem kontrollierten Commit zusammengeführt: `setup-java` kommt in zwei
Workflows vor und CodeQL `init`/`analyze` müssen denselben SHA tragen. Ein Einzelmerge würde
zwischenzeitlich uneinheitliche Pins erzeugen, die das fail-closed Inventar genau dafür
zurückweist.

- `actions/setup-java` v5.7.0 → v6.0.0 (`dd06d9cba3e5552c54d9f8ea23572deb30010f7c`): v6 migriert
  intern auf ESM; der Upstream dokumentiert dies ausdrücklich als nicht nutzerseitig brechend.
  Die einzige Umbenennung betrifft `jdkFile` → `jdk-file` mit weiterhin akzeptiertem Alias;
  PraxisShield nutzt diesen Input nicht. Beide Verwendungen bleiben unverändert auf Temurin 17,
  ohne Cache-Aktivierung im normalen CI. Die Runtime bleibt `node24`.
- `github/codeql-action/init` und `analyze` v4.37.7 → v4.37.9
  (`cdf488f595d80d6e07e03d4674febd5ab45fa938`): 4.37.8 enthält keine nutzerseitigen Änderungen,
  4.37.9 hebt ausschließlich das CodeQL-Standardbundle auf 2.26.4 an. Inputs, `build-mode: none`,
  `queries: security-extended` und die SARIF-Pfade bleiben unverändert; das nachgelagerte
  `security:sarif:gate` bleibt damit wirksam.

Alle SHAs wurden gegen die exakten Upstream-Tag-Refs aufgelöst (annotierte CodeQL-Tags über ihr
gepeeltes Commit-Objekt) und die `runs.using`-Deklaration jeder Action wurde am gepinnten Stand als
`node24` verifiziert. Permissions, Gates und `continue-on-error`-Freiheit sind unverändert.

Lokale Verifikation: Lint, TypeScript, YAML-Syntax und 441 Tests bestanden; 6 Remote-/Gerätetests
blieben wie zuvor bewusst übersprungen. GitHub-CI-Lauf
[`31814292278`](https://github.com/kwhussam/praxis-ai/actions/runs/31814292278) bestand `quality`
einschließlich Gitleaks, Clean-Prebuild, Android-Release-Compile und Gesamtverifikation sowie
`rls-pgtap`. Es wurde keine Node-20-Annotation mehr erzeugt. Phase 1 ist mit PR
[`#22`](https://github.com/kwhussam/praxis-ai/pull/22) abgeschlossen: CI-Lauf
[`31877006993`](https://github.com/kwhussam/praxis-ai/actions/runs/31877006993) bestand `quality`
einschließlich Android-Release-Compile und Gesamtverifikation sowie `rls-pgtap`; Secure-SDLC-Lauf
[`31877006987`](https://github.com/kwhussam/praxis-ai/actions/runs/31877006987) bestand im zweiten
Versuch Dependency Review v5, Dependency-/SBOM-Gate und CodeQL. Der zunächst fehlgeschlagene
Dependency Review war kein Codefehler; nach Aktivierung des GitHub Dependency Graph lief er grün.

Die normative Phase-2-Baseline steht in
[`SP3_01B_UPGRADE_BASELINE.md`](./SP3_01B_UPGRADE_BASELINE.md); ihre maschinenprüfbare Fassung ist
`security/mobile-upgrade-baseline.json`.

## Phase 3 – SDK-52-Zwischenstand

Der erste isolierte Migrationsschritt steht auf Expo 52.0.49, React Native 0.77.3 und React 18.3.1.
Android 7/API 24 ist die freigegebene Mindestversion; die New Architecture bleibt ausdrücklich
deaktiviert. Expo Doctor (18/18), Clean Prebuild, Native-Config, 467 lokale Tests und ein
unsignierter iOS-Release-Build auf Xcode 16.4 sind grün. Der reale Release-Build deckte die zuvor
fehlende direkte `expo-asset`-Abhängigkeit auf; sie ist nun versioniert und nativ eingebunden.

Das Dependency-Gate ist ebenfalls grün und konnte eine behobene `turbo-stream`-Ausnahme entfernen
(12 statt 13 verbleibende, ausschließlich befristete Build-Toolchain-Ausnahmen). Die physischen
Geräte-Smokes sind durch Product-Owner-Entscheidung auf das Produktionsfreigabe-Gate verschoben und
blockieren den SDK-52-Merge nicht. Der erste PR-Lauf hat dabei die mit React Native 0.77/Paper
inkompatible Expo-
Standardversion `react-native-svg` 15.8.0 fail-closed erkannt; 15.12.1 ist als letzte kompatible
Linie vor der RN-0.78-Mindestgrenze gepinnt und durch einen Vendor-Code-Regressionstest abgesichert.
Der Folgelauf und Merge von PR #26 waren grün; SDK 52 ist damit abgeschlossen.

## Phase 3 – SDK-53-Zwischenstand

Der zweite isolierte Migrationsschritt steht auf Expo 53.0.27, React Native 0.79.6 und Expos
abgestimmter React-/React-DOM-Linie 19.0.0. Die Legacy Architecture bleibt bewusst
explizit deaktiviert; ihre Ablösung wird nicht mit diesem SDK-Sprung vermischt. Expo Router 5.1.11,
`jest-expo` 53.0.14 und der maschinengeprüfte Ausschluss aller `react-server-dom-*`-Pakete binden
die aktuelle RSC-Sicherheitslinie ohne Abweichung des React-Native-Laufzeitpaares oder
prophylaktischen Paket-Override.

Clean Prebuild, Native-Config, Expo Doctor 18/18, 469 lokale Tests sowie iOS- und
Android-Produktionsbundle sind grün. Das Swift-first-Template von React Native 0.79 erforderte eine
gezielte Anpassung des Network-Probe-Config-Plugins; die iOS-Brücke bleibt anschließend
reproduzierbar. Metro Package Exports konnten trotz der von Expo für SDK 53 dokumentierten
Kompatibilitätsrisiken im Standardmodus bleiben, weil beide echten Bundles einschließlich Supabase
erfolgreich erzeugt wurden.

Der serielle iOS-Simulator-Smoke auf iPhone 16 Plus / iOS 18.6 ist mit 15/15 Flows und 0 Fehlern
grün. Der Lauf deckt insbesondere die durch React 19 und Expo Router 5 berührten Start-, Auth-,
Onboarding-, Fragebogen- und Navigationspfade ab. Zwei SDK-53-spezifische Harness-Grenzen wurden
dabei geschlossen: Router-Deep-Links werden vor jedem Flow auf die App-Wurzel zurückgesetzt und
Auth-Subflows behandeln `Enter` mit einem nur bei weiterhin sichtbarem Submit-Button ausgeführten
Fallback. Damit bleiben die Flows seriell voneinander isoliert und fail-closed.

Das Dependency-Gate konnte acht `tar`-Advisories als durch SDK 53 behoben entfernen. Vier
befristete Ausnahmen ausschließlich für transitive Buildwerkzeuge bleiben aktiv; Laufzeitpakete
können weiterhin nicht allowlisted werden. Der lokale Android-Release-Compile ist nicht als
bestanden markiert, weil Googles Android-Repository wiederholt in Timeouts lief. Dieser Beweis
bleibt zwingendes GitHub-CI-Gate. Physische Gerätesmokes bleiben unverändert vor der
Produktionsfreigabe verpflichtend.

## Phase 3 – SDK-54-New-Architecture-Abschluss

Die New Architecture wurde auf SDK 54 separat aktiviert und als PR #39 gemergt. Der Stand bestand
die GitHub-CI und Secure-SDLC-Pipeline. iOS-Release-Build, Reanimated-4-/Worklets-Transformation
und alle 15 seriellen iOS-Simulator-Pfade wurden belegt; der WLAN-Lauf bestätigte zusätzlich echte
persistierte TCP-/SSDP-Probe-Evidenz über die Interop-Schicht. Der Android-Kotlin-Laufzeitnachweis
bleibt Teil des späteren physischen Geräte-Gates.

## Phase 3 – SDK-55-Zwischenstand

Der fünfte isolierte Migrationsschritt steht auf Expo 55.0.30, React Native 0.83.10 und
React/React DOM 19.2.0. Die New Architecture ist in SDK 55 verpflichtend; das nicht mehr
unterstützte Konfigurationsfeld `newArchEnabled` wurde entfernt. Expo Router 55, Reanimated 4.2,
Worklets 0.7 und alle nativen Expo-Module sind als koordinierter Satz aktualisiert.

Die alten Patch-Package-Patches wurden durch eine kleine fail-closed Postinstall-Härtung ersetzt,
die exakte Vendor-Versionen und bekannte Quellformen erzwingt. Das Dependency-Gate schließt beide
PostCSS-Advisories; zwei `image-size@1.2.1`-Advisories bleiben ausschließlich für die transitive
Metro-Buildkette befristet akzeptiert und werden in SDK 56 erneut bewertet.

Lint, TypeScript, 487 lokale Tests, Clean Prebuild, Native-Config und Dependency-Gate sind grün.
Beide Hermes-Produktionsbundles sind grün; ihr erster Lauf deckte das unter SDK 55 nicht mehr
zuverlässig hoistbare `babel-preset-expo` auf. Es ist nun als direkte, SDK-kompatible
Dev-Abhängigkeit versioniert und maschinengeprüft.
Nach der lokalen Installation von Xcode 26.6 besteht Expo Doctor 1.20.3 alle 20 Prüfungen. Clean
Prebuild, Pods, der signaturfreie iOS-Release-Build auf iOS SDK 26.5 und der installierbare
Simulator-Debug-Build sind grün; auch der Android-Release-Compile ist in GitHub grün. Der erste
serielle iOS-26.5-Smoke bestand 4/15 Flows. Die elf Fehler wurden auf vier Änderungen an
iOS-Systemdialogen beziehungsweise XCTest-Verhalten eingegrenzt (Deep-Link-Bestätigung,
Passwort-Speichern, Tastatur-Dismiss und Share-Sheet-Dismiss), nicht auf elf Produktdefekte. Der
Maestro-Harness ist angepasst; der erneute 15/15-Lauf bleibt das letzte lokale Runtime-Gate.

## Primärquellen

- Expo SDK 55: <https://expo.dev/changelog/sdk-55>
- Expo SDK 56: <https://expo.dev/changelog/sdk-56>
- Expo SDK 57 / aktuelle Versionsmatrix: <https://docs.expo.dev/versions/latest/>
- Expo New Architecture: <https://docs.expo.dev/guides/new-architecture/>
- Expo SDK 53: <https://expo.dev/changelog/sdk-53>
- Expo Native Upgrade Helper: <https://docs.expo.dev/bare/upgrade/>
- Checkout: <https://github.com/actions/checkout/releases/tag/v7.0.1>
- Setup Node: <https://github.com/actions/setup-node/releases/tag/v7.0.0>
- Upload Artifact: <https://github.com/actions/upload-artifact/releases/tag/v7.0.1>
- Gitleaks Action: <https://github.com/gitleaks/gitleaks-action/releases/tag/v3.0.0>
- Dependency Review: <https://github.com/actions/dependency-review-action/releases/tag/v5.0.0>
- Setup Java: <https://github.com/actions/setup-java/releases/tag/v6.0.0>
- CodeQL Action: <https://github.com/github/codeql-action/releases/tag/v4.37.9>
- Checkout v5/v6/v7: <https://github.com/actions/checkout/releases>
- Setup Node v5/v6/v7: <https://github.com/actions/setup-node/releases>
- Upload Artifact v5/v6/v7: <https://github.com/actions/upload-artifact/releases>
