# ADR-001 Verifikations- und Freigabeplan

- **Ticket:** SP1-07
- **Stand:** 2026-08-10
- **Status:** Tests und Nachweise spezifiziert; noch nicht als Produktionsmigration umgesetzt
- **Geltungsbereich:** Inventar, bekannte Geräte, Access Points, Router-WLAN, Firewallregeln, Monitoringziele, WLAN-Scans, Schlüsselregistry, Worker-API, Mobile Offline-Repository

## 1. Zweck und harte Grenze

Dieser Plan macht ADR-001 vor M1 prüfbar. Er ist keine Migrationsfreigabe. Fixtures enthalten ausschließlich synthetische Daten, niemals Patienten-, Behandlungs- oder reale Praxisdaten. Testausgaben dürfen keine D2-Klarwerte oder D3-Testwerte protokollieren.

## 2. Verantwortungs- und Nachweismatrix

| Gate | Accountable Owner | Erforderlicher Nachweis | Status |
|---|---|---|---|
| Schema/API/Migration | zu benennender Technical Owner | ADR- und DDL-Sign-off, M0–M7-Runbook, Client-Kompatibilitätsmatrix | offen |
| Datenklassen/DSGVO | Datenschutz/Fachowner | Zweck, Rechtsgrundlage, Datenminimierung, Retention, Export/Löschung, AV-/Providerprüfung | offen |
| Schlüssel/Betrieb | Operations | KEK-Provider, Zugriff, Rotation, Backup, Restore, Monitoring, freigegebene RPO/RTO | offen |
| Kryptographie/Tenantgrenzen | Security Owner | Crypto-, D3-, Logging-, Worker-Auth-, RLS-/Cross-Tenant-Testlauf | offen |
| Mobile Offline | Android-/iOS-Owner | Keystore-, Logout-, Praxiswechsel-, Schlüsselverlust- und Device-Smoke-Nachweis | offen |
| Seed/Coverage/UX | Product Owner | freigegebene Screens/Fixtures für `synthetic`, `local_only`, fehlende Coverage und Datenverlust | offen |
| Go/No-Go je Migrationsphase | Technical Owner + Operations + Security | signiertes Protokoll mit Metriken, Artefaktversion, Entscheidung und Rollbackpunkt | offen |

Eine Person darf mehrere Rollen innehaben, die fachliche Entscheidung muss aber je Gate namentlich, datiert und nachvollziehbar dokumentiert werden. Ein automatisierter Testlauf ersetzt keine Datenschutz- oder Betriebsfreigabe.

## 3. Kanonische synthetische Fixture

### 3.1 Mandanten und Rollen

| Symbol | Fixture | Zweck |
|---|---|---|
| Praxis A | feste UUID `a…001` | Eigentümer aller A-Objekte |
| Praxis B | feste UUID `b…001` | Cross-Tenant-Gegenprobe |
| A-Manager | authentifizierter Manager von A | erlaubte Writes/Details/Export/Löschung |
| A-Viewer | authentifizierter Viewer von A | erlaubte D1-/Detailreads, verbotene Writes |
| B-Manager | authentifizierter Manager von B | darf keine A-Objekte erkennen |
| Outsider | authentifiziert ohne Mitgliedschaft | keinerlei Praxiszugriff |
| service_role | nur Worker-/RPC-Testharness | beweist serverseitige Praxisbindung trotz RLS-Bypass |

Die tatsächlichen UUIDs liegen später als Konstanten in einem dedizierten Testfixture, nicht in Produktivdaten oder Logs.

### 3.2 Daten je Praxis

Für A und B wird je ein eindeutig unterschiedliches Objekt erzeugt:

- Inventarobjekt mit Name, Detail, Owner, Standort und freien Metadaten;
- bekanntes Gerät mit MAC, Hostname, Raum, Modell und Notiz;
- Access Point mit SSID, BSSID, Standort und Kanal;
- Router-WLAN-Konfiguration mit WPS-/Gastnetz-/Verschlüsselungswerten;
- Firewallregel mit Regelname, Port, Quelle, Ziel, Zweck und Owner;
- Monitoringziel vom Typ Domain und E-Mail;
- WLAN-Scan mit IP, Gateway, DNS, Geräten, Findings, Methodik und D1-Aggregaten;
- Seedobjekt `source=practice_profile`, `synthetic=true`, `confidence=30`, `sync_policy=local_only`;
- beobachtetes Objekt `source=observed`, `synthetic=false`, `sync_policy=cloud_allowed`;
- DEK-Versionen `k1` (`decrypt_only`) und `k2` (`active`).

