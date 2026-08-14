# SP3-01 – Secure-SDLC- und Release-Supply-Chain-Baseline

Stand: 2026-08-14
Status: `verification`

## Sicherheitsvertrag

Ein Commit oder Release darf nicht allein deshalb als vertrauenswürdig gelten, weil er kompiliert.
PraxisShield prüft Quellcode, Geheimnisse, Abhängigkeiten, Buildkonfiguration, Stückliste,
Signieridentität und Herkunft in getrennten fail-closed Gates. Kein privater Signierschlüssel liegt
im Repository, in einer Expo-Konfiguration oder in einem Buildartefakt.

## CI-Gates

| Gate | Ausführung | Blockiert | Evidenz |
|---|---|---|---|
| Gitleaks | jeder Push/PR im bestehenden CI | jeden erkannten Secret-Fund | CI-Log |
| npm Audit + Ausnahme-Gate | Push, PR, wöchentlich und Release | jede neue, veränderte, direkte, nicht als Build-Tooling belegte, abgelaufene oder nicht mehr benötigte Ausnahme | CI-Log + versionierte Ausnahmeentscheidung |
| Dependency Review | jeder PR gegen `main` | neu eingeführte hohe oder kritische Runtime-/Dev-Abhängigkeit | PR-Check |
| CodeQL `security-extended` | Push, PR und wöchentlich | Security-Severity ≥ 7.0 sowie nicht klassifizierte Error-Funde | Code-Scanning + SARIF-Gate |
| CycloneDX 1.5 | Push, PR, wöchentlich und Release | fehlende/ungültige SBOM, leere Komponenten- oder Dependency-Liste | validierte JSON-SBOM, 90/365 Tage |
| Native Release-Vertrag | jeder normale CI-Lauf | Debug-Signing, unzulässige Berechtigungen, Backup/Klartext oder unvollständige Signierkonfiguration | Native Config/Build Gates |
| Produktionssignatur | Tag/manuell von `main`, geschützte Umgebung | fehlendes Secret, falscher Tag/Branch, falsche Team-/Zertifikatsidentität, Debug-/Development-Signatur | signiertes AAB/IPA |
| Provenienz | jeder Produktionsrelease | Attestation kann nicht erzeugt werden | GitHub/Sigstore-Attestation mit SBOM |

High oder kritisch ist für das Release-Gate eine numerische `security-severity` ab 7.0. Ein
SARIF-Ergebnis auf Error-Level ohne Klassifizierung wird ebenfalls blockiert, damit eine fehlende
Severity nicht als Umgehung wirkt. Diese verschärfte Produktentscheidung schützt insbesondere
Kryptografie-, Authentifizierungs- und Datenpersistenzabhängigkeiten; mittlere und niedrige Befunde
bleiben sichtbar und folgen den Patch-SLAs, blockieren aber nicht automatisch jede Auslieferung.

Alle GitHub Actions sind auf vollständige Commit-SHAs fixiert. Dependabot erzeugt wöchentlich
getrennte Updates für npm und Actions; ein bewegliches Major-Tag kann dadurch nicht unbemerkt Code
in der Pipeline austauschen.

## SBOM und Inventarisierung

`npm run security:sbom` erzeugt aus dem eingecheckten Lockfile eine CycloneDX-1.5-SBOM vom Typ
`application`. `verify-sbom.mjs` bindet Produktname, Version und Package-URL an `package.json` und
verlangt vollständige Komponenten sowie einen Dependency Graph. Die normale CI bewahrt die SBOM
90 Tage auf.

Ein Produktionsrelease erzeugt zusätzlich ein Release-Evidence-Manifest mit:

- Plattform und Produktversion;
- nativer Android-`versionCode` beziehungsweise iOS-`buildNumber`;
- Name und SHA-256 des AAB beziehungsweise IPA;
- freigegebenem SHA-256-Fingerprint des Signierzertifikats;
- Name, Format und SHA-256 der SBOM;
- Repository, Commit und Workflow-Run.

Das Manifest und die SBOM werden zusammen mit dem signierten Artefakt 365 Tage aufbewahrt. Die
Attestation bindet Releaseartefakt und CycloneDX-SBOM kryptografisch an den GitHub-Workflow.
Die erste Baseline inventarisiert den npm/JavaScript-Dependency-Graph vollständig; eine spätere
Erweiterung um native Gradle-/CocoaPods-Komponenten darf die bestehende SBOM nicht ersetzen,
sondern muss sie zu einer Multi-Ecosystem-SBOM ergänzen.

## Android-Release

