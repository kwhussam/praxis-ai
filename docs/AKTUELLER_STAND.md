# PraxisShield – Aktueller Stand

Stand: 2026-08-27

Diese Datei ist die kompakte operative Übergabe. Sie beantwortet nach jedem Arbeitspaket:

1. Was wurde gemacht?
2. Welche Nachweise sind grün oder rot?
3. Welche Befunde sind offen?
4. Was ist der nächste konkrete Schritt?

Der normative Umfang und die langfristige Reihenfolge bleiben in
`docs/UMSETZUNGSPLAN_2026.md`. Diese Datei ersetzt den Umsetzungsplan nicht.

## Aktueller Arbeitskontext

- Stufe: `sdk55` – erster Expo-Stand mit verpflichtender React-Native-New-Architecture.
- Branch: `codex/sp3-01b-sdk55`, abgezweigt von aktuellem `origin/main` am Merge-Commit
  `165fea5548b5c3ebce96f8cd109e4c93cbfccc98`.
- Ausgangspunkt: SDK 54 mit aktivierter New Architecture wurde als PR `#39` gemergt; die
  nachgelagerten GitHub-Läufe `CI` und `Secure SDLC` waren grün.
- Die Umsetzung liegt in einem separaten Git-Worktree. Die parallele UI-Redesign-Arbeit im
  Hauptbaum bleibt unberührt.

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
- **Dependency-Allowlist neu bewertet:** Zwei PostCSS-Advisories sind mit PostCSS `8.5.26` behoben.
  Übrig bleiben zwei befristete High-Advisories von `image-size@1.2.1`, ausschließlich transitiv
  über React Native/Metro in der Buildkette. Neue Befunde blockieren weiterhin fail-closed.

## Verifikation

| Nachweis | Ergebnis | Einordnung |
|---|---|---|
| `npm ci` | grün | Lockfile und Vendor-Härtung aus einem frischen Install reproduziert |
| `npm run verify` | grün: 487 Tests bestanden, 6 übersprungen | Lint, TypeScript und Jest einschließlich SDK-/Supply-Chain-Verträgen |
| `npm run security:dependencies` | grün | 2 befristete Build-Toolchain-Ausnahmen; 2 PostCSS-Befunde geschlossen |
| Clean Prebuild | grün | native Projekte reproduzierbar aus versionierter Konfiguration erzeugt |
| `verify:native-config` | grün | Android New Architecture, iOS-Entitlements und Release-Stripping geprüft |
| Expo Doctor 1.20.3 | **19/20** | einzige Beanstandung: lokales Xcode `16.4`; SDK 55 verlangt Xcode `26` |
| iOS Release-Build | lokal blockiert | mit Xcode 16.4 nicht zulässig; Nachweis muss auf Xcode 26 erfolgen |
| Android Release-Build | ausstehend | verbindlicher Nachweis im PR-Job `android-release-compile` |
| iOS-/Android-Bundles | grün | beide Hermes-Produktionsbundles mit Expo Router und Worklets erzeugt |
| Simulator-/Geräte-Smokes | ausstehend | SDK-55-Smoke benötigt eine Xcode-26-Umgebung; physische Matrix bleibt Release-Gate |

## Offene Befunde

### P3 – Xcode 26 ist ein hartes SDK-55-Gate

Ein iOS-Release-Build oder Simulator-Smoke mit Xcode 16.4 wäre kein gültiger SDK-55-Nachweis. Vor
dem Merge muss ein CI-/Mac-Runner mit Xcode 26 den iOS-Build und den fokussierten Smoke ausführen
oder die lokale Xcode-Installation aktualisiert werden. Dieser Umgebungsbefund wird nicht als
bestandener Test umgedeutet.

### P3 – Zwei befristete `image-size`-Ausnahmen

React Native 0.83.10 zieht über Metro weiterhin `image-size@1.2.1`. Die Advisories betreffen nur
repository-kontrollierte Build-Assets auf isolierten Runnern und gelangen nicht als
Anwendungslogik in App oder Worker. Sie bleiben bis spätestens 2026-09-13 befristet und werden in
der SDK-56-Stufe erneut geprüft.

### P3 – Android- und Runtime-Nachweis bleiben extern

Der PR muss den Android-Release-Compile bestehen. Native Netzwerk-Probes, WLAN/Permissions,
verschlüsselte Persistenz, PDF-Cache und Tenant-Wechsel müssen zusätzlich mindestens im
fokussierten SDK-55-Smoke auf einer kompatiblen Plattform bestehen. Die vollständige physische
iOS-/Android-Matrix bleibt wie vereinbart das spätere Produktions-Gate.

### Technische Rückstände außerhalb dieses SDK-Schritts

- Migration des PDF-Caches von `expo-file-system/legacy` auf die neue API;
- React Test Renderer `19.0` als reine Test-Infrastruktur;
- Icon-Migration vor dem endgültigen SDK-57-Ziel;
- zwei `image-size`-Ausnahmen aus der Metro-Buildkette.

## Als Nächstes

1. Diesen isolierten SDK-55-Stand committen, Branch pushen und einen PR gegen `main` erstellen.
2. GitHub-CI einschließlich `android-release-compile`, Secure SDLC und Dependency-Gate prüfen.
3. Auf Xcode 26 einen iOS-Release-Build und den fokussierten seriellen Simulator-Smoke ausführen;
   Ergebnis in dieser Datei dokumentieren.
4. Erst nach grünen Pflicht-Gates und Review mergen. Danach SDK 56 als eigene, nicht produktiv
   freigegebene Übergangsstufe beginnen und die zwei `image-size`-Ausnahmen erneut bewerten.

## Bewusste Grenzen

- Die physische iOS-/Android-Gerätematrix bleibt wie vereinbart für das spätere
  Produktionsfreigabe-Gate zurückgestellt.
- Xcode 16.4 kann keine gültige SDK-55-iOS-Evidenz liefern; dafür ist Xcode 26 erforderlich.

## Abnahmekriterium für den nächsten Schritt

- `npm ci`, `npm run verify`, Dependency-Gate, Clean Prebuild und Native-Config grün;
- iOS- und Android-Produktionsbundle grün;
- Android-Release-Compile in GitHub-CI grün;
- iOS-Release-Build und fokussierter Simulator-Smoke unter Xcode 26 grün;
- keine neuen High-/Critical-Abhängigkeiten und höchstens die zwei dokumentierten,
  nicht abgelaufenen Build-Toolchain-Ausnahmen;
- unabhängiges Review ohne offenen P1-/P2-/P3-Codebefund.
