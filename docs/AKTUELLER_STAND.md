# PraxisShield – Aktueller Stand

Stand: 2026-09-03 (SDK-57-Stufe)

Diese Datei ist die kompakte operative Übergabe. Sie beantwortet nach jedem Arbeitspaket:

1. Was wurde gemacht?
2. Welche Nachweise sind grün oder rot?
3. Welche Befunde sind offen?
4. Was ist der nächste konkrete Schritt?

Der normative Umfang und die langfristige Reihenfolge bleiben in
`docs/UMSETZUNGSPLAN_2026.md`. Diese Datei ersetzt den Umsetzungsplan nicht.

## Aktueller Arbeitskontext

- Stufe: isolierte Migration von Expo SDK 56 auf **SDK 57** (Phase 3 des Umsetzungsplans).
  SDK 57 ist die **Zielstufe** der Migrationskette und schließt den Hermes-v1-Rückstand.
- Branch: `claude/sp3-01b-sdk57`, direkt von `origin/main` am Stand
  `c2472b7024d6dd47c043b619119f0cfce9427644` abgezweigt (nach Merge von PR `#50`;
  GitHub-CI und Secure SDLC auf `main` grün).
- Ausgangspunkt: PR [`#49`](https://github.com/kwhussam/praxis-ai/pull/49)
  (konsolidierte Actions-Wartung) ist gemergt und die Post-Merge-CI auf `main` ist grün.
  Die überholten Dependabot-PRs `#44`, `#45` und `#46` sind geschlossen. Davor waren bereits
  PR `#47` (Dependency-Wartung) und PR `#48` (`@cloudflare/workers-types`) gemergt; die aktive
  Dependency-Allowlist ist leer.
- Die Umsetzung liegt in einem separaten Git-Worktree. Die parallele UI-Redesign-Arbeit im
  Hauptbaum bleibt unberührt.

## Was in der aktuellen SDK-57-Stufe gemacht wurde

**Versionen** — ausschließlich über `npx expo install`; `npx expo install --check` meldet
anschließend „Dependencies are up to date":

| Paket | SDK 56 | SDK 57 |
|---|---|---|
| `expo` | 56.0.21 | **57.0.19** |
| `react-native` | 0.85.3 | **0.86.3** |
| `react` / `react-dom` | 19.2.3 | 19.2.3 (unverändert) |
| `expo-router` | 56.2.20 | **57.0.18** |
| `react-native-reanimated` | 4.3.1 | 4.5.1 |
| `react-native-worklets` | 0.8.3 | 0.10.1 |
| `react-native-gesture-handler` | 2.31.2 | 2.32.0 |
| `react-native-screens` | 4.26.2 | 4.26.2 (unverändert) |
| `react-native-svg` | 15.15.4 | 15.15.4 (unverändert) |
| `expo-file-system` | 56.0.11 | 57.0.6 |
| `jest-expo` | 56.0.5 | 57.0.5 |
| `babel-preset-expo` | 56.0.20 | 57.0.10 |
| `typescript` | 6.0.3 | 6.0.3 (unverändert) |

**Plattform unverändert:** SDK 57 verlangt iOS 16.4 und Android minSdk 21. Das Projekt liegt mit
iOS 16.4 und minSdk 24 bereits darauf oder strenger; compileSdk und targetSdk bleiben 36. Die New
Architecture bleibt verpflichtend aktiv.

**Lockfile:** Die stufenweise Auflösung von `expo install --fix` lief in einen ERESOLVE-Konflikt,
weil `jest-expo@56` das `@react-native/jest-preset` der 0.85-Linie pinnt. Statt `--force` oder
`--legacy-peer-deps` wurden die von Expo selbst gemeldeten Dev-Versionen gesetzt und das Lockfile
aus dem dann kohärenten Manifest neu aufgelöst.

### Hermes-v1-Rückstand geschlossen — an der Runtime belegt

- React Native 0.86.3 liefert **`hermes-compiler 250829098.0.17`**. SDK 56 hatte
  `250829098.0.10`, der Fix beginnt bei `250829098.0.16`. Die Regression ist damit real behoben,
  nicht bloß aus der Doctor-Ausgabe verschwunden.
- Expo Doctor meldet real **21/21 ohne Befund** (die Hermes-Prüfung selbst entfällt upstream,
  daher 21 statt 22 Prüfungen).
- Das Gate hat die Drift zuvor korrekt **fail-closed gemeldet** — geänderte Prüfungsanzahl *und*
  veraltete Erwartung — statt sie stillschweigend zu akzeptieren. Genau dafür wurde es gebaut.
- `expectedFailedChecks` ist jetzt leer, `expectedOpenFinding` ist `null`. Das ist der strengste
  Zustand: Jeder Befund ist ab sofort undokumentiert und blockt. Der Regressionstest belegt
  ausdrücklich, dass ein **erneutes Auftreten** des Hermes-Befunds blockt.

### Vendor-Härtungen: beide weiterhin nötig, exakt neu gebunden

- `@expo/plist` 0.7.0 → **0.8.1** ruft `parseFromString` weiterhin einargumentig auf. Der
  ungepatchte Aufruf **wirft** unter dem erzwungenen xmldom 0.9.12 nachweislich; die Härtung ist
  also weiterhin Voraussetzung für funktionierendes Plist-Parsing.
- `expo-modules-core` 56.0.25 → **57.0.15** wertet weiterhin `requestedPermissions!!` aus.
- Der **`@xmldom/xmldom`-Override bleibt nötig**, weil `@expo/plist` selbst noch `^0.8.8`
  deklariert. Der Test prüft jetzt die Sicherheitsuntergrenze (0.9-Linie, `>= 0.9.11`) statt eines
  exakten Patches, der der Caret-Range widersprach.
- Nichts wurde entfernt, weil upstream nichts behoben ist. Die fail-closed Versionsprüfung bleibt.

### `expo-file-system` migriert

`lib/ai/report-pdf.ts` nutzt nicht mehr `expo-file-system/legacy`, dessen Wurzelmethoden in SDK 57
zur Laufzeit werfen. Statt `makeDirectoryAsync`/`writeAsStringAsync`/`deleteAsync` jetzt
`File`/`Directory`/`Paths`; die Bytes werden direkt geschrieben, der Base64-Umweg entfällt.
Exporte liegen unverändert ausschließlich unter `Paths.cache` — nicht persistent, nicht
backupfähig; fällt der Cache aus, wird abgelehnt statt auf das Dokumentverzeichnis auszuweichen.
Weil die neue API beim Löschen fehlender Einträge wirft, sind Logout, Praxiswechsel und die
Bereinigung nach fehlgeschlagenem Teilen über eine Existenzprüfung idempotent. Die
PDF-Signaturprüfung läuft jetzt **vor** jedem Dateisystemzugriff, damit eine fehlerhafte
Serverantwort ein kontrollierter Fehler bleibt und kein Teilartefakt zurücklässt. Tests von 6 auf 10.

### Icons: Migration nicht erforderlich, Barrel-Import trotzdem beseitigt

SDK 57 erzwingt **keinen** Wechsel auf die scoped `@react-native-vector-icons`-Pakete;
`@expo/vector-icons` 15.1.1 ist mit RN 0.86 kompatibel und Doctor meldet keinen Befund. Die
Migration bleibt deshalb bewusst aus — sie wäre ein eigener Schritt mit anderer
Font-Registrierung. Messbar unnötig war jedoch der Barrel: Alle zwölf Stellen importierten
`Ionicons` über `@expo/vector-icons`, das alle 24 Familien re-exportiert. Die Importe zeigen jetzt
auf `@expo/vector-icons/Ionicons`. Die Produktionsbundles sind entsprechend kleiner geworden
(iOS 8.4 → 8.3 MB, Android 8.6 → 8.5 MB).

### Erhaltene Verträge

- **SecureStore:** Der operative Probe (`lib/security/secureStoreAvailability.ts`) bleibt
  unverändert in Kraft; `isAvailableAsync` allein gilt weiterhin nicht als Nachweis. Auth fällt bei
  Keychain-Fehlern ausschließlich auf flüchtigen RAM zurück, die verschlüsselte Inventarpersistenz
  auf `volatile`. Alle zugehörigen Tests laufen unverändert.
- **Metro/E2E:** `--no-bundler`, eigener Metro-Prozess, fail-closed Ablehnung fremder Instanzen,
  gemeinsamer Host/Port für Listener, Healthcheck und Deep-Link, `exec` für zuverlässiges Beenden
  sowie die iOS-26-Fokus- und Single-Submit-Flows sind unverändert übernommen.

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

## Was in der Actions-Wartung gemacht wurde (abgeschlossen, PR #49)

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

## Was in der aktuellen SDK-56-Stufe gemacht wurde

- **Migrierte Versionen** (exakt aufgelöst, nicht geschätzt): Expo `55.0.30` → `56.0.21`,
  React Native `0.83.10` → `0.85.3`, React und React DOM `19.2.0` → `19.2.3`,
  Expo Router `55.0.18` → `56.2.20`, Reanimated `4.2.1` → `4.3.1`,
  Worklets `0.7.4` → `0.8.3`, Screens `4.23.0` → `4.26.2`, SVG `15.15.3` → `15.15.4`,
  `jest-expo` `55.0.22` → `56.0.5`, `babel-preset-expo` `55.0.25` → `56.0.20`,
  TypeScript `5.9.3` → `6.0.3`. Die New Architecture bleibt verpflichtend aktiv.
- **`react-test-renderer` auf React-Stand gezogen:** `19.0.0` → `19.2.3`, exakt gepinnt und
  maschinengeprüft. Ein abweichender Renderer würde einen anderen Reconciler testen als die
  App ausliefert; der Rückstand aus der SDK-55-Stufe ist damit geschlossen.
- **Plattformgrenzen:** iOS Deployment Target `15.1` → `16.4` (von `expo-build-properties` in
  SDK 56 fail-closed erzwungen). Android bleibt unverändert bei minSdk 24 und
  compileSdk/targetSdk 36.
- **React Navigation entfernt:** SDK 56 entkoppelt Expo Router von React Navigation; Router 56
  baut auf seinem eigenen `standard-navigation`-Fork. `@react-navigation/native` war
  verwaist — kein einziger Import in `app/`, `lib/` oder `components/`, und laut `npm ls`
  verlangte es nur noch das Wurzelpaket selbst. Die Entfernung ist damit belegt, nicht
  vermutet; Expo Doctors eigene Prüfung dazu ist jetzt grün.
- **Config-Plugins auf den stabilen Einstiegspunkt umgestellt:** SDK 56 hoistet
  `@expo/config-plugins` nicht mehr ins Wurzel-`node_modules`, wodurch alle drei eigenen
  Plugins beim Auflösen der App-Config brachen. Sie nutzen jetzt den von Expo dafür
  exportierten Pfad `expo/config-plugins`.
- **`baseUrl` aus `tsconfig.json` entfernt:** TypeScript 6 deprecatet die Option. Die
  Pfad-Aliase (`@/*` → `./*`) werden seit TS 4.1 relativ zur `tsconfig.json` aufgelöst und
  bleiben unverändert. Die Deprecation wurde migriert, nicht per `ignoreDeprecations`
  stummgeschaltet.

### Vendor-Hardening: neu bewertet, nicht nur umnummeriert

Beide Absicherungen wurden gegen die tatsächlich installierten SDK-56-Quellen geprüft. **Upstream
hat keines der beiden Probleme behoben**, deshalb wurden beide portiert statt entfernt:

- `@expo/plist` `0.5.4` → `0.7.0` ruft weiterhin `parseFromString(xml)` mit nur einem Argument
  auf. Der Sicherheits-Override hebt `@xmldom/xmldom` auf `^0.9.11`, weil `@expo/plist` selbst
  noch die ältere `^0.8.8`-Linie deklariert. Unter xmldom 0.9 **wirft** der Ein-Argument-Aufruf
  (`the provided mimeType "undefined" is not valid`) — die Härtung ist also funktional zwingend,
  nicht kosmetisch. Der Override bleibt deshalb ebenfalls bestehen.
- `expo-modules-core` `55.0.25` → `56.0.25` wertet weiterhin
  `requestedPermissions!!.contains(permission)` aus. Ein Paket ohne angeforderte Berechtigungen
  lässt die erzwungene Nicht-null-Auswertung in der Manifest-Berechtigungsprüfung werfen.

Die fail-closed Versionsprüfung bleibt unverändert: Jede künftige Versionsanhebung erzwingt
diese Bewertung erneut. Der Regressionstest prüft nun **jede** der sechs
`@expo/plist`-Installationen (SDK 56 hoistet nicht mehr) und belegt die Wirksamkeit zusätzlich
durch einen echten Parse-Aufruf statt nur durch einen Textvergleich.

### `expo/fetch` als Standard-`fetch` — nur zur Laufzeit prüfbar

SDK 56 ersetzt `globalThis.fetch` durch `expo/fetch` (Opt-out über
`EXPO_PUBLIC_USE_RN_FETCH=1`). Es wurde **kein** Opt-out gesetzt; der SDK-56-Standard bleibt aktiv.

Betroffen sind zwei Stellen mit unterschiedlicher Risikolage:

- `lib/api/client.ts` setzt Timeouts über `AbortController` und `signal`. Abbruch- und
  Timeout-Semantik sind damit implementierungsabhängig.
- `lib/security/networkProbes.ts` spricht per `fetch` lokale Netzknoten im Klartext an; die
  ATS-Ausnahme dafür ist bewusst auf `NSAllowsLocalNetworking` begrenzt.

Die Jest-Suite mockt `fetch` und kann diesen Austausch deshalb **grundsätzlich nicht** abdecken.
Der Nachweis gehört in den Laufzeit-Smoke (WLAN-Seite und Worker-Aufrufe) und steht auf dieser
Stufe noch aus. Es wurde nichts an den Aufrufstellen geändert — eine Anpassung ohne Laufzeitbefund
wäre geraten, nicht belegt.

### Review-Nachtrag: SecureStore operativ geprüft, E2E-Metro versionsrein

Zwei Review-Befunde sind behoben.

**SecureStore.** `isAvailableAsync()` belegt nur, dass das native Modul gelinkt ist — nicht, dass
ein Keychain-Zugriff gelingt. Ein fehlendes Entitlement oder ein gesperrtes Gerät lässt den
ersten echten Zugriff werfen, während die Verfügbarkeitsprüfung weiterhin `true` meldet. Der
gemeinsame Probe `lib/security/secureStoreAvailability.ts` führt deshalb zusätzlich einen echten
`getItemAsync` aus. Auth-Token werden zuerst in den flüchtigen Speicher geschrieben und nur bei
erfolgreichem Probe zusätzlich in SecureStore; jeder einzelne `getItemAsync`/`setItemAsync`/
`deleteItemAsync` ist abgefangen und fällt ausschließlich auf den Arbeitsspeicher zurück. Kein
Token erreicht AsyncStorage, SQLite, Dateien oder Logging — maschinengeprüft. Für Inventarschlüssel
gilt die strengere Regel: Ohne funktionierenden sicheren Speicher entsteht **kein** verschlüsselter
SQLite-Snapshot; das Repository meldet `volatile`, die Synchronisierung bleibt blockiert und die UI
weist auf „Nur flüchtiger Speicher" hin.

**E2E-Metro.** `e2e:app:*` baut und installiert nur noch die native App (`--no-bundler`);
`e2e:smoke` startet seinen eigenen Metro und beendet ihn per `trap` wieder. Ein bereits belegter
Port führt zu Exit 1, bevor Supabase hochgefahren wird — ein fremder Server stammt aus einer
unbekannten Revision und könnte ein veraltetes Bundle ausliefern. Die Dev-Client-URL wird von
`scripts/e2e/dev-client-url.mjs` erzeugt statt von Hand prozentkodiert, womit auch IPv6-Literale
und abweichende Ports korrekt sind.

### Hermes v1 — bekanntes, nicht schließbares Risiko dieser Stufe

- SDK 56 aktiviert **Hermes v1 standardmäßig**. Genau diese Konfiguration wird hier verwendet:
  `hermesEnabled=true` (Android) und `"expo.jsEngine": "hermes"` (iOS), **ohne** das in
  `expo-build-properties` mögliche `useHermesV1`-Opt-out.
- Expo Doctor bestätigt: das installierte Hermes v1 `250829098.0.10` ist von der dokumentierten
  Speicherregression betroffen, die `react-native-worklets` und `react-native-reanimated` trifft.
  Der Fix erscheint erst in Hermes v1 `250829098.0.16` / React Native `0.86.2`.
- Das Risiko ist **innerhalb von SDK 56 strukturell nicht lösbar**. Es ist der Grund, warum diese
  Stufe eine Übergangsstufe bleibt und **nicht produktiv freigegeben** wird. Die abschließende
  Neubewertung erfolgt in der SDK-57-Stufe.
- **Durchgesetzt wird das von `scripts/gate-expo-doctor.mjs`**, nicht von einer notierten Zahl.
  Das Gate startet den über die Baseline gepinnten Doctor (`expo-doctor@1.20.4`) wirklich,
  vergleicht das echte Ergebnis und blockt fail-closed in beide Richtungen: bei jedem
  zusätzlichen Befund **und** wenn der dokumentierte Befund verschwindet, weil die Baseline dann
  veraltet ist. Es läuft im `quality`-Job **vor** `npm run verify` und ist über
  `npm run security:expo-doctor` auch lokal ausführbar.
- Bewusst wurde **kein** Opt-out gesetzt: SDK 57 wird ebenfalls auf Hermes v1 laufen (dann
  gefixt). Auf Hermes v0 auszuweichen würde genau die Laufzeit verbergen, die die Zielstufe
  verwendet, statt sie früh zu prüfen. Grüne Unit-Tests sind ausdrücklich **keine**
  Produktionsfreigabe.

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

## Verifikation der SDK-57-Stufe

| Nachweis | Ergebnis | Einordnung |
|---|---|---|
| `npm ci` | grün | frischer Install; beide Vendor-Härtungen fail-closed reproduziert |
| `npm run lint` | grün | keine Warnungen (`--max-warnings=0`) |
| `npm run typecheck` | grün | TypeScript 6.0.3 |
| `npm test -- --runInBand` / `npm run verify` | grün: **504 bestanden**, 6 übersprungen | +4 gegenüber SDK 56 durch die erweiterten PDF-Tests |
| `npm run security:dependencies` | grün | **0 aktive High-/Critical-Ausnahmen**, keine neue Ausnahme |
| `npm audit` | grün | keine High-/Critical-Befunde; 14 moderate, keine davon Laufzeit-relevant allowlistet |
| `npm run security:expo-doctor` | grün | echter Lauf des gepinnten `expo-doctor@1.20.4`: **21/21, kein Befund** |
| Doctor-Gate blockt nachweislich | grün | fixture-getestet: Wiederauftreten des Hermes-Befunds, jeder andere neue Befund, geänderte Prüfungsanzahl und unlesbare Ausgabe geben Exit 1 |
| `git diff --check` | grün | keine Whitespace-Fehler |
| `npx expo prebuild --clean --no-install` | grün | Android und iOS reproduzierbar erzeugt |
| `npm run verify:native-config` | grün | Entitlements, Backup-Regeln, Berechtigungen und Release-Stripping unverändert |
| iOS Unsigned Release Build | grün | `BUILD SUCCEEDED` mit Xcode 26.6 |
| Sicherheitsvertrag im gebauten Produkt | grün | `MinimumOSVersion 16.4`, ATS ohne `NSAllowsArbitraryLoads`, Zweckstrings vorhanden, kein `NSBonjourServices`, eingebettetes `main.jsbundle` |
| iOS-Produktionsbundle | grün | Hermes-Bytecode **8.3 MB** (SDK 56: 8.4 MB) |
| Android-Produktionsbundle | grün | Hermes-Bytecode **8.5 MB** (SDK 56: 8.6 MB) |
| Wrangler Worker-Dry-Run | grün | 296.74 KiB / gzip 67.71 KiB, Bindings unverändert |
| **Android Unsigned Release Compile** | **nicht lokal ausgeführt** | Android-SDK-Plattform 36 weiterhin nicht installiert, kein `sdkmanager`. Zwingendes GitHub-CI-Gate. |
| **`npm run verify:android-release-manifest`** | **nicht lokal ausführbar** | scheitert fail-closed am fehlenden Android-Release-Output; hängt am vorigen Punkt |
| **Kurzer iOS-Boot-/Auth-Smoke** | **nicht ausgeführt** | Der Simulator-Build brach mit `lipo: No space left on device` beim dSYM ab. Kein Codebefund: derselbe Quellstand hat den signaturfreien `iphoneos`-Release-Build erfolgreich erzeugt. |
| **Vollständiger 15-Flow-Maestro-Lauf** | **nicht ausgeführt** | Docker auf diesem Rechner nicht ansprechbar, damit kein lokales Supabase; zusätzlich lief das Datenvolume an die Kapazitätsgrenze |
| **Android-Smoke** | **nicht ausgeführt** | kein Emulator verfügbar |
| Physische Geräte-Smokes | zurückgestellt | bleiben wie vereinbart ein späteres Produktions-Gate |

Die fett markierten Zeilen sind **nicht** bestanden und dürfen nicht als bestanden gelesen werden.

## Verifikation der SDK-56-Stufe (historisch)

| Nachweis | Ergebnis | Einordnung |
|---|---|---|
| `npm ci` | grün | frischer Install; beide Vendor-Härtungen fail-closed reproduziert |
| `npm run verify` | grün: 500 bestanden, 6 übersprungen | Lint, TypeScript 6.0.3 und Jest einschließlich neuer Metro-/SecureStore-Verträge |
| `npm run security:dependencies` | grün | **0 aktive High-/Critical-Ausnahmen**; keine neue Ausnahme eingetragen |
| `npm run security:expo-doctor` | grün | führt den gepinnten `expo-doctor@1.20.4` aus und wertet das echte Ergebnis aus: **21/22**, einziger Befund ist die Hermes-v1-Regression |
| Doctor-Gate blockt nachweislich | grün | fixture-getestet: zusätzlicher Befund, verschwundener Befund und unlesbare Ausgabe führen jeweils zu Exit 1 |
| `git diff --check` | grün | keine Whitespace-Fehler |
| Clean Prebuild | grün | `npx expo prebuild --clean --no-install` erzeugt Android und iOS reproduzierbar |
| `npm run verify:native-config` | grün | Entitlements, Backup-Regeln, Berechtigungen und Release-Stripping unverändert |
| iOS Unsigned Release Build | grün | `BUILD SUCCEEDED` mit Xcode 26.6; App-Bundle mit eingebettetem `main.jsbundle` |
| Sicherheitsvertrag im gebauten Produkt | grün | `MinimumOSVersion 16.4`, ATS ohne `NSAllowsArbitraryLoads`, Zweckstrings vorhanden, kein `NSBonjourServices` |
| iOS-Produktionsbundle | grün | Hermes-Bytecode `8.4 MB` (`.hbc`) |
| Android-Produktionsbundle | grün | Hermes-Bytecode `8.6 MB` (`.hbc`) |
| Android Unsigned Release Compile | grün in GitHub-CI | `android-release-compile` einschließlich zusammengeführter Manifest-Prüfung bestanden; lokal weiterhin keine Android-SDK-Plattform 36 |
| `npm run verify:android-release-manifest` | grün in GitHub-CI | Release-Manifest fail-closed gegen Backup-, Cleartext-, Berechtigungs- und Signing-Regeln geprüft |
| Fokussierter iOS-Simulator-Smoke | grün: 7/7 | iPhone 17 Pro / iOS 26.5, Release-Build: App-Start, Auth-Screen gerendert, `auth-submit`-testID vorhanden, Navigation zur Registrierung — unter Hermes v1 und New Architecture |
| Vollständiger 15-Flow-Maestro-Lauf | grün: 15/15 | iPhone 17 Pro / iOS 26.5; Auth, Onboarding, Fragebogen, WLAN, Fehlerpfade, Tenant-Isolation, verschlüsselte Inventarpersistenz, Dashboard und PDF-Export |
| Physische Geräte-Smokes | zurückgestellt | bleiben wie vereinbart ein späteres Release-Gate |

Zum fokussierten Smoke: Er belegt, dass der migrierte Stack real bootet — Hermes v1 führt das
Bundle aus, die New-Architecture-App startet, Expo Router mountet die Auth-Route und die UI
rendert. Ein erster Startversuch schlug mit `Error: supabaseUrl is required.` fehl; Ursache war
die fehlende `.env` im isolierten Worktree, also die **fail-closed Konfigurationsprüfung der App
selbst**, kein SDK-56-Defekt. Mit lokalen Platzhalterwerten startet die App sauber. Der Smoke
deckt bewusst nur die backend-unabhängigen Pfade ab; alles Weitere braucht das geseedete
Supabase.

## Verifikation der SDK-55-Stufe (historisch)

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

Der abschließende vollständige Lauf am 3. September bestand 15/15 Flows. Die zwischenzeitlichen
Fehler in Registrierung, WLAN, Report-Fehlerpfad und Inventar waren Harness-Probleme bei Fokus,
Systemdialogen, doppeltem Submit und Sichtbarkeit — keine fachlichen Sicherheitsbefunde.

### Geschlossen – Zwei befristete `image-size`-Ausnahmen

Die optionale Peer-Auflösung installierte neben Expos Metro-Konfiguration zusätzlich
`@react-native/metro-config` und darüber `image-size@1.2.1`, obwohl PraxisShield diesen Pfad nicht
verwendet. Der kontrollierte Lockfile-Refresh entfernt diese optionale Kette. `npm ci`, alle Tests
und beide nativen Produktionsbundles belegen die Verträglichkeit; das Dependency-Gate akzeptiert
nun 0 Ausnahmen.

### P3 – Physischer Runtime-Nachweis bleibt offen

Der Android-Release-Compile ist in GitHub grün. Die iOS-Simulator-Smokes decken Netzwerk-/WLAN-,
Persistenz-, Auth-/Tenant- und PDF-Cache-Pfade nun über den vollständigen grünen 15/15-Lauf ab.
Die vollständige physische iOS-/Android-Matrix
bleibt wie vereinbart das spätere Produktions-Gate.

### Technische Rückstände außerhalb dieses SDK-Schritts

- Migration des PDF-Caches von `expo-file-system/legacy` auf die neue API;
- React Test Renderer `19.0` als reine Test-Infrastruktur;
- Icon-Migration vor dem endgültigen SDK-57-Ziel;

## Als Nächstes

1. Den SDK-57-Branch pushen und einen Pull Request gegen `main` erstellen. **Nicht selbst mergen.**
2. GitHub-CI und Secure SDLC grün prüfen. Entscheidend sind der Job `android-release-compile`
   samt `verify:android-release-manifest` und das neue Doctor-Gate, das in CI dieselbe 21/21-Lage
   liefern muss wie lokal.
3. Den vollständigen seriellen 15-Flow-Maestro-Lauf nachholen, sobald Docker und Speicherplatz
   verfügbar sind: `npm run e2e:env:up`, danach `npm run e2e:smoke`. Die vier zuletzt
   empfindlichen Flows `01-registration`, `06-wlan-scan`, `08-report-generation-error` und
   `13-inventory-persistence` sind dabei ausdrücklich zu kontrollieren, ebenso der PDF-Export
   samt nativer Share-UI und Klartext-Cache-Bereinigung — Letzterer hat sich durch die
   Dateisystem-Migration inhaltlich geändert und ist deshalb der wichtigste Runtime-Nachweis
   dieser Stufe.
4. Android-Smoke (`npm run e2e:smoke:android`) nachziehen, sobald ein Emulator verfügbar ist.
5. Nach grünem Review und Merge: physische iOS-/Android-Gerätematrix als Produktions-Gate planen.
   Damit endet die Migrationskette; SDK 57 ist die Zielstufe.

## Bewusste Grenzen

- **SDK 57 ist die Zielstufe, aber noch keine Produktionsfreigabe.** Die Hermes-v1-Regression ist
  geschlossen; ausstehend bleiben der vollständige Maestro-Lauf und die physische Gerätematrix.
- Der **vollständige 15-Flow-Maestro-Lauf ist auf dieser Stufe nicht ausgeführt** und gilt nicht
  als bestanden: Docker ist auf diesem Rechner nicht ansprechbar und das Datenvolume lief während
  der Arbeit an die Kapazitätsgrenze. Besonders der PDF-Flow braucht diesen Nachweis, weil die
  Dateisystem-Migration genau dort eingreift.
- Auch der **kurze iOS-Boot-/Auth-Smoke ist nicht ausgeführt**: Der dafür nötige Simulator-Build
  scheiterte an erschöpftem Speicherplatz (`lipo: No space left on device`). Der Laufzeitnachweis
  dieser Stufe steht damit **vollständig** aus; die statischen Gates und der `iphoneos`-Release-
  Build ersetzen ihn ausdrücklich nicht. Es gibt also **keinen** Runtime-Beleg dafür, dass die
  migrierte SDK-57-App bootet — das ist die wichtigste offene Lücke dieser Stufe.
- Der lokale **Android-Release-Compile konnte nicht ausgeführt werden**: Die Android-SDK-Plattform
  36 ist auf diesem Rechner nicht installiert und es gibt weder `sdkmanager` noch cmdline-tools,
  um sie ohne zusätzliche Werkzeuginstallation nachzuziehen. Der Beweis bleibt damit — wie schon
  in der SDK-53-Stufe — durch das grüne GitHub-CI-Gate erbracht, aber nicht lokal wiederholt.
- Die physische iOS-/Android-Gerätematrix bleibt wie vereinbart für das spätere
  Produktionsfreigabe-Gate zurückgestellt.
- Die lokale Simulatorprüfung ersetzt keine spätere Prüfung auf physischen iOS-/Android-Geräten.
- Der Rechner lief während dieser Stufe an der Speichergrenze; regenerierbare Build-Caches
  (Gradle, Xcode DerivedData, CocoaPods, npm) wurden nach Rücksprache geleert. Kein Worktree und
  kein Quellcode wurde entfernt.

## Abnahmekriterium für den nächsten Schritt

- `npm ci`, `npm run verify` und `npm run security:dependencies` grün;
- Expo Doctor ohne **zusätzlichen** Befund neben der als `expectedOpenFinding` hinterlegten
  Hermes-v1-Regression;
- Vendor-Härtung fail-closed grün für `@expo/plist@0.7.0` und `expo-modules-core@56.0.25`;
- GitHub-CI und Secure SDLC grün, insbesondere `android-release-compile` samt Manifest-Prüfung;
- vollständiger serieller 15-Flow-Maestro-Lauf grün;
- Dependency-Gate, Clean Prebuild und Native-Config grün;
- iOS- und Android-Produktionsbundle grün;
- Android-Release-Compile in GitHub-CI grün;
- iOS-Release-Build und vollständiger 15/15-Simulatorlauf unter Xcode 26 grün;
- keine High-/Critical-Abhängigkeiten und keine aktive Dependency-Ausnahme;
- unabhängiges Review ohne offenen P1-/P2-/P3-Codebefund.
