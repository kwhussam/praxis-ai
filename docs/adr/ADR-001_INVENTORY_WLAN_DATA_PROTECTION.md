# ADR-001: Datenschutz- und Migrationsvertrag für Inventar und WLAN

- **Status:** technisch geprüft und reviewbereit – externe Freigaben ausstehend; keine Migration autorisiert
- **Ticket:** SP1-07
- **Datum:** 2026-08-10
- **Entscheider:** benannter Technical Owner, Datenschutz, Operations, Mobile Owner, Security und Product
- **Betroffene Plattformen:** Android, iOS, Cloud, Web/API, Supabase
- **Schemaentwurf:** `docs/schema/SP1_07_inventory_wlan_schema_draft.sql`
- **Verifikation:** `docs/adr/ADR-001_VERIFICATION_PLAN.md`

## 1. Entscheidung

PraxisShield speichert detaillierte Inventar-, Router-, Firewall-, Monitoringziel- und WLAN-Daten künftig nach dem Prinzip **verschlüsselter Inhalt plus minimales, nicht identifizierendes Betriebsmetadata**. Mobile Offline-Daten und Cloud-Daten erhalten getrennte Schlüssel. Router-, WLAN- oder Provider-Zugangsdaten verlassen das Endgerät nie.

Direkte Client-Schreibzugriffe auf sensible Cloudtabellen werden nach der Übergangsphase durch versionierte Worker-Endpunkte ersetzt. Der Worker validiert Mandant, Rolle, Herkunft, Schema und Idempotenz, verwirft D3-Felder rekursiv, verschlüsselt sensible Felder und schreibt nur freigegebene Metadaten im Klartext.

Diese ADR autorisiert weder eine Produktionsmigration noch produktive Schlüssel. M1 beginnt erst, wenn alle menschlichen Freigaben in Abschnitt 13 dokumentiert sind und der Verifikationsplan als ausführbare Tests umgesetzt wurde.

## 2. Anlass und belegter Iststand

Der technische Review hat den aktuellen Code und die Migrationen geprüft. Der Iststand erfüllt den Zielvertrag noch nicht:

| Befund | Beleg im Repository | Konsequenz |
|---|---|---|
| WLAN-Topologie und Findings liegen in Klartext-JSON; das bestehende `encrypted_payload` hat den Default `{}` | `supabase/migrations/20260624150000_initial_schema.sql` | `{}` darf nicht als gültiges v2-Envelope gelten; Backfill benötigt eine neue nullable v2-Spalte und expliziten Status |
| Inventar, bekannte Geräte, Access Points, Router-WLAN, Firewallregeln und Monitoringziele enthalten D2-Klartext | `supabase/migrations/20260715120000_inventory_monitoring_targets.sql` | alle sechs Entitätsgruppen müssen in Scope und Backfill enthalten sein |
| Authentifizierte Clients besitzen direkte Schreibrechte | `20260714170000_authenticated_table_grants.sql`, `20260715120000_inventory_monitoring_targets.sql` | Rechte bleiben nur für die kompatible Übergangsphase und werden in M6 nach Client-Cutover widerrufen |
| Der Worker verwendet einen globalen AES-GCM-Schlüssel ohne AAD, Mandantenschlüssel oder Keyversion | `workers/hono/src/index.ts`, `encryptJson`/`decryptJson` | Legacy ausschließlich lesbar; v2 verwendet pro Praxis versionierte DEKs und gebundene AAD |
| Privacy-Export enthält WLAN, aber nicht das vollständige Inventar-/Router-/Monitoringziel-Schema | `workers/hono/src/index.ts`, `handlePrivacyExport` | Exporttest über alle D2-Entitäten ist ein blockierendes Gate |
| Die transaktionale Praxislöschung erfasst WLAN, aber nicht diese Inventar-/Router-/Monitoringziel-Tabellen | `supabase/migrations/20260721121000_privacy_deletion_transaction_rpc.sql` | Löschtest und RPC-Erweiterung sind vor Cutover zwingend |
| Der Inventarstore ist flüchtig; Seed-Herkunft ist nur indirekt am ID-Präfix erkennbar | `lib/store/inventory.ts`, `lib/inventory/inventory.ts` | SP2-01 muss Herkunft, lokale Verschlüsselung und Syncblock technisch erzwingen |

