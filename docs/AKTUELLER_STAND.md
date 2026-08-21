# PraxisShield – aktueller Umsetzungsstand

Stand: 21. August 2026

Aktiver Arbeitszweig: `codex/sp3-01b-sdk53`

Pull Request: #29

Diese Datei ist das kurze operative Übergabeprotokoll zum ausführlichen
`UMSETZUNGSPLAN_2026.md`. Sie beantwortet bei jedem Arbeitspaket drei Fragen:
Was wurde umgesetzt, wie wurde es verifiziert und was kommt als Nächstes?

## Aktuelles Arbeitspaket: SP3-01B – Expo-SDK-53-Migration im Simulator verifiziert

### Umgesetzt

- Expo ist auf 53.0.27, React Native auf 0.79.6 und React/React DOM auf Expos unterstützten
  SDK-53-Pin 19.0.0 migriert. Keines der von den React-Server-Component-CVEs betroffenen
  `react-server-dom-*`-Pakete ist installiert; ein Regressionstest blockiert deren späteres
  Auftauchen. Expo Router 5.1.11 und `jest-expo` 53.0.14 enthalten die zugehörigen
  Herstellerkorrekturen.
- Die Legacy Architecture bleibt als bewusste Zwischenstufe mit `newArchEnabled: false`
  aktiviert. Die New Architecture wird erst im getrennten SDK-54-Arbeitspaket bewertet.
- Die beiden weiterhin erforderlichen Vendor-Patches wurden versionsgenau für
  `@expo/plist` 0.3.5 und `expo-modules-core` 2.5.0 erneuert. `@expo/plist` fordert weiterhin
  `xmldom ^0.8.8`; der sichere Override 0.9.11 benötigt zwingend MIME-Type und Whitespace-
  Normalisierung. Ein Regressionstest führt genau diesen Parsepfad aus, und ein Versionswechsel
  lässt `postinstall` weiterhin fail-closed scheitern.
- Das lokale iOS-Network-Probe-Plugin ist an das Swift-first-Template von React Native 0.79
  angepasst. Die in SDK 53 entfernte `IOSConfig.Swift`-Hilfs-API wird nicht mehr verwendet;
  Bridging Header und Probe bleiben reproduzierbar über den Clean Prebuild eingebunden.
- React-19-Typänderungen und das asynchrone Verhalten des Test Renderers sind in den betroffenen
  Tests explizit abgebildet. Produktlogik oder Security-Fakten wurden dafür nicht abgeschwächt.
- Metro Package Exports bleiben im SDK-53-Standard aktiv. Sowohl iOS als auch Android konnten
  damit einschließlich Supabase als Produktionsbundle exportiert werden; ein globaler
  Kompatibilitäts-Downgrade war nicht nötig.
- Acht durch die neue Expo-Buildkette behobene `tar`-Advisories sind aus den aktiven Ausnahmen
  entfernt und als SDK-53-Remediation historisch dokumentiert. Nur vier befristete
  Build-Toolchain-Ausnahmen bleiben aktiv.
- Der serielle Maestro-Bootstrap setzt unter Expo Router 5 vor jedem Flow die App-Route explizit
  zurück. Auth-Flows besitzen zusätzlich einen bedingten Submit-Fallback, falls iOS `Enter` nur
  zum Schließen der Tastatur verwendet. Damit können Deep Links und Eingabeverhalten eines Flows
  keine Folgetests mehr verfälschen.

### Verifiziert

- Reproduzierbares `npm ci` einschließlich beider versionsgebundener Patches: bestanden.
- `npm run verify`: 52 Suites und 469 Tests grün; 6 bekannte Remote-/Gerätetests explizit
  übersprungen.
- Expo Doctor 1.20.2: 18/18 Prüfungen grün.
- Clean Expo Prebuild und `npm run verify:native-config`: bestanden.
- Produktionsbundle-Export für iOS und Android: bestanden.
- Dependency-Gate: grün; vier genehmigte, zeitlich begrenzte Ausnahmen ausschließlich für die
  Build-Toolchain, keine Laufzeit-Ausnahme.
- CycloneDX-SBOM: 1.225 Dependency-Komponenten mit Node 22/npm 10 erzeugt und validiert.
- Lokaler arm64-iOS-Release-Simulator-Build ohne Codesignierung: bestanden, einschließlich Pods,
  Hermes, App-Linking und eingebettetem Produktionsbundle.
- Serieller iOS-Simulator-Smoke auf iPhone 16 Plus / iOS 18.6: 15/15 Flows grün, 0 Fehler. Er
  umfasst Registrierung, Login, Onboarding, Fragebogen, WLAN, Report-Fehlerpfad,
  Datenschutzrollen, Passwort-Reset, Einladung, verschlüsselte Inventarpersistenz, responsives
  Dashboard und kanonischen PDF-Export.

## Nächster Schritt

1. Nach gesonderter Freigabe den Review-Fix auf Pull Request #29 pushen. GitHub-CI muss insbesondere
   Android Release, Secure SDLC, Dependency-Gate, CodeQL und RLS erneut bestätigen.
2. Nach grünen Pflichtchecks und Review den Pull Request nur mit gesonderter Merge-Freigabe mergen.
3. Danach SDK 54 zunächst weiter mit Legacy Architecture in einem neuen Branch migrieren; die New
   Architecture folgt als eigenes, klar getrenntes Arbeitspaket.

## Bewusste Grenzen

- Der lokale Android-Release-Compile konnte wegen wiederholter Timeouts zu
  `dl.google.com/android/repository` nicht abgeschlossen werden. Das ist kein beobachteter
  Compilefehler, aber auch kein bestandener Nachweis; GitHub-CI bleibt dafür fail-closed.
- Die physischen iOS-/Android-Geräte-Smokes sind nach Product-Owner-Entscheidung verschoben, nicht
  bestanden oder entfallen. Sie bleiben vor einer Produktionsfreigabe verpflichtend.
- `react-test-renderer` ist unter React 19 als veraltet markiert. Die vorhandenen Tests bleiben
  wirksam; ihre spätere Migration auf eine langfristig unterstützte Render-Teststrategie ist
  technischer Rückstand, kein SDK-53-Releaseblocker.
- Die parallele UI-Redesign-Arbeit bleibt getrennt und ist nicht Bestandteil dieses Commits.