Zusätzlich existieren D3-Poison-Payloads mit verschachtelten und unterschiedlich geschriebenen Schlüsseln wie `password`, `passphrase`, `psk`, `apiToken`, `private_key`, `credentials` und überlangen/unerwarteten Feldern. Testwerte sind zufällige Fixturemarker, keine nutzbaren Geheimnisse.

## 4. Testkatalog

### 4.1 Kryptographie und Schlüssel

| ID | Prüfung | Erwartung |
|---|---|---|
| CR-01 | v2 Roundtrip je Entität mit k1/k2 | identischer kanonischer Inhalt; keine Klartextspalte |
| CR-02 | Ciphertext von A nach B oder auf andere Entity-ID kopieren | AES-GCM/AAD-Verifikation scheitert geschlossen |
| CR-03 | IV, Ciphertext, Tag, Payload-/AAD-/Keyversion manipulieren | Entschlüsselung scheitert; kein Fallback auf ungeprüften Klartext |
| CR-04 | 100.000 Encryptions mit gleicher Payload/DEK | keine IV-Wiederverwendung; statistisch/implementierungsseitig geprüft |
| CR-05 | gleiche MAC in A und B | unterschiedliche `identity_hmac`; Dedupe nur innerhalb einer Praxis |
| CR-06 | Kanonisierung von MAC/BSSID/Domain/E-Mail | definierte Äquivalente deduplizieren, unterschiedliche Werte kollidieren nicht |
| CR-07 | Keyrotation k1 → k2 → k1-Referenz | neue Writes k2; alte Reads k1; Retirement mit Referenz wird blockiert |
| CR-08 | unbekannte/fehlende Keyversion | harter Fehler, Alarm und automatischer Migrationsstopp |
| CR-09 | `payload_hmac` versus unkeyed Hash | Schema/API enthält keinen Klartext-SHA-256; HMAC ist domain-separiert |

### 4.2 API, Autorisierung und D3

| ID | Prüfung | Erwartung |
|---|---|---|
| API-01 | A-Manager erstellt/ändert/löscht A-Objekt mit Idempotency-Key | einmaliger Write, stabiles Resultat, Audit ohne D2 |
| API-02 | Replay desselben und Konflikt mit verändertem Body | gleiches Resultat beziehungsweise deterministischer 409-Konflikt |
| API-03 | Viewer schreibt; Outsider greift zu | 403/404 ohne Existenzleck |
| API-04 | A-/B-IDs in URL, Body und verschachtelten Referenzen vertauschen | kein Cross-Tenant-Read/-Write, auch über service_role-Pfad |
| API-05 | Listenendpunkt | ausschließlich klassifizierte D1-Felder |
| API-06 | Detail-/Exportendpunkt | nur autorisierte Entschlüsselung; Audit enthält IDs/Status, keinen Klartext |
| API-07 | D3-Poison top-level und rekursiv | vollständiger Request wird vor Persistenz abgelehnt |
| API-08 | unbekannte, zu große oder zu tiefe Payload | Schemafehler/413; keine Teilpersistenz |
| API-09 | `sync_policy=local_only` an Cloudwrite | serverseitig abgelehnt, auch bei manipuliertem Client |
| API-10 | Logs/Traces/Fehler/Analytics durchsuchen | kein Fixture-D2/D3, Ciphertext oder Schlüsselmaterial |

### 4.3 RLS und Grants

| ID | Prüfung | Erwartung |
|---|---|---|
| DB-01 | A-Viewer liest alle sieben A-Entitätsgruppen | nur A und nur erlaubte D1-Daten |
| DB-02 | A-Viewer/B-Manager/Outsider lesen oder ändern fremde Zeilen | null Zeilen/keine Änderung; keine Timing-/Fehlerdetails |
| DB-03 | direkte `authenticated` Inserts/Updates/Deletes nach M6 | für alle sensiblen Tabellen widerrufen |
| DB-04 | anon/authenticated gegen Schlüsselregistry | keinerlei Privilegien |
| DB-05 | Constraints/Unique-HMAC innerhalb/zwischen Praxen | Duplikat A blockiert; gleicher kanonischer Wert in B zulässig |
| DB-06 | ungültiges/leeres `{}`-Envelope als `verified` | Constraint beziehungsweise Zustandsübergang blockiert |
| DB-07 | service_role-Worker mit fremder Objekt-ID | Worker-Praxisprüfung blockiert trotz RLS-Bypass |