Ein Datenbankexport oder falsch berechtigter Supportzugriff darf keine interne Topologie offenlegen. Die Daten sind keine Behandlungsdaten, können aber personenbezogene Angaben enthalten und bilden die Angriffsfläche einer Praxis präzise ab.

## 3. Datenklassen

| Klasse | Bedeutung | Beispiele | Klartext Cloud | Export | Standardaufbewahrung |
|---|---|---|---|---|---|
| D0 | öffentlich | Produktversion, öffentliche Normquelle | ja | ja | fachlich bestimmt |
| D1 | minimiertes Betriebsmetadata ohne direkten Identifikator | Objekttyp, Kritikalität, Finding-Anzahl, Risiko-/Coverage-Wert, Zeitstempel, Status | ja | ja | nach Entität |
| D2 | vertrauliche Praxis-/Netz- oder Personendaten | SSID, BSSID/MAC, Hostname, private IP, DNS/Gateway, Raum, Owner, Domain/E-Mail, interne Firewallquelle/-ziele | nur verschlüsselt | autorisiert entschlüsselt | kürzestmöglich |
| D3 | Geheimnis/Zugangsdaten | Routerpasswort, TR-064-Token, API-Token, PSK, private Schlüssel | **nie** | **nie** | lokal bis Widerruf/Rotation |

Freitext und unbekannte `metadata`-Felder sind standardmäßig D2. Ein neues Klartextfeld benötigt Datenklasse, Zweck, Aufbewahrung und Review. Patientendaten und Behandlungsdaten sind in diesen Payloads verboten.

## 4. Feldvertrag je Entität

### 4.1 Inventarobjekte

Klartext D1: `id`, `practice_id`, `type`, `criticality`, Herkunft, Confidence, Synchronisations-, Versions- und Zeitfelder.

Verschlüsselt D2: Name, Detail, Owner, Aliase, Standort, technische Details und freie Metadaten. Domains und E-Mail-Adressen bleiben D2, weil ihre Zuordnung zum Praxisinventar vertraulich ist.

### 4.2 Bekannte Geräte und Access Points

Klartext D1: Gerätetyp beziehungsweise erwartete Verschlüsselung, Kritikalität, Herkunft, Confidence, bestätigte Zeitpunkte und Syncmetadata. Ein Kanal darf nur dann D1 bleiben, wenn die Auswertungslogik ihn ohne Gerätebezug benötigt.

Verschlüsselt D2: MAC/BSSID, Hostname/SSID, Raum/Standort, Owner, Modell, Version und Notizen. Deduplizierung erfolgt ausschließlich über eine praxisgebundene, domain-separierte `identity_hmac`.

### 4.3 Router-WLAN- und Firewallkonfiguration

Klartext D1 sind ausschließlich abgeleitete Ergebnisse: Risiko-/Coverage-Werte, Finding-Zahlen, Reviewstatus, Zeitpunkte und nicht identifizierende Kategorien. Auch Rohwerte wie WPS aktiv, offenes Netz, TKIP, versteckte SSID, Gastisolierung, konkrete Ports, Richtung oder Protokoll können die Schutzkonfiguration offenlegen und werden als D2 verschlüsselt.

Verschlüsselt D2: sämtliche Rohkonfiguration, Quell-/Zielnetze, Portlisten, Regelname, Zweck, Owner und Freitext. D3-Credentials, WLAN-Schlüssel und Connector-Tokens bleiben ausschließlich im mobilen Secure Store oder Agent-Keystore.

### 4.4 Monitoringziele

Klartext D1: Zieltyp, Aktivstatus, Einwilligungsstatus, minimale Provider-/Statusfelder und Zeitpunkte.

Verschlüsselt D2: Domain oder E-Mail-Adresse, Anzeigename und Metadaten. Für Gleichheit und Deduplizierung wird eine `identity_hmac` verwendet. Das heute erzeugte Klartextfeld `normalized_value` wird nach dem Backfill entfernt.

