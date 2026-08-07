# ADR-001: Datenschutz- und Migrationsvertrag für Inventar und WLAN

- **Status:** vorgeschlagen – Fach-, Datenschutz- und Betriebsreview ausstehend
- **Ticket:** SP1-07
- **Datum:** 2026-08-07
- **Entscheider:** Technical Owner, Datenschutz, Operations
- **Betroffene Plattformen:** Android, iOS, Cloud, Web/API, Supabase
- **Schemaentwurf:** `docs/schema/SP1_07_inventory_wlan_schema_draft.sql`

## 1. Entscheidung

PraxisShield speichert detaillierte Inventar-, Router-, Firewall- und WLAN-Daten künftig nach dem Prinzip **verschlüsselter Inhalt plus minimales, nicht identifizierendes Betriebsmetadata**. Mobile Offline-Daten und Cloud-Daten erhalten getrennte Schlüssel. Router-, WLAN- oder Provider-Zugangsdaten verlassen das Endgerät nie.

Direkte Client-Schreibzugriffe auf sensible Cloudtabellen werden nach der Übergangsphase durch versionierte Worker-Endpunkte ersetzt. Der Worker validiert Mandant, Rolle, Herkunft, Schema und Idempotenz, verschlüsselt sensible Felder und schreibt nur freigegebene Metadaten im Klartext.

Diese ADR autorisiert noch keine Produktionsmigration. Die Migration beginnt erst nach den Reviews und den in Abschnitt 11 definierten Freigabegates.

## 2. Anlass und bestätigter Iststand

Der aktuelle Zustand erfüllt den Zielvertrag nicht:

- `wlan_scans.network_info` enthält unter anderem SSID, private IP, Gateway, DNS, Findings und Methodik als Klartext-JSON. `vulnerabilities` ist ebenfalls offen. `encrypted_payload` existiert, wird vom mobilen Syncpfad aber nicht befüllt.
- `inventory_known_devices` speichert MAC-Adresse, Hostname, Raum und Verantwortliche offen; `inventory_access_points` speichert SSID und BSSID offen.
- Allgemeine Inventarobjekte können Domains, E-Mail-Adressen, Systemnamen, Details und verantwortliche Personen offen enthalten.
- Firewallregeln können interne Netze, Ziele, Zwecke und Verantwortliche offenlegen.
- Der Zustand-Store ist nur flüchtig. Seed-Objekte sind lediglich am ID-Präfix erkennbar und besitzen keinen belastbaren Herkunfts- oder Syncvertrag.
- Die bestehende Worker-Verschlüsselung verwendet zwar AES-256-GCM, aber einen globalen Schlüssel ohne Mandantenschlüssel, Key-Version oder Associated Data.

Diese Daten sind keine Behandlungsdaten, bilden aber die Angriffsfläche einer Praxis sehr genau ab und können personenbezogene Angaben enthalten. Ein Datenbankexport oder falsch berechtigter Supportzugriff darf deshalb keine interne Topologie offenlegen.

## 3. Datenklassen

| Klasse | Bedeutung | Beispiele | Klartext Cloud | Export | Standardaufbewahrung |
|---|---|---|---|---|---|
| D0 | öffentlich | Produktversion, öffentliche Normquelle | ja | ja | fachlich bestimmt |
| D1 | internes Betriebsmetadata ohne direkten Identifikator | Objekttyp, Kritikalität, Finding-Anzahl, Risiko-/Coverage-Wert, Zeitstempel, Status | ja, minimiert | ja | nach Entität |
| D2 | vertrauliche Praxis-/Netz- oder Personendaten | SSID, BSSID/MAC, Hostname, private IP, DNS/Gateway, Raum, Owner, Domain/E-Mail, interne Firewallquelle/-ziele | nur verschlüsselt | nach Autorisierung entschlüsselt | kurzestmöglich |
| D3 | Geheimnis/Zugangsdaten | Routerpasswort, TR-064-Token, API-Token, PSK, private Schlüssel | **nie** | **nie** | lokal bis Widerruf/Rotation |

Freitext und unbekannte `metadata`-Felder werden standardmäßig D2 behandelt. Ein neues Klartextfeld benötigt eine explizite Klassifikation und Review.

## 4. Feldvertrag je Entität

### 4.1 Inventarobjekte

