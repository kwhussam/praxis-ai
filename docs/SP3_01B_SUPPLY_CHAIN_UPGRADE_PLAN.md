# SP3-01B – Supply-Chain-Bereinigung

Stand: 2026-08-14

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
| 1 – CI-Laufzeit | `checkout`, `setup-node`, `upload-artifact` und Gitleaks auf geprüfte Node-24-Releases aktualisieren; vollständige SHAs und Regressionstest | lokale Gesamtverifikation und grüne GitHub-CI/Secure-SDLC-Läufe ohne Node-20-Warnung | `verification` |
| 2 – Upgrade-Baseline | SDK-/Native-/Plugin-Inventar, New-Architecture-Kompatibilität, Golden-Builds, Android-/iOS-Mindestversionen und Breaking-Changes erfassen | freigegebene Migrationsmatrix; unveränderte Funktions-, Crypto-, SQLite-, Permission- und Coverage-Baseline | `pending` |
| 3 – Gestufte SDK-Migration | zunächst SDK 54 und New Architecture getrennt stabilisieren; danach SDK 56 / React Native 0.85 / React 19.2 migrieren; Config-Plugins und Native-Probe anpassen | `expo-doctor`, Clean-Prebuild, TypeScript/Jest, Android Release und iOS Release Build grün | `pending` |
| 4 – Ausnahmen entfernen | Abhängigkeitsgraph neu auditieren; `@xmldom/xmldom`-Override, `@expo/plist`-Patch und alle behobenen Allowlist-Einträge entfernen | kein unbekannter oder ausgenommener High/Critical-Befund; SBOM und Lockfile reproduzierbar | `pending` |
| 5 – Plattformnachweis | physische Android-/iOS-Smokes, verschlüsselte Inventarpersistenz, WLAN/Permissions, PDF-Cache, Logout/Praxiswechsel sowie signierte Testreleases prüfen | Device-Matrix, Store-Signing und Attestation unabhängig bestätigt; SP3-01B `released` | `pending` |

## Technische Leitplanken

- Jede SDK-Stufe erhält einen eigenen Commit und muss vor der nächsten Stufe vollständig grün sein.
- Native Verzeichnisse werden ausschließlich aus den eingecheckten Config-Plugins reproduziert und
  im Clean-Prebuild gegen die Releaseverträge geprüft.
- Die New Architecture wird auf SDK 54 separat aktiviert und getestet. Erst danach erfolgt der
  Sprung auf SDK 56, weil SDK 55 und neuer die Legacy Architecture nicht mehr unterstützen.
- Das Ziel SDK 56 setzt mindestens Android 7, iOS 16.4 und Xcode 26.4 voraus. Diese bewusste
  Sicherheits-/Kompatibilitätsgrenze wird vor Phase 3 gegen die unterstützte Gerätematrix geprüft.
- Keine Ausnahme wird pauschal verlängert. Behobene Advisories müssen aus der Allowlist entfernt
  werden; verbleibende Einträge benötigen wieder eine einzelne, zeitlich begrenzte Owner-Entscheidung.
- Ein erfolgreiches Kompilieren genügt nicht: Verschlüsselung, SecureStore/Keychain/Keystore,
  Tenant-Isolation, Netzwerk-Coverage und Berechtigungssemantik bleiben verpflichtende Gates.

## Phase 1 – geprüfte Action-Baseline

Die folgenden Releases wurden über die offiziellen Repositories und ihre exakten Tag-Refs geprüft.
Ihre `action.yml` deklariert jeweils `node24`:

| Action | Release | Commit-SHA |
|---|---:|---|
| `actions/checkout` | v7.0.1 | `3d3c42e5aac5ba805825da76410c181273ba90b1` |
| `actions/setup-node` | v7.0.0 | `820762786026740c76f36085b0efc47a31fe5020` |
| `actions/upload-artifact` | v7.0.1 | `043fb46d1a93c77aae656e7c1c64a875d1fc6a0a` |
| `gitleaks/gitleaks-action` | v3.0.0 | `e0c47f4f8be36e29cdc102c57e68cb5cbf0e8d1e` |

Der SDLC-Konfigurationstest erzwingt zusätzlich zum allgemeinen SHA-Pinning für jede Verwendung
dieser Actions genau den geprüften Node-24-Commit. Ein späteres Downgrade oder ein nur teilweise
aktualisierter Workflow schlägt dadurch lokal und in CI fehl.

Lokale Verifikation: Lint, TypeScript, YAML-Syntax und 440 Tests bestanden; 6 Remote-/Gerätetests
blieben wie zuvor bewusst übersprungen. GitHub-CI-Lauf
[`31814292278`](https://github.com/kwhussam/praxis-ai/actions/runs/31814292278) bestand `quality`
einschließlich Gitleaks, Clean-Prebuild, Android-Release-Compile und Gesamtverifikation sowie
`rls-pgtap`. Es wurde keine Node-20-Annotation mehr erzeugt. Der vorbestehende NetInfo-Hinweis zur
alten React-Native-Architektur bleibt sichtbar und gehört in Phase 2/3. Das letzte Phase-1-Gate ist
der Secure-SDLC-Lauf, der auf diesem Feature-Branch erst durch einen Pull Request gegen `main`
ausgelöst wird.

## Primärquellen

- Expo SDK 56: <https://expo.dev/changelog/sdk-56>
- Expo New Architecture: <https://docs.expo.dev/guides/new-architecture/>
- Expo Native Upgrade Helper: <https://docs.expo.dev/bare/upgrade/>
- Checkout: <https://github.com/actions/checkout/releases/tag/v7.0.1>
- Setup Node: <https://github.com/actions/setup-node/releases/tag/v7.0.0>
- Upload Artifact: <https://github.com/actions/upload-artifact/releases/tag/v7.0.1>
- Gitleaks Action: <https://github.com/gitleaks/gitleaks-action/releases/tag/v3.0.0>