### 4.5 WLAN-Scans

Klartext D1: Scan-ID, Praxis, Zeitpunkt, Modus, `risk_score`, `risk_level`, `coverage_score`, Geräteanzahl und aggregierte Finding-Zahlen. Ein grüner Wert oder niedriger Risikowert ist ohne ausreichende Coverage verboten.

Verschlüsselt D2: SSID, BSSID, IP/Subnetz, Gateway, DNS, Geräte, MACs, Hostnamen, vollständige Findings/Evidenz, Segmentbeobachtungen und Methodikdetails mit Identifikatoren.

Die bestehenden D2-Felder `network_info` und `vulnerabilities` werden erst nach vollständiger Backfill- und Restore-Verifikation geleert. Das bestehende `encrypted_payload = {}` ist kein v2-Envelope. M1 ergänzt deshalb `encrypted_payload_v2` nullable; erst M5 erzwingt Envelope-Constraints.

## 5. Herkunfts- und Seed-Vertrag

Jedes Inventarobjekt erhält:

- `source`: `manual`, `observed`, `imported`, `practice_profile`, `connector` oder `agent`;
- `synthetic`: nicht beobachtetes Beispiel oder abgeleitetes Objekt;
- `confidence`: 0–100;
- `sync_policy`: `local_only` oder `cloud_allowed`;
- `observed_at`, `confirmed_at`, optional `expires_at`;
- `created_by_actor` und `source_ref`, sofern dadurch keine weitere D2-Leckage entsteht.

Aus Praxisprofilen abgeleitete Seeds sind `source=practice_profile`, `synthetic=true`, `confidence=30`, `sync_policy=local_only`. Sie werden weder automatisch hochgeladen noch als technische Evidenz bewertet. Bewusste Bestätigung erzeugt ein reguläres Objekt oder eine revisionssichere Herkunftsänderung.

## 6. Schlüssel- und Kryptovertrag

### 6.1 Cloud-Schlüssel

- Jede Praxis erhält einen zufälligen 256-Bit-DEK. Jede Version ist ein eigener Registry-Datensatz mit Primärschlüssel `(practice_id, key_version)`; pro Praxis darf nur eine Version `active` sein.
- Der DEK wird mit einem versionierten KEK gewrappt. Der produktive Wrap-Algorithmus, Cloudflare-/KMS-Betrieb und Rotation werden von Security und Operations freigegeben. `wrapped_dek` ist ein eigenes versioniertes Envelope; Nutzdaten- und Wrap-Algorithmus werden nicht vermischt.
- Rotation erstellt zuerst eine neue aktive Version. Alte DEKs bleiben `decrypt_only`, bis alle referenzierenden Payloads erfolgreich re-encrypted, Restore getestet und die definierte Sicherheitsfrist abgelaufen sind. Erst dann werden sie `retired`.
- Die bestehende globale `DATA_ENCRYPTION_KEY` bleibt zeitlich begrenzt nur für Legacy-Reads verfügbar. Neue v2-Payloads dürfen ihn nicht verwenden.

### 6.2 Rotationsstabiler Identity-HMAC-Schlüssel

`identity_hmac` verwendet **keinen aus dem DEK abgeleiteten Schlüssel**. Jede Praxis erhält einen separaten zufälligen 256-Bit Identity Index Key (IIK), der wie ein DEK unter dem versionierten KEK gewrappt, aber in einer eigenen Registry verwaltet wird. Eine normale DEK-Rotation verändert deshalb weder bestehende Identity-HMACs noch Unique-Indizes oder Deduplizierung.

Die IIK-Version ist Bestandteil der domain-separierten HMAC-Eingabe und wird als `identity_key_version` am Datensatz geführt. Eine IIK-Rotation ist ein eigenes, seltenes Reindex-Ereignis:

1. neue IIK-Version als `reindexing` erzeugen; alte Version bleibt `active`;
2. neue Writes atomar mit bisheriger und neuer `identity_hmac` schreiben;
3. `identity_hmac_next` praxisweise backfillen und auf Zeilenzahl, kanonische Identität, Kollision und Dedupe prüfen;
4. neuen partiellen Unique-Index aufbauen und validieren;
5. in einer kurzen Worker-Write-Pause Index und Primär-/Next-Spalten transaktional umschalten;
6. alte Version für das Rollbackfenster `verify_only` halten und erst danach samt alten HMACs entfernen/retiren.

Jede Abweichung stoppt den Reindex global; es gibt niemals ein Mischschema, in dem Identitäten verschiedener IIK-Versionen über denselben Unique-Index verglichen werden. Praxislöschung entfernt DEKs und IIKs. Zugriff, Backup und Restore beider Registries unterliegen denselben strengen Gates.

### 6.3 Nutzdaten-Envelope und AAD

Nutzdaten werden mit AES-256-GCM und zufälliger 96-Bit-IV verschlüsselt. Das kanonische v2-Envelope ist:

```json
{
  "alg": "A256GCM",
  "iv_b64u": "…",
  "ciphertext_b64u": "…",
  "key_version": "…",
  "payload_version": 2,
  "aad_version": 1,
  "created_at": "…"
}
```

`ciphertext_b64u` enthält Ciphertext und Authentifizierungstag gemäß der eingesetzten Web-Crypto-Repräsentation. `alg` ist serverseitig fest auf `A256GCM` gesetzt. `created_at` wird serverseitig als kanonischer RFC-3339-UTC-Zeitpunkt mit Millisekunden erzeugt. AAD wird über eine längenpräfixierte kanonische Serialisierung von `practice_id`, `entity_type`, `entity_id`, `alg`, `payload_version`, `key_version`, `aad_version` und `created_at` gebildet. Kein AAD-Feld wird als vertrauenswürdiger Klartext aus dem Request übernommen. Damit scheitert sowohl das Verschieben des Ciphertexts als auch die Manipulation seiner sicherheits- oder auditrelevanten Envelope-Metadaten.

Ein unkeyed SHA-256 des Klartexts ist verboten: kleine Wertebereiche wie MAC, BSSID oder SSID wären offline korrelierbar. Die beiden HMAC-Zwecke besitzen getrennte Schlüssel und Eingaben:

- `identity_hmac = HMAC(IIK, practice_id || entity_type || identity-purpose || identity_key_version || canonicalization_version || canonical_identity)`
- `payload_hmac = HMAC(HKDF(DEK, payload-hmac-purpose), practice_id || entity_type || payload-purpose || key_version || payload_version || canonical_payload)`

`identity_hmac` nutzt ausschließlich den rotationsstabilen IIK und ist nur für eng definierte Identitätsfelder zulässig. `payload_hmac` nutzt einen getrennten, domain-separiert aus der jeweiligen DEK-Version abgeleiteten Subkey und vergleicht kanonische Payloads während Migration, Dual-Write oder Re-encryption; er ist kein stabiler Dedupe-Index. Ein optionaler `ciphertext_sha256` darf ausschließlich Transportkorruption erkennen und hat keine fachliche Identitätsfunktion.

### 6.4 Mobile Offline-Persistenz

- Pro Installation/Praxis wird ein separater lokaler DEK erzeugt und mit `WHEN_UNLOCKED_THIS_DEVICE_ONLY` im iOS-Keychain beziehungsweise hardwaregestützten Android-Keystore abgelegt, soweit verfügbar.
- Größere Datensätze liegen als AES-GCM-verschlüsselte Datensätze in SQLite; SecureStore ist nur Schlüsselspeicher.
- Der lokale DEK wird nie synchronisiert. Fehlt ein sicherer Keystore, bleibt der Zustand flüchtig und die UI weist auf fehlende Offline-Persistenz hin.
- Logout und Praxiswechsel leeren Arbeitsspeicher. Praxislöschung entfernt Ciphertexte und Schlüssel. Schlüsselverlust bedeutet nicht wiederherstellbaren lokalen Datenverlust und wird als solcher angezeigt.

## 7. Payload-, API- und Logging-Vertrag