Klartext D1: `id`, `practice_id`, `type`, `criticality`, `source`, `synthetic`, `confidence`, Versions-, Revisions- und Zeitfelder.

Verschlüsselt D2: `name`, `detail`, `owner`, Aliase, Standort, technische Details und freie Metadaten. Domains und E-Mail-Adressen sind auch dann D2, wenn sie öffentlich auffindbar sind, weil ihre Zuordnung zum Praxisinventar vertraulich ist.

### 4.2 Bekannte Geräte

Klartext D1: Gerätetyp, Kritikalität, Herkunft, Confidence, letzter Bestätigungszeitpunkt und Syncmetadata.

Verschlüsselt D2: MAC, Hostname, Raum, Owner, Modell, Version und Notizen. Für Deduplizierung wird `identity_hmac` verwendet: HMAC über kanonische Identität und Praxisbindung. Ein einfacher Hash ist wegen des kleinen MAC-Adressraums unzulässig.

### 4.3 Access Points

Klartext D1: erwartete Verschlüsselung, Kanal nur wenn für Auswertung erforderlich, Herkunft, Confidence und Zeitfelder.

Verschlüsselt D2: SSID, BSSID, Standort, Anzeigename und Notizen. BSSID-Deduplizierung erfolgt über `identity_hmac`.

### 4.4 Router-/Firewallkonfiguration

Klartext D1: Richtung, Protokoll, Aktion, Aktivstatus, abstrakte Portklasse und Reviewdatum. Konkrete Quell-/Zielnetze, Portlisten, Regelname, Zweck, Owner und Freitext sind D2.

Routercredentials, WLAN-Schlüssel und Connector-Tokens sind D3 und werden ausschließlich im mobilen Secure Store bzw. im Agent-Keystore gespeichert.

### 4.5 WLAN-Scans

Klartext D1: Scan-ID, Praxis, Zeitpunkt, Modus, `risk_score`, `risk_level`, `coverage_score`, Zahl gefundener Geräte sowie aggregierte Finding-Zahlen. Weder ein grüner Wert noch ein niedriger Risikowert ist ohne ausreichende Coverage zulässig.

Verschlüsselt D2: SSID, BSSID, IP/Subnetz, Gateway, DNS, Geräte, MACs, Hostnamen, vollständige Findings/Evidenz, Segmentbeobachtungen und Methodikdetails mit Identifikatoren.

Die bisherigen Felder `network_info` und `vulnerabilities` werden nach erfolgreichem Backfill geleert und später entfernt. Das Dashboard liest dann nur D1-Aggregate; Detailansichten laden autorisiert den verschlüsselten Inhalt über den Worker.

## 5. Herkunfts- und Seed-Vertrag

Jedes Inventarobjekt erhält:

- `source`: `manual`, `observed`, `imported`, `practice_profile`, `connector` oder `agent`;
- `synthetic`: kennzeichnet nicht beobachtete Beispiel-/abgeleitete Objekte;
- `confidence`: 0–100;
- `sync_policy`: `local_only` oder `cloud_allowed`;
- `observed_at`, `confirmed_at`, optional `expires_at`;
- `created_by_actor` und `source_ref`, soweit ohne zusätzliche D2-Leckage möglich.

Aus Praxisprofilen abgeleitete Seed-Objekte sind `source=practice_profile`, `synthetic=true`, `confidence=30`, `sync_policy=local_only`. Sie dürfen nicht automatisch als beobachtete Assets hochgeladen oder als technische Evidenz bewertet werden. Erst eine bewusste Bestätigung erzeugt ein reguläres Objekt oder ändert die Herkunft nachvollziehbar.

## 6. Schlüssel- und Kryptovertrag

### 6.1 Cloud

- Pro Praxis wird ein zufälliger 256-Bit Data Encryption Key (DEK) geführt.
- Der DEK wird mit einem versionierten Key Encryption Key (KEK) gewrappt. Der KEK liegt als Cloudflare Secret; mittelfristig wird ein KMS/HSM-gestützter KEK verwendet.
- Nutzdaten werden mit AES-256-GCM und zufälliger 96-Bit-IV verschlüsselt.
- Associated Data bindet mindestens `practice_id`, `entity_type`, `entity_id`, `payload_version` und `key_version`. Ein Ciphertext kann damit nicht unbemerkt zwischen Mandanten oder Entitäten verschoben werden.
- Das Envelope enthält `alg`, `iv`, `ciphertext`, `key_version`, `payload_version` und `created_at`; `payload_sha256` dient nur Integritäts-/Migrationskontrollen und enthält keine Rohdaten.
- Entschlüsselung ist ausschließlich im Worker für autorisierte Detail-, Export-, Migrations- und Löschpfade erlaubt. Klartext darf nicht geloggt werden.