Der Expo-Config-Plugin erzeugt eine optionale `release`-SigningConfig ausschließlich aus vier
Umgebungswerten. Sobald ein Wert gesetzt ist, müssen alle gesetzt sein; andernfalls stoppt Gradle.
Ohne Werte bleibt der normale CI-Smoke bewusst unsigniert. Der geschützte Release-Job:

1. akzeptiert nur einen zur Paket-/App-Version passenden `v*`-Tag oder einen manuellen Lauf von
   `main`; der Commit muss ein Vorfahr des aktuellen `origin/main` sein und beide nativen Buildnummern
   müssen explizit positiv gesetzt sein;
2. lädt den Base64-Keystore nur in eine temporäre Datei mit Modus 0600;
3. baut ein signiertes AAB;
4. weist Debug-Identitäten zurück und vergleicht den echten Zertifikatsfingerabdruck mit dem
   freigegebenen Secret `ANDROID_SIGNING_CERT_SHA256`;
5. erzeugt Manifest, Attestation und Release-Evidenz;
6. vernichtet die temporäre Keystore-Datei auch nach einem Fehler.

## iOS-Release

Der macOS-Release-Job importiert das Distribution-Zertifikat in einen temporären Keychain. Vor dem
Build werden Name, Team-ID und Application Identifier des Provisioning Profiles gegen die
freigegebenen Werte geprüft. Der Export verwendet manuelles App-Store-Connect-Signing. Danach
prüft PraxisShield mit `codesign`:

- vollständige, strikte Signaturprüfung;
- erwartete Apple-Team-ID und Bundle-ID;
- kein Apple-Development-Zertifikat und kein `get-task-allow=true`;
- vorhandenes Wi-Fi-Information-Entitlement;
- exakten SHA-256-Fingerprint des freigegebenen Distribution-Zertifikats.

Keychain, P12, Profil und dekodierte Profilmetadaten werden im `always()`-Cleanup entfernt.

## Einmalige GitHub-Konfiguration

Vor dem ersten Produktionsrelease müssen zwei geschützte Environments mit Required Reviewern und
ohne Self-Approval angelegt werden:

- `production-android`: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`,
  `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`, `ANDROID_SIGNING_CERT_SHA256`;
- `production-ios`: `APPLE_CERTIFICATE_BASE64`, `APPLE_CERTIFICATE_PASSWORD`,
  `IOS_CI_KEYCHAIN_PASSWORD`, `APPLE_TEAM_ID`, `APPLE_PROVISIONING_PROFILE_BASE64`,
  `APPLE_PROVISIONING_PROFILE_NAME`, `APPLE_SIGNING_CERT_SHA256`;
- in beiden: `PRODUCTION_SUPABASE_URL`, `PRODUCTION_SUPABASE_ANON_KEY`,
  `PRODUCTION_API_BASE_URL`.

Für `main` sind mindestens diese Required Checks zu aktivieren:

- `CI / quality` und `CI / rls-pgtap`;
- `Secure SDLC / Dependency and SBOM Gate`;
- `Secure SDLC / Dependency Review Gate` für Pull Requests;
- `Secure SDLC / CodeQL SAST Gate`.

Zusätzlich sind Dependency Graph, Code Scanning, private Vulnerability Reports und Tag-Schutz für
`v*` zu aktivieren. Die Disclosure-Seite ist in `SECURITY.md` festgelegt.

## Patch- und Ausnahmeprozess

Die Fristen in `SECURITY.md` sind Zielwerte ab reproduzierbarer Bestätigung: kritisch 24 Stunden
Eindämmung/72 Stunden Fix, hoch 3/7 Tage, mittel 30 Tage und niedrig 90 Tage für die Korrektur.
Eine Ausnahme für einen bestätigten hohen oder kritischen Befund ist ausschließlich als ausführbare,
versionierte Entscheidung in `security/dependency-allowlist.json` zulässig. Sie benötigt pro Advisory
einen verantwortlichen Owner, exakte Paket-/Severity-/Range-/Versionsbindung, nachvollziehbare
Abhängigkeitspfade, Begründung, Kompensationsmaßnahme, Remediation und Ablaufdatum. Security und Product
geben die Änderung über den geschützten Reviewprozess frei.

`gate-dependencies.mjs` ruft den registry-aktuellen Audit selbst auf und akzeptiert nur GHSA-genaue
Ausnahmen mit Scope `build-toolchain`. Eine Ausnahme darf höchstens 31 Tage gelten. Neue Advisories,
geänderte Metadaten oder installierte Versionen, direkte App-/Worker-Abhängigkeiten, Runtime-Scope,
abgelaufene Einträge, ungültige Auditantworten und bereits behobene, aber nicht entfernte Einträge
blockieren fail-closed. Die Allowlist ersetzt daher weder den High/Critical-Grenzwert noch die
Dependency-Review-Prüfung für neue Pull Requests.

### Befristete Expo-SDK-51-Ausnahme

Der Registry-Audit vom 14.08.2026 enthält 13 blockierende Advisories in vier ausschließlich über die
Expo-/React-Native-Buildkette erreichten Paketen: `tar` (acht, davon eines kritisch), `postcss` (zwei),
`image-size` (zwei) und `turbo-stream` (eines). Keines dieser vier Pakete ist eine direkte PraxisShield-
App- oder Worker-Abhängigkeit. Die Verarbeitung ist auf lockfile-fixierte, repository-kontrollierte
Buildinputs und isolierte Runner begrenzt; PraxisShield betreibt insbesondere keinen Expo-/Remix-SSR-
Server. Die Einzelentscheidungen laufen am **13.09.2026** ab. Bis dahin muss der koordinierte Expo-/
React-Native-SDK-Upgradepfad die Pakete korrigieren oder jede verbleibende Ausnahme neu fachlich und
technisch bewertet werden.

## Verifikation und offene Gates

Die befristete Bereinigung wird in
[`SP3_01B_SUPPLY_CHAIN_UPGRADE_PLAN.md`](./SP3_01B_SUPPLY_CHAIN_UPGRADE_PLAN.md) gestuft umgesetzt.
Phase 1 migriert die JavaScript-basierten Actions auf geprüfte Node-24-Releases; anschließend folgen
die getrennte New-Architecture-Baseline, die SDK-Migration und das Entfernen aller Ausnahmen. Der
Feature-Branch-CI-Lauf `31814292278` bestand `quality` und `rls-pgtap` ohne Node-20-Annotation; der
Secure-SDLC-Nachweis folgt mit dem Pull Request gegen `main`.

Lokal bestanden:

- vollständiges `npm run verify` mit 440 bestandenen Tests, 6 bewusst übersprungenen Tests und
  2 Semantik-Snapshots;
- CycloneDX-Erzeugung und strukturelle Prüfung mit 1.724 Komponenten;
- Registry-aktuelles Dependency-Gate: 13 einzeln dokumentierte, bis 13.09.2026 befristete
  Build-Toolchain-Ausnahmen; jeder neue oder veränderte High/Critical-Befund blockiert;
- saubere `npm ci`-Installation mit reproduzierbar angewendetem `@expo/plist`-Kompatibilitätspatch
  für `@xmldom/xmldom` 0.9.11; ein frischer Node-22-Linux-Checkout normalisierte den führenden
  Template-Whitespace sicher und bestand anschließend den Expo-Prebuild für iOS und Android;
- Regressionstests für Action-SHA-Pinning, alle kritischen Gates, Android/iOS-Release-Verträge,
  SARIF-Grenzwert und idempotente Android-Gradle-Transformation.

GitHub-Evidenz für Commit `a26b8cf`:

- CI-Lauf [`31794686220`](https://github.com/kwhussam/praxis-ai/actions/runs/31794686220):
  `quality` einschließlich frischem Expo-Prebuild, unsigniertem Android-Release-Compile,
  Merge-Manifest-Prüfung und Gesamtverifikation sowie `rls-pgtap` vollständig grün;
- Secure-SDLC-Lauf [`31794686209`](https://github.com/kwhussam/praxis-ai/actions/runs/31794686209):
  Dependency-/SBOM-Gate und CodeQL-SAST-Gate vollständig grün; Dependency Review bei einem
  direkten Push erwartungsgemäß übersprungen und weiterhin für Pull Requests verpflichtend.

Vor Status `released` bleiben bewusst extern:

1. Einrichtung/Review der beiden Produktions-Environments und Branch-/Tag-Regeln;
2. ein echter signierter Android- und iOS-Testrelease, anschließend unabhängige Prüfung mit
   `gh attestation verify` und Abgleich der Store-Signieridentitäten;
3. benannte Owner für Patch-Triage und Vulnerability Inbox;
4. koordinierter Expo-/React-Native-Upgrade oder erneute formale Risikofreigabe vor Ablauf der
   Dependency-Ausnahmen am 13.09.2026.

## Primärquellen

- npm CycloneDX/SPDX SBOM: <https://docs.npmjs.com/cli/commands/npm-sbom/>
- GitHub Dependency Review: <https://docs.github.com/en/code-security/tutorials/secure-your-dependencies/customize-dependency-review-action>
- GitHub CodeQL Workflow: <https://docs.github.com/en/code-security/reference/code-scanning/workflow-configuration-options>
- GitHub Artifact Attestations: <https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations>