- Sensible Writes laufen nach Cutover über `/api/v1/inventory/*` und `/api/v1/wlan-scans`; Managerrolle und `Idempotency-Key` sind erforderlich.
- Detail-Reads und Exporte benötigen mindestens Viewerrolle, werden auditiert und entschlüsseln nur den angeforderten Mandantenkontext. Listen liefern standardmäßig nur D1.
- Requestschemas verwenden Allowlists, rekursive D3-Denylisten, maximale Objekt-/String-/Arraygrößen und `additionalProperties: false` an allen sicherheitsrelevanten Knoten. Verboten sind unter anderem `password`, `passphrase`, `psk`, `secret`, `token`, `credential`, `private_key` und semantische Varianten.
- Klartext, Ciphertext, Schlüsselmaterial, HMAC-Eingaben sowie rohe Request-/Response-Bodies dürfen nicht in Logs, Traces, Analytics oder Fehlerobjekte gelangen. Logs enthalten nur IDs, Datenklasse, Version, Größe, Status und Korrelations-ID.
- Direkte `authenticated`-Writes bleiben nur bis zum nachgewiesenen Client-Cutover bestehen und werden in M6 widerrufen. `service_role` bleibt auf Worker-/Wartungspfade begrenzt.
- RLS ist Defense in Depth. Da `service_role` RLS umgeht, sind Praxisfilter, Objektzuordnung, Rollenprüfung und serverseitig erzeugte AAD in jedem Workerpfad primäre Kontrollen.

## 8. Aufbewahrung, Export und Löschung

| Entität | Standard | Löschung | Export |
|---|---|---|---|
| aktives Inventar/Router/Monitoringziele | bis Entfernung durch Praxis beziehungsweise Praxislöschung | Payload sofort entfernen; D1-Tombstone maximal 30 Tage für Sync | entschlüsselte Nutzdaten plus Herkunft |
| rohe WLAN-Scans | 90 Tage, konfigurierbar 30/90/180 | Hard Delete; keine anonymisierte Topologie behalten | autorisiert entschlüsselt, solange vorhanden |
| WLAN-Aggregate | 12 Monate | mit Praxislöschung entfernen oder vollständig entkoppeln | D1-Zeitreihe |
| D3-Credentials | bis Widerruf/Rotation | sofort lokal löschen | ausgeschlossen |

Export und Praxislöschung decken `inventory_items`, `inventory_known_devices`, `inventory_access_points`, `router_wifi_configurations`, `router_firewall_rules`, `monitoring_targets`, `wlan_scans`, Tombstones sowie Praxis-DEKs und -IIKs ab. Schlüsselmaterial selbst erscheint nie im Nutzerdatenexport, wird bei der Löschung aber vollständig und testbar vernichtet. Die derzeitigen Pfade tun dies nicht vollständig; dies ist ein bestätigter Blocker vor M5. Backups folgen der dokumentierten Providerlöschfrist, während der Applikationszugriff nach Löschung sofort ausgeschlossen wird.

## 9. Migrationsablauf

1. **M0 – Baseline:** Zeilenzahlen, Nullquoten, Payloadgrößen, Schlüsselreferenzen, Grants sowie RLS-/Export-/Lösch-/Restoretests erfassen. Keine D2-Rohwerte in Migrationslogs.
2. **M1 – additive Spalten:** v2-Envelope, HMACs, Key-, Herkunfts-, Revisions- und D1-Aggregatfelder ergänzen. Legacyleser bleiben unverändert; `{}` gilt nicht als migriert.
3. **M2 – API und Dual Write:** Worker-Endpunkte ausrollen. Neue Writes erzeugen v2-Envelope und vorübergehend Legacyfelder. D3 wird rekursiv abgewiesen. Jede Seite wird durch `payload_hmac` verglichen.
4. **M3 – Backfill:** Praxisweise, idempotente Batches. Jeder Datensatz erhält Status und Keyversion. Kryptographie-/Integritätsfehler stoppen global; validierungsbedingte Zeilenfehler pausieren die Praxis und werden ohne Rohdaten quarantänisiert.
5. **M4 – Dual Read:** Neue Clients lesen v2 bevorzugt und fallen nur bei explizitem Status `legacy_pending` zurück. Dashboard, Export und Löschung werden vollständig umgestellt.
6. **M5 – Klartext-Scrub:** Nach 100-%-Verifikation Legacy-D2 leeren. Envelope-/HMAC-/Unique-Verträge aktivieren. App-Rollback ist danach nur auf dual-read-fähige Versionen erlaubt.
7. **M6 – Zugriffshärtung:** Direkte Clientwrites widerrufen, API v1 erzwingen und inkompatible Appversionen kontrolliert ablehnen beziehungsweise aktualisieren.
8. **M7 – Bereinigung:** Legacyspalten frühestens nach 30 Tagen stabiler Produktion und erfolgreichem Restore-/Export-/Löschtest entfernen.