Die bestehende globale `DATA_ENCRYPTION_KEY` bleibt nur als zeitlich begrenzter Legacy-Key lesbar. Neue Payloads verwenden nach Cutover den Mandantenschlüssel.

### 6.2 Mobile Offline-Persistenz

- Pro Installation/Praxis wird ein separater lokaler DEK erzeugt und mit `WHEN_UNLOCKED_THIS_DEVICE_ONLY` im iOS-Keychain/Android-Keystore abgelegt.
- Größere Datensätze liegen als AES-GCM-verschlüsselte Datensätze in einer lokalen SQLite-Repositoryschicht; SecureStore ist nur Schlüsselspeicher, nicht Massendatenspeicher.
- Der lokale DEK wird nie in die Cloud synchronisiert. Bei fehlendem sicheren Keystore bleibt der Zustand flüchtig und die UI weist auf fehlende Offline-Persistenz hin.
- Logout/Praxiswechsel leert Arbeitsspeicher. Praxislöschung entfernt Ciphertexte und Schlüssel; ein Schlüsselverlust ist ein nicht wiederherstellbarer lokaler Datenverlust und wird entsprechend behandelt.

## 7. API- und Berechtigungsvertrag

- Sensible Writes laufen nach Cutover über `/api/v1/inventory/*` und `/api/v1/wlan-scans`; Managerrolle ist erforderlich.
- Detail-Reads und Exporte benötigen mindestens Viewerrolle, werden auditiert und entschlüsseln nur den angeforderten Mandantenkontext.
- Direkte `authenticated`-Writes auf Inventar- und WLAN-Tabellen werden nach Clientmigration widerrufen. `service_role` bleibt auf die Worker-Funktionen begrenzt.
- Listenendpunkte liefern standardmäßig D1-Metadaten; D2-Payloads nur über explizite Detailendpunkte. Pagination, Maximalgrößen, Idempotenz und Schema-Version sind verpflichtend.
- D3-Felder sind in Requestschemas verboten. Logger und Fehlerobjekte verwenden Allowlists.
- RLS bleibt Defense in Depth; zusätzlich prüft jeder Workerpfad Praxis, Rolle und Objektzuordnung.

## 8. Aufbewahrung, Export und Löschung

| Entität | Standard | Löschung | Export |
|---|---|---|---|
| aktives Inventar | bis Entfernung durch Praxis bzw. Praxislöschung | Payload sofort entfernen; D1-Tombstone maximal 30 Tage für Sync | entschlüsselte, strukturierte Nutzdaten plus Herkunft |
| rohe WLAN-Scans | 90 Tage, konfigurierbar 30/90/180 | Hard Delete; keine anonymisierte Topologie behalten | autorisiert entschlüsselt, solange vorhanden |
| WLAN-Aggregate | 12 Monate | mit Praxislöschung entfernen oder vollständig entkoppeln | D1-Zeitreihe |
| D3-Credentials | bis Widerruf/Rotation | sofort lokal löschen | ausgeschlossen |

Patienten- oder Behandlungsdaten sind in Inventar, Router- und WLAN-Freitext ausdrücklich verboten. Export- und Löschtests müssen alle neuen Tabellen, Ciphertexte, Tombstones und Schlüsselobjekte abdecken. Backups folgen der dokumentierten Providerlöschfrist; Applikationszugriff nach Löschung ist sofort ausgeschlossen.

## 9. Migrationsablauf