### 4.4 Backfill, Dual-Write/-Read und Rollback

| ID | Prüfung | Erwartung |
|---|---|---|
| MIG-01 | M0-Baseline | exakte Zeilenzahlen je Praxis/Tabelle, Grant-/Constraint-Snapshot, keine Rohwerte |
| MIG-02 | M1 zweimal ausführen | additive Änderung idempotent, Legacyclients unverändert |
| MIG-03 | M2 Dual-Write | Legacy und v2 sind über `payload_hmac` exakt äquivalent |
| MIG-04 | M3 Batch erneut/unterbrochen ausführen | keine Duplikate, Resume am letzten bestätigten Cursor |
| MIG-05 | ungültige fachliche Legacyzeile | Praxis pausiert/quarantänisiert ohne Klartextlog; kein Überspringen |
| MIG-06 | ein Crypto-/AAD-/HMAC-Fehler | globaler Stopp, keine nachfolgenden Batches |
| MIG-07 | M4 v2 vorhanden/legacy_pending/korrupt | v2 bevorzugt; Legacy nur bei `legacy_pending`; korrupt scheitert geschlossen |
| MIG-08 | Rollback vor M5 | Feature Flag auf Legacy; v2-Daten bleiben erhalten |
| MIG-09 | M5-Vorprüfung | 100 % Zeilen, null Divergenzen, Export/Löschung/Restore grün |
| MIG-10 | Rollback nach M5 | dual-read-fähige App liest v2; kein Klartext wird rehydriert |
| MIG-11 | M6 Grant-Cutover | API funktioniert; direkte Clientwrites scheitern |
| MIG-12 | M7 nach 30 Tagen/Restore | Legacyspalten erst nach separatem Go/No-Go entfernt |

### 4.5 Export, Löschung, Retention und Restore

| ID | Prüfung | Erwartung |
|---|---|---|
| PRV-01 | A-Export | alle A-Daten aus sieben Entitätsgruppen strukturiert; keine B- oder D3-Daten |
| PRV-02 | B/Outsider fordert A-Export | verweigert ohne Existenzleck |
| PRV-03 | vollständige Praxislöschung A | keine erreichbaren A-Payloads/HMACs/Keys/Targets/Scans; B unverändert |
| PRV-04 | Löschung bei Teilfehler | gesamte Transaktion rollt zurück oder erreicht definierten resumierbaren Zustand |
| PRV-05 | Retention 30/90/180 Tage und 12 Monate | nur fällige Rohscans/Aggregate entfernt, Zeitzonengrenzen getestet |
| PRV-06 | verschlüsseltes Backup wiederherstellen | alle Envelopes entschlüsselbar, Zeilenzahlen/HMACs exakt, RLS/Grants aktiv |
| PRV-07 | Backup nach Praxislöschung | laut Providerfrist gesperrt/auslaufend; keine Wiederaufnahme in Livebetrieb |

### 4.6 Mobile Offline und UX

| ID | Prüfung | Erwartung |
|---|---|---|
| MOB-01 | App-Neustart/OS-Neustart je unterstützter Plattform | lokales Repository entschlüsselt nur nach Gerätefreigabe |
| MOB-02 | Logout/Praxiswechsel | Speicher geleert; Praxis-A-Daten in B nicht verfügbar |
| MOB-03 | Keystore fehlt/ist gesperrt/Schlüssel verloren | flüchtiger beziehungsweise gesperrter Zustand und klare Recovery-UX, kein stiller Upload |
| MOB-04 | Seedobjekt | sichtbar als Vorschlag/abgeleitet; nicht als beobachtet, nicht in Score-Evidenz |
| MOB-05 | `local_only` Syncversuch | Client und Server blockieren Upload |
| MOB-06 | iOS-/Android-Gerätematrix | dokumentierte unterstützte und nicht unterstützte Funktionen ohne falsches Grün |

## 5. Abbruchautomatik

Der Orchestrator besitzt einen Kill Switch für Dual-Write und Backfill. Folgende Schwellen sind maschinenlesbar und erzeugen einen blockierenden Alarm:

| Signal | Schwelle | Aktion |
|---|---|---|
| Auth/RLS/Cross-Tenant/D3/AAD/Crypto/Key/Export/Delete/Restore | 1 Fehler | global stoppen, Incident eröffnen |
| Zeilen-/Identitäts-/HMAC-/Dual-Write-Abweichung | > 0 | global stoppen |
| fachlich nicht migrierbare Zeile | 1 | Praxis pausieren und quarantänisieren |
| quarantänisierte Zeilen global | > 10 oder > 0,1 %, zuerst erreicht | global stoppen |
| Detail-API 5xx-Delta | > 0,5 Prozentpunkte für 15 Minuten | Feature Flag zurück, Migration stoppen |
| Detail-API p95 | > 2 × freigegebene Baseline für 15 Minuten | Feature Flag zurück, Migration stoppen |
| D2/D3 in Logs oder unklassifiziertes Feld | 1 Fund | global stoppen, Logzugriff sperren/Incident |
| RPO/RTO/Retention | freigegebenes Ziel verfehlt | kein Go für nächste Phase |

Ein Stopp kann nur nach Root-Cause, Fix, neuem vollständigem Testlauf und signiertem Go/No-Go aufgehoben werden. Quarantäne speichert IDs, Fehlerklasse und Hash-/Versionsmetadata, niemals den Rohwert.

## 6. Phasen und Definition of Done

### Phase V0 – Review und Testgerüst, vor M1

- Owner benennen und alle offenen Entscheidungen dokumentieren.
- Fixtures, Crypto-/API-/SQL-/Migrationstests ausführbar implementieren.
- Privacy-Export und Lösch-RPC um alle Entitäten erweitern.
- KEK-Provider, Wrap-Algorithmus, RPO/RTO und mobile Gerätematrix freigeben.

**Done:** alle automatisierbaren Tests laufen in CI grün; alle ADR-Gates signiert. Erst dann darf M1 entwickelt/ausgerollt werden.

### Phase V1 – Additiv und Dual-Write, M1–M2

- additive Migration und versionierte Worker-API hinter Feature Flags;
- M0-Baseline und vollständiger Testlauf in lokaler/Staging-Umgebung;
- Dual-Write-Metriken und Kill Switch aktiv.

**Done:** mindestens der freigegebene Beobachtungszeitraum ohne Divergenz; Legacyclients funktionieren; keine D2/D3-Leckage.

### Phase V2 – Backfill und Dual-Read, M3–M4

- zuerst synthetische Stagingdaten, danach freigegebene produktive Batches;
- praxisweise Cursor, Resume, Quarantäne und exakte Reconciliation;
- Export, Löschung, Restore und Rollenmatrix erneut prüfen.

**Done:** 100 % der in Scope befindlichen Zeilen `verified`, null Abweichungen, alle Blocker grün.

### Phase V3 – Scrub und Zugriffshärtung, M5–M6

- separater Go/No-Go für Klartext-Scrub;
- nur dual-read-fähige Clientversionen zulassen;
- direkte Clientwrites widerrufen und Grant-Snapshot prüfen.

**Done:** kein D2-Klartext in Live-Schema/Logs/Exportzwischenablagen; API, Export, Löschung, Restore und Rollbackfixture grün.

### Phase V4 – Legacybereinigung, M7

- frühestens nach 30 stabilen Produktionstagen;
- Restore aus verschlüsseltem Backup und finaler Privacy-Test;
- separates signiertes Go/No-Go.

**Done:** Legacyspalten und zeitlich begrenzter Legacy-Key entfernt; Nachweise archiviert; Betriebs- und Incident-Runbooks aktuell.

## 7. Erforderliche CI-/Release-Artefakte

- Unit-Testreport für Canonicalization, HMAC, AAD, Envelope und Rotation;
- Worker-Contract- und Cross-Tenant-Testreport;
- SQL/RLS-/Grant-Testreport;
- Migration-/Rollback-/Reconciliationreport;
- D3-/Log-Leak-Scan;
- Export-/Lösch-/Retention-/Restoreprotokoll;
- Android-/iOS-Gerätematrix;
- Performancebaseline und 15-Minuten-Metrikvergleich;
- signierte Owner-Matrix und Go/No-Go-Protokoll.

Artefakte referenzieren Commit, Migrationsversion, App-/Worker-Version, Umgebung und Testzeitpunkt. Secrets und D2-Rohwerte werden nie als CI-Artefakt gespeichert.