## 10. Rollbackvertrag

- Vor M5 schalten Feature Flags Reads und Writes auf Legacy zurück. Bereits erzeugte v2-Ciphertexte und Schlüssel werden nicht gelöscht.
- M5 wird nur freigegeben, wenn die aktuell produktive und die unmittelbar vorherige Appversion v2/dual-read beherrschen.
- Nach M5 wird niemals Klartext rehydriert. Rollback bedeutet Deployment der vorher freigegebenen dual-read-fähigen Anwendung gegen v2.
- Eine Schlüsselrotation wird erst nach dem Verifikationsfenster finalisiert. Solange referenzierende Payloads existieren, bleibt die alte Version `decrypt_only`; Rückkehr bedeutet Reaktivierung der Leseversion, nicht Keyverlust.
- M7 besitzt einen separaten Go/No-Go-Entscheid und ein zuvor erfolgreich wiederhergestelltes verschlüsseltes Backup.

## 11. Messbare Abbruchkriterien

Die Migration stoppt automatisch und M5/M6 bleiben gesperrt bei:

- **sofort und global:** ein Auth-, RLS-/Cross-Tenant-, D3-, AAD-, Kryptographie-, unbekannte-Keyversion-, Export-, Lösch- oder Restorefehler;
- **Datenintegrität:** Quell-/Zielzeilenzahl, Objektidentität, `payload_hmac` oder Dual-Write weichen ab; tolerierte Abweichung ist null;
- **Backfill:** eine fachlich nicht migrierbare Zeile pausiert die betroffene Praxis; mehr als zehn Zeilen oder mehr als 0,1 % des gesamten Laufs stoppen global – maßgeblich ist der zuerst erreichte Grenzwert;
- **Produktion:** Detailpfad-5xx steigt über ein 15-Minuten-Fenster um mehr als 0,5 Prozentpunkte gegenüber der freigegebenen Baseline oder p95-Latenz überschreitet das Zweifache der Baseline;
- **Schema/Logs:** ein unklassifiziertes Feld, ein D2/D3-Wert in Klartext/Logs oder ein ungültiges Envelope;
- **Betrieb:** das von Operations freigegebene RPO/RTO oder die Aufbewahrungs-/Löschfrist wird im Restore-/Retentiontest verfehlt.

RPO/RTO sind keine stillschweigenden Produktclaims. Operations dokumentiert die verbindlichen Werte vor M1; bis dahin gibt es keine Produktionsfreigabe.

Die Detail-API-v1-Baseline wird nach M2 und vor M3 eingefroren. Zuvor läuft ein kontrollierter Canary mindestens 24 zusammenhängende Stunden und mindestens 1.000 erfolgreiche synthetische beziehungsweise freigegebene Canary-Detailrequests über repräsentative kleine, mittlere und maximal zulässige Payloadgrößen; maßgeblich ist der später erreichte Grenzwert. Referenz-p95 ist der höhere Wert aus produktionsähnlichem Staging-Lasttest und Produktions-Canary, Referenz-5xx die im Canary gemessene Quote. Testfehler werden nicht herausgerechnet. Das signierte Baseline-Artefakt bindet Commit, Worker-Version, Region, Payloadmix, Requestzahl und Zeitfenster. Ohne dieses Artefakt startet M3 nicht.

## 12. Verifikation und Nachweise