1. **M0 – Baseline:** Zeilenzahlen, Nullquoten, Payloadgrößen, RLS-/Export-/Löschtests und verschlüsseltes Restorefixture erfassen. Keine Rohwerte in Migrationslogs.
2. **M1 – additive Spalten:** Envelope-, Hash-, Key-, Herkunfts-, Revisions- und D1-Aggregatfelder ergänzen; bestehende Leser unverändert lassen.
3. **M2 – API und Dual Write:** Worker-Endpunkte ausrollen. Neue Writes erzeugen verschlüsselten Payload und vorübergehend Legacyfelder. D3 wird abgewiesen.
4. **M3 – Backfill:** Praxisweise in kleinen, idempotenten Batches verschlüsseln. Jeder Datensatz erhält Status, Hash und Keyversion. Fehler werden quarantänisiert, nicht übersprungen.
5. **M4 – Dual Read:** Neue Clients lesen verschlüsselt bevorzugt und fallen nur für noch nicht migrierte Datensätze auf Legacy zurück. Dashboard/Export/Löschung werden umgestellt.
6. **M5 – Klartext-Scrub:** Nach 100-%-Verifikation Legacy-D2-Felder leeren. Not-null-/Unique-Verträge auf HMAC/Envelope umstellen. Ab diesem Schritt ist ein App-Rollback nur auf dual-read-fähige Versionen erlaubt.
7. **M6 – Zugriffshärtung:** Direkte Clientwrites widerrufen, API v1 erzwingen, alte Appversionen kontrolliert ablehnen/aktualisieren.
8. **M7 – Bereinigung:** Legacyspalten frühestens nach 30 Tagen stabiler Produktion und erfolgreichem Restore-/Export-/Löschtest entfernen.

## 10. Rollback und Abbruchkriterien

Vor M5 kann auf Legacy Read/Write zurückgeschaltet werden. Nach M5 wird Klartext **nicht** erneut in die Datenbank geschrieben; Rollback bedeutet verschlüsseltes Lesen mit der vorherigen dual-read-fähigen Anwendungsversion.

Die Migration stoppt automatisch bei:

- einem Entschlüsselungs-, AAD- oder Hashfehler;
- Abweichung von Quell-/Zielzeilenzahl oder Objektidentität;
- RLS-/Cross-Tenant-, Export-, Lösch- oder Restoretestfehlern;
- unbekannter Keyversion oder fehlendem Praxis-DEK;
- erhöhter Fehlerquote des produktiven Detailpfads;
- unklassifiziertem neuen Feld oder D3-Fund in einer Cloudpayload.

Vor jedem irreversiblen Schritt existieren ein verschlüsseltes Backup, getestete Wiederherstellung, ein Dry Run mit Produktionsstatistik ohne Rohdaten und ein protokollierter Go/No-Go-Entscheid.

## 11. Freigabegates

SP1-07 gilt erst als `reviewed`, wenn alle Punkte bestätigt sind:

- [ ] Technical Owner bestätigt Schema, API und Dual-Read-Strategie.
- [ ] Datenschutz bestätigt Datenklassen, Zweck, Aufbewahrung, Export und Löschung.
- [ ] Operations bestätigt KEK/DEK-Verwaltung, Rotation, Backup und Restore.
- [ ] Mobile Owner bestätigt sicheren Keystore und Offlineverlust-Verhalten.
- [ ] Security Review bestätigt AAD, HMAC, Logging-Allowlist, RLS und Cross-Tenant-Tests.
- [ ] Product Owner bestätigt, dass Seedobjekte und Coverage in der UI nicht als Messung erscheinen.
- [ ] Rollbackfixture, Backfillfixture und Abbruchmetriken sind vor M1 als Tests spezifiziert.

## 12. Konsequenzen

Positiv: Ein Datenbank- oder Supportzugriff legt keine detaillierte Praxistopologie offen; Seed- und Messdaten sind unterscheidbar; Offlinefähigkeit und Cloudsync erhalten einen belastbaren Vertrag; Export/Löschung und Schlüsselrotation werden testbar.

Kosten: Worker-API, Repository, Key-Lifecycle, Dual-Read und Backfill erhöhen den Umsetzungsaufwand. D2-Felder sind nicht mehr direkt per SQL suchbar. Wo Deduplizierung erforderlich ist, wird ein eng begrenzter HMAC-Index verwendet; fachliche Suche erfolgt nach autorisierter Entschlüsselung oder lokal.

Nicht gewählt wurden Klartext mit ausschließlich RLS, ein globaler Dauerschlüssel, ein einfacher MAC-Hash, Speicherung großer JSON-Daten im SecureStore und eine Big-Bang-Migration. Diese Varianten erfüllen Mandantentrennung, Rotierbarkeit, Offlinegröße oder Rollbackanforderungen nicht ausreichend.