Der separate Verifikationsplan definiert synthetische Zwei-Mandanten-Fixtures, Rollen, D3-Poison-Payloads, zwei Keyversionen, Backfill, Dual-Read/-Write, Grants, Restore, Export und Löschung. Er enthält keine Patienten- oder realen Praxisdaten.

M0 erzeugt mindestens:

- signierte Test-/CI-Ergebnisse und Schema-/Grant-Snapshot;
- nur aggregierte Baselinezahlen ohne D2-Rohwerte;
- Restoreprotokoll mit gemessenem RPO/RTO;
- Backfill-/Rollbackprotokoll mit null Abweichungen;
- Freigabematrix mit Name, Rolle, Datum, Artefaktversion und Entscheidung.

## 13. Freigabegates

SP1-07 bleibt `review`, bis alle menschlichen Freigaben vorliegen. Eine technische Vorbereitung durch Codereview ersetzt keinen benannten Verantwortlichen.

| Gate | Stand 2026-08-10 | Benötigter Nachweis/Entscheider |
|---|---|---|
| Schema, API, Dual-Read/-Write | reviewbereit | benannter Technical Owner signiert ADR, Schemaentwurf und Migrationsreihenfolge |
| Datenklassen, Zweck, Retention, Export, Löschung | offen | Datenschutz/Fachreview mit Verarbeitungszweck und Fristen |
| KEK/DEK/IIK, Rotation/Reindex, Backup, Restore, RPO/RTO | offen | Operations plus Security; produktiver Schlüsselprovider und Runbook |
| Mobile Keystore und Offlineverlust | reviewbereit | Mobile Owner; Android-/iOS-Gerätematrix und Recovery-UX |
| AAD, HMAC, Logging, RLS, Cross-Tenant | reviewbereit | Security Review; ausführbare Tests aus dem Verifikationsplan |
| Seed-/Coverage-Darstellung | technisch belegt, Product-Sign-off offen | Product Owner; UI-Fixture zeigt Seed nicht als Messung |
| Backfill, Rollback und Abbruchmetriken | **spezifiziert** | Verifikationsplan; vor M1 als ausführbare Tests/Runbook umgesetzt |

Freigabecheckliste:

- [ ] Technical Owner bestätigt Schema, API und Dual-Read-/Dual-Write-Strategie.
- [ ] Datenschutz bestätigt Datenklassen, Zweck, Aufbewahrung, Export und Löschung.
- [ ] Operations bestätigt KEK/DEK/IIK-Verwaltung, DEK-Rotation, IIK-Reindex, Backup, Restore und RPO/RTO.
- [ ] Mobile Owner bestätigt sicheren Keystore und Offlineverlust-Verhalten.
- [ ] Security bestätigt AAD, HMAC, Logging-Allowlist, RLS und Cross-Tenant-Tests.
- [ ] Product Owner bestätigt Seed- und Coverage-Darstellung.
- [x] Rollbackfixture, Backfillfixture und messbare Abbruchkriterien sind spezifiziert.

## 14. Konsequenzen

Positiv: Datenbank- oder Supportzugriff legt keine detaillierte Praxistopologie offen; Seed und Messung sind unterscheidbar; Offlinefähigkeit, Cloudsync, Export/Löschung und Schlüsselrotation besitzen prüfbare Verträge.

Kosten: Worker-API, lokales Repository, Key-Lifecycle, Dual-Read/-Write und Backfill erhöhen den Aufwand. D2 ist nicht direkt per SQL durchsuchbar. Zulässige Deduplizierung nutzt eng begrenzte HMAC-Indizes; fachliche Suche erfolgt autorisiert nach Entschlüsselung oder lokal.

Nicht gewählt wurden Klartext nur mit RLS, ein globaler Dauerschlüssel, Klartext-SHA-256 kleiner Identitäten, rohe Router-Sicherheitsflags als D1, Massendaten im SecureStore und eine Big-Bang-Migration. Diese Varianten erfüllen Mandantentrennung, Vertraulichkeit, Rotierbarkeit, Offlinegröße oder Rollback nicht ausreichend.
