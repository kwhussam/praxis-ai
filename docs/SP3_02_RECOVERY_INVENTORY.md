# SP3-02 Phase A – Recovery-Istaufnahme

- **Ticket:** SP3-02
- **Phase:** A – Istaufnahme und Entscheidungsregister
- **Stand:** 2026-09-16
- **Branch:** `codex/sp3-02-recovery-tabletop`
- **Status:** `audit_completed` – Bestandsaufnahme abgeschlossen, Betriebsentscheidungen offen
- **Zugehörige Dokumente:** `docs/SP3_02_RECOVERY_TABLETOP_PLAN.md`,
  `docs/SP3_02_DECISION_LOG.md`, `docs/adr/ADR-001_INVENTORY_WLAN_DATA_PROTECTION.md`,
  `docs/adr/ADR-001_VERIFICATION_PLAN.md`

## 1. Zweck und harte Grenzen

Dieses Dokument inventarisiert **ausschließlich anhand des tatsächlichen Repositorystandes**, welche
Datenbestände, Schlüssel, Secrets und Artefakte PraxisShield besitzt, wovon ihre Wiederherstellung
abhängt und welcher Nachweis dafür heute wirklich existiert.

Was dieses Dokument **nicht** ist:

- Es ist **kein durchgeführter Restore**. In dieser Phase wurde keine Datenbank wiederhergestellt,
  kein Backup gelesen und kein Schlüssel rotiert. Jede Aussage zu Wiederherstellbarkeit ist eine
  Ableitung aus Code und Konfiguration, keine Messung.
- Es enthält **keine RPO-/RTO-Zusage**. Solange kein gemessener Restore und keine benannte
  Owner-Freigabe existieren, gibt es keine verbindlichen Zielwerte (siehe
  `docs/SP3_02_DECISION_LOG.md`, D-01).
- Es benennt **keine Owner, die nicht belegt sind**. Das Repository enthält keine `CODEOWNERS`-Datei
  und keine Betriebs-/Rollenmatrix mit Namen. Jede Ownerangabe ist deshalb `owner_required`.
- Es wurde **keine produktive Umgebung** gelesen oder verändert: keine Supabase-Konsole, keine
  Cloudflare-Konfiguration, keine GitHub-Environment-Einstellung, kein KMS, kein Signing-Material.
- Es enthält **keine Secrets und keine D2/D3-Beispielwerte**. Secrets werden ausschließlich über
  ihren Bindungsnamen und ihren Fundort referenziert.

## 2. Nachweisstufen

| Stufe | Bedeutung |
|---|---|
| `measured` | In dieser oder einer dokumentierten früheren Stufe tatsächlich ausgeführt und protokolliert. |
| `configured` | Als wirksamer Code, Migration, Workflow oder Konfiguration im Repository belegt, aber ohne ausgeführten Recovery-Nachweis. |
| `documented` | Nur in Dokumentation, ADR oder Plan beschrieben; nicht durch Code oder Konfiguration erzwungen. |
| `unknown` | Im Repository nicht belegbar. Nur über Providerkonsolen, Verträge oder benannte Personen klärbar. |

Ein `configured`-Eintrag ist ausdrücklich **kein** Recovery-Nachweis. Zum Abschluss der
Phase-A-Istaufnahme war für Backup- und Restorefähigkeit im gesamten Repository noch kein
`measured`-Eintrag vorhanden. Der spätere lokale Phase-B-Lauf ist separat in
`docs/SP3_02_PHASE_B_RUNBOOK.md` dokumentiert und ändert keine der produktiven `unknown`-Wertungen.

## 3. Datenklassen

Die Klassen folgen `docs/adr/ADR-001_INVENTORY_WLAN_DATA_PROTECTION.md`, Abschnitt 3:

| Klasse | Bedeutung |
|---|---|
| D0 | öffentlich, kein Schutzbedarf |
| D1 | minimiertes Betriebsmetadata ohne direkten Identifikator |
| D2 | vertrauliche Praxis-, Netz- oder Personendaten |
| D3 | Geheimnis/Zugangsdaten – verlässt das Gerät beziehungsweise den Secret Store nie |

## 4. Plattform- und Backupautoritäten

| Kürzel | Plattform | Backupautorität laut Repositorybeleg |
|---|---|---|
| `SB-DB` | Supabase Postgres (`supabase/config.toml`, `major_version = 17`) | `unknown` – im Repository existiert keine Backup-, PITR- oder Snapshotkonfiguration |
| `SB-AUTH` | Supabase Auth (`auth.users`, `auth.identities`, MFA-Faktoren) | `unknown` – teilt das Schicksal des Postgres-Clusters, ohne belegte eigene Sicherung |
| `SB-STG` | Supabase Storage (`supabase/config.toml` `[storage] enabled = true`) | entfällt – **keine Buckets deklariert, kein Codepfad nutzt Storage** |
| `CF-WK` | Cloudflare Worker (`workers/hono/wrangler.toml`) | Code aus Git reproduzierbar; **Secrets nicht** |
| `CF-SEC` | Cloudflare Worker Secrets (`wrangler secret`) | `unknown` – kein Escrow, kein Registry, keine Rotationsspur im Repository |
| `GH-CI` | GitHub Actions Artefakte und Attestationen | `configured` – Retention in den Workflows gesetzt |
| `GH-ENV` | GitHub Environments `production-android` / `production-ios` | `unknown` – Environmentinhalt ist nicht im Repository |
| `MOB` | Mobiles Endgerät (iOS Keychain / Android Keystore, SQLite) | **bewusst kein Backup** – siehe 5.G |
| `GIT` | Git-Repository `kwhussam/praxis-ai` | `unknown` – kein dokumentiertes Repository-Backup außerhalb GitHub |

## 5. Bestandsaufnahme

Jeder Eintrag führt: Beleg, Datenklasse, Plattform, technischer Owner, Backupautorität und
Backupsachstand, Verschlüsselung und Schlüsselabhängigkeit, Wiederherstellungsreihenfolge (Stufe aus
Abschnitt 6), Abhängigkeiten, Retention-/Löschbezug, Nachweisstatus und erkennbare Risiken.

### 5.A Supabase / Postgres

#### A-01 Mandantenkern: `practices`, `white_label_partners`, `partner_practices`, `practice_memberships`

- **Beleg:** `supabase/migrations/20260624150000_initial_schema.sql`,
  `supabase/migrations/20260713120000_rls_tenant_hardening.sql`,
  `supabase/migrations/20260724160000_backoffice_b1a_authz_schema.sql`
- **Datenklasse:** D2 (`name`, `domain`, `email`, `legal_name`, Kontaktname, Telefon, Straße, PLZ, Ort
  – belegt in `supabase/seed.sql` als Spaltensatz)
- **Plattform:** `SB-DB` · **Technischer Owner:** `owner_required`
- **Backupautorität / -stand:** `unknown`. Es existiert keine Backup-, PITR- oder
  Exportkonfiguration im Repository.
- **Verschlüsselung:** keine Spaltenverschlüsselung. Schutz beruht ausschließlich auf RLS und
  Transportverschlüsselung. **Keine Schlüsselabhängigkeit** – dieser Bestand ist nach einem Restore
  ohne Schlüsselmaterial lesbar.
- **Wiederherstellungsreihenfolge:** R4 (nach Schema und Auth, vor allen praxisgebundenen Daten)
- **Abhängigkeiten:** `auth.users` (FK `owner_id`), `white_label_partners`; alle praxisgebundenen
  Tabellen hängen über `practice_id` an diesem Kern.
- **Retention/Löschung:** `complete_privacy_deletion` anonymisiert `practices` (`name = '[GELOESCHT]'`,
  `domain = null`, `email = null`, `deleted_at`), löscht die Zeile aber nicht
  (`supabase/migrations/20260811130000_sp2_04_assessment_manifest.sql`).
- **Nachweisstatus:** Schema `configured`; Backup/Restore `unknown`
- **Risiko:** Ein AFTER-INSERT-Trigger `practices_create_default_avv`
  (`20260624150000_initial_schema.sql`) legt beim Einfügen einer Praxis automatisch einen
  AVV-Datensatz mit `accepted_at = now()` an. Bei einem logischen Restore, der `practices` vor
  `data_processing_agreements` lädt, erzeugt dieser Trigger einen **neuen AVV mit falschem
  Zustimmungszeitpunkt** und kollidiert anschließend über `unique (practice_id, version)` mit dem
  echten Datensatz. Ein Restore muss Trigger deaktivieren oder die Reihenfolge erzwingen – heute ist
  weder das eine noch das andere dokumentiert. **Gap G-05.**

#### A-02 `security_checks`

- **Beleg:** `supabase/migrations/20260624150000_initial_schema.sql`;
  Idempotenz `supabase/migrations/20260722095000_security_checks_reports_idempotency.sql`
- **Datenklasse:** D1 (`type`, `score`, `completed_at`) und D2 (`results`, `encrypted_payload`)
- **Plattform:** `SB-DB` · **Technischer Owner:** `owner_required`
- **Backupautorität / -stand:** `unknown`
- **Verschlüsselung:** `encrypted_payload jsonb not null default '{}'::jsonb`, befüllt über
  `encryptJson` (`workers/hono/src/index.ts:2416`) mit AES-256-GCM unter dem **globalen**
  `DATA_ENCRYPTION_KEY`. `results` bleibt Klartext-JSONB.
- **Schlüsselabhängigkeit:** K-01 (`DATA_ENCRYPTION_KEY`). Ohne diesen Schlüssel ist der verschlüsselte
  Anteil nach einem Restore **dauerhaft unlesbar**; es gibt keine zweite Schlüsselversion und keinen
  Wrapping-Pfad.
- **Wiederherstellungsreihenfolge:** R5a (vor `assessment_manifests` und `reports`)
- **Abhängigkeiten:** `practices`; wird von `assessment_manifests.source_check_id` und
  `reports.check_id` referenziert.
- **Retention/Löschung:** Anonymisierung statt Löschung – `results` wird auf
  `{"anonymized": true}`, `encrypted_payload` auf `{}` gesetzt, `anonymized_at` gestempelt.
- **Nachweisstatus:** `configured`
- **Risiko:** Der Default `'{}'` ist laut ADR-001 Abschnitt 4.5 **kein gültiges Envelope**. Ein
  Restore kann heute nicht maschinell unterscheiden, ob `{}` „nie verschlüsselt", „anonymisiert" oder
  „beim Restore verloren" bedeutet. **Gap G-07.**

#### A-03 `reports` und `assessment_manifests`

- **Beleg:** `supabase/migrations/20260624150000_initial_schema.sql` (Basis),
  `supabase/migrations/20260811130000_sp2_04_assessment_manifest.sql` (Manifest, RPC, RLS, Grants)
- **Datenklasse:** D1 (Versionsfelder, Hashes) und D2 (`content`, `encrypted_content`,
  `encrypted_snapshot`)
- **Plattform:** `SB-DB` · **Technischer Owner:** `owner_required`
- **Backupautorität / -stand:** `unknown`
- **Verschlüsselung:** `encrypted_content` und `encrypted_snapshot` AES-256-GCM über `encryptJson`;
  Integrität zusätzlich über `snapshot_sha256`, `manifest_sha256`, `report_manifest_sha256`
  (CHECK-Constraints `^[0-9a-f]{64}$`).
- **Schlüsselabhängigkeit:** K-01. **Dies ist der kritischste Verlustpfad des Produkts:** Der
  kanonische PDF-Export rendert ausschließlich aus dem entschlüsselten Snapshot
  (`docs/ARCHITECTURE.md`, Abschnitt „Canonical report artifacts (SP2-04)"). Ohne K-01 ist jeder
  Bericht nach einem Restore zwar vorhanden, aber nicht mehr erzeugbar.
- **Wiederherstellungsreihenfolge:** R5b
- **Abhängigkeiten:** `practices`, `security_checks`; zusätzlich die zusammengesetzte
  Fremdschlüsselbindung `reports_assessment_manifest_practice_fkey (assessment_manifest_id,
  practice_id)` auf `assessment_manifests(id, practice_id)`. Ein Restore, der beide Tabellen
  unabhängig lädt, verletzt diese Bindung, wenn Reihenfolge oder Vollständigkeit nicht stimmen.
- **Retention/Löschung:** `assessment_manifests` werden bei Praxislöschung **hart gelöscht**;
  `reports` werden anonymisiert (`content`, `encrypted_content`, `report_manifest`,
  `report_manifest_sha256` geleert).
- **Nachweisstatus:** Schema, Hashes, Transaktionalität `configured`; Restore `unknown`
- **Risiko:** Hash-Constraints erzwingen Format, **nicht Übereinstimmung**. Ein Restore, der
  Ciphertext und Hash aus unterschiedlichen Zeitpunkten mischt, wird von der Datenbank nicht
  abgewiesen – erst der Worker-Exportpfad meldet den Integritätskonflikt. Der Phase-B-Drill muss
  Hashvergleich deshalb aktiv prüfen. **Gap G-08.**

#### A-04 `monitoring_events`, `monitoring_snapshots` und Realtime

- **Beleg:** `supabase/migrations/20260624150000_initial_schema.sql`;
  Realtime-Publikation ebendort (`alter publication supabase_realtime add table ...`)
- **Datenklasse:** D1 (`score`, `category_scores`, Zeitpunkte) und D2 (`details`, `ssl`,
  `email_security`, `devices`, `checks`, `encrypted_checks`, `title`, `message`)
- **Plattform:** `SB-DB` · **Technischer Owner:** `owner_required`
- **Backupautorität / -stand:** `unknown`
- **Verschlüsselung:** nur `encrypted_checks` (AES-256-GCM, `workers/hono/src/index.ts:3581`).
  `ssl`, `email_security`, `devices`, `checks` bleiben Klartext-JSONB.
- **Schlüsselabhängigkeit:** K-01 für `encrypted_checks`; der Klartextanteil ist schlüsselfrei lesbar.
- **Wiederherstellungsreihenfolge:** R5c
- **Abhängigkeiten:** `practices`; die Realtime-Publikation muss nach dem Datenrestore wieder
  Mitglied sein, sonst bleibt der Monitoring-Tab ohne Livepfad
  (`docs/ARCHITECTURE.md`, „Data Loading: Dashboard vs. Monitoring tab (PERF-06)").
- **Retention/Löschung:** Anonymisierung; `complete_privacy_deletion` meldet
  `monitoring_retention_until = now() + interval '1 year'`.
- **Nachweisstatus:** `configured`
- **Risiko:** Die Publikationsmitgliedschaft ist eine **Clusterzustandseigenschaft**, kein
  Tabelleninhalt. Ein Restore per Datendump stellt sie nicht automatisch her. **Gap G-09.**

#### A-05 `wlan_scans`

- **Beleg:** `supabase/migrations/20260624150000_initial_schema.sql`;
  Replayschutz `supabase/migrations/20260714130000_wlan_sync_replay_guard.sql`
- **Datenklasse:** D2 (`network_info`, `vulnerabilities` – SSID, BSSID, IP, Gateway, DNS, Geräte)
- **Plattform:** `SB-DB` · **Technischer Owner:** `owner_required`
- **Backupautorität / -stand:** `unknown`
- **Verschlüsselung:** **faktisch keine.** `encrypted_payload` besitzt den Default `'{}'::jsonb` und
  ist laut ADR-001 Abschnitt 2 und 4.5 ausdrücklich **kein gültiges v2-Envelope**. Die sensiblen
  Felder liegen im Klartext.
- **Schlüsselabhängigkeit:** keine – und genau das ist das Problem.
- **Wiederherstellungsreihenfolge:** R5c
- **Abhängigkeiten:** `practices`
- **Retention/Löschung:** **Hard Delete** bei Praxislöschung (`delete from public.wlan_scans`).
  ADR-001 Abschnitt 8 sieht zusätzlich 90 Tage Standardaufbewahrung mit 30/90/180 vor – diese
  Retention ist im Code **nicht implementiert**; es gibt keinen Cron und keine RPC dafür.
- **Nachweisstatus:** Schema `configured`; Retention `documented`; Verschlüsselung **offen**
- **Risiko:** Ein wiederhergestelltes Backup legt die vollständige Netztopologie einer Praxis im
  Klartext offen. Backupzugriff ist damit gleichwertig zu Datenbankzugriff. **Gap G-02.**

#### A-06 Inventar-, Router- und Monitoringziel-Tabellen

- **Beleg:** `supabase/migrations/20260715120000_inventory_monitoring_targets.sql`
- **Umfang:** `inventory_items`, `inventory_known_devices`, `inventory_access_points`,
  `router_wifi_configurations`, `router_firewall_rules`, `monitoring_targets`
- **Datenklasse:** D2 im Klartext – belegt an den Spalten `mac_address`, `hostname`, `ssid`, `bssid`,
  `location`, `owner`, `ports`, `source`, `destination`, `value` sowie den Router-Sicherheitsflags
  `wps`, `open_wifi`, `tkip`.
- **Plattform:** `SB-DB` · **Technischer Owner:** `owner_required`
- **Backupautorität / -stand:** `unknown`
- **Verschlüsselung:** keine. **Schlüsselabhängigkeit:** keine.
- **Wiederherstellungsreihenfolge:** R5d
- **Abhängigkeiten:** `practices`. `monitoring_targets.value_normalized` ist
  `generated always as (lower(btrim(value))) stored` – eine generierte Spalte, die beim Restore
  **nicht literal eingespielt werden darf**.
- **Retention/Löschung:** **Keine.** `complete_privacy_deletion`
  (`20260811130000_sp2_04_assessment_manifest.sql`) berührt keine dieser sechs Tabellen. Nach einer
  Praxislöschung bleiben MAC-Adressen, SSIDs, Hostnamen, Firewallregeln und Monitoringziele
  bestehen; entfernt würden sie nur über das FK-Kaskadieren beim harten Löschen einer
  Praxiszeile, das der Löschpfad gerade **nicht** ausführt.
- **Nachweisstatus:** Schema `configured`; Löschabdeckung **fehlt**
- **Risiko:** Doppelt. Erstens Klartext-D2 im Backup wie bei A-05. Zweitens ist der Löschzustand
  nach einem Restore **nicht verifizierbar**, weil es keinen Löschpfad gibt, dessen Ergebnis man
  prüfen könnte. ADR-001 Abschnitt 8 benennt dies bereits als bestätigten Blocker vor M5.
  **Gap G-01.**

#### A-07 `consent_log`

- **Beleg:** `supabase/migrations/20260625120000_launch_hardening.sql` (Tabelle),
  `supabase/migrations/20260715121000_extend_consent_log_types.sql`,
  `supabase/migrations/20260812150000_sp2_05_consent_registry.sql` (Registry, Trigger, RPCs)
- **Datenklasse:** D1/D2 – `scope` enthält strukturierte Provider- und Datenartangaben.
- **Plattform:** `SB-DB` · **Technischer Owner:** `owner_required`
- **Backupautorität / -stand:** `unknown`
- **Verschlüsselung:** keine. **Schlüsselabhängigkeit:** keine.
- **Wiederherstellungsreihenfolge:** R5e – **und zwar zwingend in Ereignisreihenfolge.**
- **Abhängigkeiten:** Selbstreferenz `supersedes_id uuid references public.consent_log(id)
  on delete restrict`. Die Kette muss lückenlos und in Vorgängerreihenfolge zurückkommen.
- **Retention/Löschung:** ausdrücklich **nicht** gelöscht – `complete_privacy_deletion` listet
  `consent_log` unter `retained_for_legal` mit `retention_until = now() + interval '6 years'`.
- **Nachweisstatus:** `configured`
- **Risiko:** Drei harte Restorehindernisse, alle belegt in
  `20260812150000_sp2_05_consent_registry.sql`:
  1. Trigger `consent_log_append_only` wirft bei **jedem** `update` oder `delete` (`42501`). Eine
     Korrektur fehlerhaft eingespielter Zeilen ist mit normalen Rollen unmöglich.
  2. `revoke update, delete, truncate on public.consent_log from public, anon, authenticated,
     service_role` – auch `service_role` kann die Tabelle nicht leeren. Ein wiederholter Restore in
     eine nicht leere Tabelle ist damit nur als Tabelleneigentümer/Superuser möglich.
  3. Trigger `consent_log_link_previous` setzt `supersedes_id` bei `null` selbst und nimmt einen
     `pg_advisory_xact_lock`. Ein Massenrestore serialisiert damit pro `(practice_id, type)`.

  Diese Eigenschaften sind sicherheitstechnisch **richtig** und dürfen nicht abgeschwächt werden –
  sie müssen aber im Restore-Runbook ausdrücklich behandelt werden. **Gap G-06.**

#### A-08 Audit-, Nachweis- und Löschzustandstabellen

- **Beleg und Umfang:**
  - `practice_access_audit` – `20260624150000_initial_schema.sql`
  - `data_processing_agreements` – ebenda
  - `deletion_requests` – ebenda, FK ergänzt in `20260722092000_deletion_requests_practice_fk.sql`
  - `backoffice_audit_events` – `20260727113000_backoffice_audit_retention.sql`
  - `password_reset_audit_events` – `20260729220000_admin_password_reset_backend.sql`
- **Datenklasse:** D1/D2 (`ip_hash`, `user_agent`, `metadata`, `report`)
- **Plattform:** `SB-DB` · **Technischer Owner:** `owner_required`
- **Backupautorität / -stand:** `unknown`
- **Verschlüsselung:** keine; `ip_hash` ist ein Hash, kein Chiffrat.
- **Wiederherstellungsreihenfolge:** R6 – **nach** den Nutzdaten, weil `deletion_requests.report`
  den Beweis darstellt, welcher Löschzustand gelten muss.
- **Retention/Löschung:** `backoffice_audit_events` und `password_reset_audit_events` 183 Tage bis
  maximal 3650 Tage mit erzwungener Untergrenze (`raise exception 'retention_days must be between
  183 and 3650'`), danach begrenzte Anonymisierung. `practice_access_audit`, `deletion_requests`,
  `consent_log` und `data_processing_agreements` sind mit sechs Jahren `retained_for_legal`.
- **Nachweisstatus:** `configured`
- **Risiko:** Ein Restore auf einen Zeitpunkt **vor** einer vollzogenen Praxislöschung stellt
  gelöschte beziehungsweise anonymisierte D2-Daten wieder her, während `deletion_requests` die
  Löschung weiterhin als `completed` ausweist. Es existiert kein Abgleich, der diesen Widerspruch
  erkennt oder die Löschung nach dem Restore erneut anwendet. **Gap G-03.**

#### A-09 `email_outbox`

- **Beleg:** `supabase/migrations/20260625120000_launch_hardening.sql`;
  Retention `supabase/migrations/20260722093000_email_outbox_retention.sql`
- **Datenklasse:** D2 (Empfängeradresse, Nachrichteninhalt der Löschbestätigung)
- **Plattform:** `SB-DB` · **Technischer Owner:** `owner_required`
- **Verschlüsselung:** keine. **Wiederherstellungsreihenfolge:** R6
- **Retention/Löschung:** `cleanup_email_outbox(retention_days integer default 30)` per Worker-Cron.
  Der Migrationskommentar hält ausdrücklich fest, dass die Tabelle von
  `complete_privacy_deletion` **nie** berührt wird.
- **Nachweisstatus:** `configured`
- **Risiko:** Ein Restore setzt bereits per Retention entfernte Empfängeradressen wieder in die
  Datenbank. Der nächste Cronlauf entfernt sie erneut – aber erst nach dem Restore und nur, wenn der
  Cron überhaupt wieder aktiv ist (siehe E-01). **Gap G-03.**

#### A-10 Quota-, Rate-Limit- und Idempotenztabellen

- **Beleg:** `external_check_usage` (`20260624150000_initial_schema.sql`), `ai_report_usage`
  (`20260714120000_ai_report_quota.sql`), `endpoint_rate_limit`
  (`20260722094000_endpoint_rate_limit_window.sql`), `backoffice_rate_limit`
  (`20260727150000_backoffice_actor_rate_limit.sql`), `backoffice_idempotency_keys`
  (`20260729220000_admin_password_reset_backend.sql`), `password_reset_rate_limit` (ebenda)
- **Datenklasse:** D1
- **Plattform:** `SB-DB` · **Technischer Owner:** `owner_required`
- **Wiederherstellungsreihenfolge:** R7 – zuletzt, bewusst als **verzichtbar** einzustufen
- **Retention/Löschung:** `password_reset_rate_limit` älter als 24 Stunden wird gelöscht;
  Idempotenzschlüssel werden über `20260729220000_admin_password_reset_backend.sql` bereinigt.
- **Nachweisstatus:** `configured`
- **Risiko:** Ein Restore alter Idempotenz- und Quotazeilen kann Doppelverarbeitung erlauben oder
  legitime Anfragen blockieren. Die Entscheidung „wiederherstellen oder verwerfen" ist eine
  **Betriebsentscheidung**, keine technische; sie ist bisher nirgends getroffen. **Gap G-10.**

#### A-11 Backoffice-Autorisierung

- **Beleg:** `supabase/migrations/20260724160000_backoffice_b1a_authz_schema.sql`,
  `20260728160000_backoffice_consultant_assignments.sql`,
  `20260728170000_backoffice_invitation_redeem.sql`,
  `20260804150000_b4c_public_practice_requests.sql`
- **Umfang:** `platform_staff`, `staff_practice_assignments`, `practice_invitations`,
  `practice_activation_requests`, `practice_memberships`
- **Datenklasse:** D1/D2; `practice_invitations` enthält einen **HMAC-Beweis**, nicht den Code.
- **Plattform:** `SB-DB` · **Technischer Owner:** `owner_required`
- **Schlüsselabhängigkeit:** K-04 (`BACKOFFICE_INVITE_HMAC_SECRET`). Ein Restore der
  Einladungstabelle **ohne** das zugehörige HMAC-Secret macht alle offenen Einladungen unbrauchbar;
  das ist laut Kommentar in `workers/hono/src/index.ts:47-53` das gewollte Rotationsverhalten,
  im Recoveryfall aber ein zu planender Nebeneffekt.
- **Wiederherstellungsreihenfolge:** R4 (zusammen mit dem Mandantenkern, da Zugriffsrechte davon
  abhängen)
- **Nachweisstatus:** `configured`
- **Risiko:** `practice_memberships_guard_last_owner` verhindert, dass die letzte Ownerzuordnung
  entfernt wird. Ein teilweiser oder falsch geordneter Restore kann dadurch in einem Zustand enden,
  in dem **niemand** Zugriff auf eine Praxis hat und der Trigger die Korrektur blockiert.
  **Gap G-11.**

#### A-12 `partner_plan_pricing`

- **Beleg:** `supabase/migrations/20260624150000_initial_schema.sql`; RLS und Partnerbindung
  ebendort.
- **Datenklasse:** D1 – Tarifname, Preis, Abrechnungsintervall und Aktivstatus sind betriebliche
  Vertrags-/Konfigurationsdaten ohne technischen Praxisidentifikator.
- **Plattform:** `SB-DB` · **Technischer Owner:** `owner_required`
- **Backupautorität / -stand:** `unknown`
- **Verschlüsselung:** keine; **Schlüsselabhängigkeit:** keine.
- **Wiederherstellungsreihenfolge:** R4, nach `white_label_partners` und vor der Freigabe von
  Partnerfunktionen.
- **Abhängigkeiten:** `partner_id` verweist auf `white_label_partners`; die RLS-Policy bindet den
  Zugriff an den angemeldeten Partner.
- **Retention/Löschung:** kein eigenständiger Retention- oder Löschpfad dokumentiert; der Bestand
  folgt dem Lebenszyklus des Partnerkontos.
- **Nachweisstatus:** Schema/RLS `configured`; Backup/Restore `unknown`
- **Risiko:** kein eigener P1-/P2-Befund, aber Bestandteil des Vollständigkeits- und
  Reconciliation-Nachweises im Restore-Drill.

### 5.B Supabase Auth

#### B-01 `auth.users`, `auth.identities`, MFA-Faktoren

- **Beleg:** `supabase/seed.sql` (Zeilen 3–154) schreibt direkt in `auth.users` und
  `auth.identities`; MFA-Anforderung über `platform_staff.mfa_required` und die Worker-Prüfung
  `actor.aal !== "aal2"` (`workers/hono/src/index.ts:3844`).
- **Datenklasse:** D2 (E-Mail-Adressen) und D3 (Passwort-Hashes, Refresh Tokens, MFA-Secrets)
- **Plattform:** `SB-AUTH` · **Technischer Owner:** `owner_required`
- **Backupautorität / -stand:** `unknown`. Ob ein Supabase-Backup das `auth`-Schema einschließt, ist
  im Repository **nicht belegt** und muss beim Provider verifiziert werden.
- **Verschlüsselung:** providerseitig; nicht durch PraxisShield kontrolliert.
- **Wiederherstellungsreihenfolge:** R3 – **vor** dem Mandantenkern, weil `practices.owner_id`,
  `partner_practices.granted_by` und alle Auditzeilen auf `auth.users(id)` verweisen.
- **Abhängigkeiten:** GoTrue-JWT-Signaturschlüssel. Wird der Cluster mit einem **anderen**
  JWT-Secret wiederhergestellt, sind alle ausgegebenen Sessions ungültig und alle Clients müssen
  sich neu anmelden – auf dem Mobilgerät bedeutet das zusätzlich, dass `secureAuthStorage`-Inhalte
  wertlos werden.
- **Retention/Löschung:** `complete_privacy_deletion` löscht **keinen** `auth.users`-Eintrag.
- **Nachweisstatus:** `unknown`
- **Risiko:** Fehlen `auth.users`, `auth.identities` oder erforderliche GoTrue-Konfiguration, sind
  Identitäten, Fremdschlüssel und Anmeldepfade nicht wiederhergestellt. Ein **geändertes**
  JWT-Secret invalidiert dagegen zunächst bestehende Sessions; es verhindert nicht automatisch
  eine erneute Anmeldung, wenn Auth-Daten und GoTrue-Konfiguration korrekt wiederhergestellt sind.
  Auth-Datenrestore, Auth-Konfiguration und Sessionkontinuität müssen deshalb getrennt geprüft
  werden. **Gap G-04.**

### 5.C Supabase Storage

#### C-01 Objektspeicher

- **Beleg:** `supabase/config.toml` Zeilen 115–121: `[storage] enabled = true`,
  `file_size_limit = "50MiB"`, Bucketdefinitionen **auskommentiert**. Eine repositoryweite Suche
  nach `storage.from`, `supabase.storage` oder `createBucket` liefert in `lib/`, `app/`,
  `workers/` und `supabase/` **keinen Treffer**.
- **Nutzung heute:** keine. `reports.pdf_url`, `white_label_partners.logo_url` und
  `data_processing_agreements.document_url` sind nullable Spalten ohne schreibenden Codepfad; der
  PDF-Pfad rendert serverseitig aus dem verschlüsselten Snapshot und speichert **kein Objekt**
  (`docs/ARCHITECTURE.md`, „Canonical report artifacts (SP2-04)").
- **Datenklasse:** entfällt · **Plattform:** `SB-STG`
- **Wiederherstellungsreihenfolge:** entfällt
- **Nachweisstatus:** `configured` (Nichtnutzung ist positiv belegt)
- **Risiko:** gering heute, aber die drei URL-Spalten sind ein offener Pfad: sobald einer bedient
  wird, entsteht ein zweiter Datenbestand mit eigener Backupautorität, den weder Export noch
  Löschung heute abdecken. **Gap G-12 (P4, vorbeugend).**

### 5.D Schema, Migrationen, RLS, Grants und RPCs

#### D-01 Migrationskette

- **Beleg:** 37 Dateien unter `supabase/migrations/`, von
  `20260624150000_initial_schema.sql` bis `20260812150000_sp2_05_consent_registry.sql`.
- **Reihenfolgeprüfung ist bereits implementiert:** `scripts/e2e/env-up.sh` vergleicht die
  Dateinamenspräfixe mit `supabase_migrations.schema_migrations` und bricht bei Abweichung mit
  `"The applied Supabase migrations do not match the repository."` ab. Das ist der
  **einzige bereits vorhandene, ausführbare Baustein** eines Restoreverifikationspfads.
- **Datenklasse:** D0 · **Plattform:** `SB-DB` · **Backupautorität:** `GIT`
- **Wiederherstellungsreihenfolge:** R2
- **Nachweisstatus:** `configured` (lokal ausgeführt in früheren Stufen: `measured` für
  `supabase db reset`, **nicht** für einen Restore aus einem Backup)

#### D-02 RLS-Policies und `force row level security`

- **Beleg:** alle 34 Anwendungstabellen tragen `enable row level security`, davon **alle 34**
  zusätzlich `force row level security` (maschinell aus `supabase/migrations/*.sql` ausgezählt).
  Partnerrollenmodell in `docs/RLS_PARTNER_ROLE_MATRIX.md`.
- **Datenklasse:** D0 (Regelwerk) · **Plattform:** `SB-DB`
- **Wiederherstellungsreihenfolge:** R2 – Policies müssen **vor** dem Datenimport aktiv sein,
  sonst existiert ein Zeitfenster mit Daten ohne Mandantengrenze.
- **Abhängigkeiten:** `public.current_user_can_access_practice`, `public.can_access_practice`,
  `public.current_user_platform_role` und weitere Hilfsfunktionen aus D-03.
- **Nachweisstatus:** `configured`; Wirksamkeit durch 242 pgTAP-Assertions in 13 Suiten belegt
  (`supabase/tests/*.sql`, `select plan(...)` aufsummiert), zuletzt `measured` im Kontext SP2-05,
  **aber nie gegen ein wiederhergestelltes Backup**.
- **Risiko:** RLS-Wirksamkeit nach Restore ist bisher **nicht** Gegenstand eines Tests. Genau das
  ist Prüfpunkt P-02 des Phase-B-Drills.

#### D-03 RPCs und Grants

- **Beleg:** 54 Funktionen unter `public.` (aus `supabase/migrations/*.sql` extrahiert), darunter
  die recoverykritischen `complete_privacy_deletion`, `persist_assessment_report`,
  `has_active_practice_consent`, `list_practices_with_active_consent`,
  `consume_external_check_quota`, `consume_ai_report_quota`,
  `backoffice_*` und `password_reset_*`.
- **Granthärtung belegt:** `revoke execute ... from public, anon, authenticated` mit anschließendem
  `grant execute ... to service_role` für `persist_assessment_report` und
  `complete_privacy_deletion` (`20260811130000_sp2_04_assessment_manifest.sql`); mehrere Funktionen
  setzen `set search_path = ''`.
- **Wiederherstellungsreihenfolge:** R2
- **Nachweisstatus:** `configured`
- **Risiko:** Grants sind Clusterzustand. Ein Restore, der nur Tabellendaten zurückspielt, stellt
  sie **nicht** her. Ein stillschweigend zu weit gefasster Grant nach einem Restore ist ein
  Mandantengrenzenbruch, den heute kein automatischer Vergleich entdeckt. Deshalb ist der
  Grant-Snapshot ein Pflichtprüfpunkt des Phase-B-Drills (P-03). **Gap G-13.**

### 5.E Cloudflare Worker und Worker-Secrets

#### E-01 Workerdeployment und Cron-Trigger

- **Beleg:** `workers/hono/wrangler.toml` – `name = "praxisshield-edge"`,
  `compatibility_date = "2026-06-24"`, `[vars] APP_ENV`, `PASSWORD_RESET_OTP_TTL_SECONDS` und
  **sieben** Cron-Trigger. Der Dispatcher liegt in `workers/hono/src/index.ts:5632-5642`
  (`EMAIL_OUTBOX_RETENTION_CRON`, `BACKOFFICE_AUDIT_RETENTION_CRON`, sonst
  `runScheduledMonitoring`).
- **Datenklasse:** D0 (Code) · **Plattform:** `CF-WK` · **Backupautorität:** `GIT`
- **Verschlüsselung:** entfällt; **Schlüsselabhängigkeit:** K-01 bis K-06 zur Laufzeit.
- **Wiederherstellungsreihenfolge:** R6 – **bewusst nach** dem Datenrestore. Ein zu früh
  aktivierter Cron führt Retention-Löschungen und Monitoringläufe gegen einen halb
  wiederhergestellten Datenstand aus.
- **Nachweisstatus:** Code `configured`; produktive Deploymentkonfiguration `unknown`
- **Risiko:** Es gibt keinen dokumentierten Schalter, der die sieben Cron-Trigger während eines
  Restores stilllegt. Der Retention-Cron `cleanup_email_outbox` und die
  Audit-Anonymisierung würden unmittelbar nach Workerstart auf den restaurierten Daten arbeiten.
  **Gap G-14.**

#### E-02 K-01 `DATA_ENCRYPTION_KEY` – **kritischster Einzelpunkt**

- **Beleg:** `workers/hono/src/index.ts:34` (Bindung), `:2416` `encryptJson`, `:2430` `decryptJson`,
  `:2446-2451` `importAesKey`, `:2453` `decodeEncryptionKey`.
- **Eigenschaften, alle am Code belegt:**
  - ein **einziger globaler** AES-256-GCM-Schlüssel für **alle** Mandanten;
  - **keine Keyversion** im Envelope – das Envelope ist
    `{ alg: "AES-256-GCM", iv, data, created_at }`;
  - **keine AAD**: `crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext)` übergibt
    kein `additionalData`;
  - kein Wrapping, kein KEK, keine zweite Version, kein `decrypt_only`-Zustand;
  - fail-closed nur bei falscher Länge: `"DATA_ENCRYPTION_KEY must decode to exactly 32 bytes"`.
- **Abhängige Bestände:** A-02 `security_checks.encrypted_payload`, A-03
  `reports.encrypted_content` **und** `assessment_manifests.encrypted_snapshot`, A-04
  `monitoring_snapshots.encrypted_checks`.
- **Datenklasse:** D3 · **Plattform:** `CF-SEC` · **Technischer Owner:** `owner_required`
- **Backupautorität / -stand:** `unknown`. Es gibt **kein Escrow, kein Registry, keine
  Rotationsspur und keinen dokumentierten Wiederbeschaffungspfad** im Repository.
- **Wiederherstellungsreihenfolge:** **R0 – vor allem anderen.** Ein Datenbankrestore ohne K-01
  liefert eine Datenbank, deren gesamter verschlüsselter Anteil dauerhaft verloren ist.
- **Retention/Löschung:** ADR-001 Abschnitt 6.1 sieht vor, dass dieser globale Schlüssel nur
  zeitlich begrenzt für Legacy-Reads bestehen bleibt. Der Zielzustand (praxisgebundene DEKs unter
  versioniertem KEK) ist **nicht implementiert**.
- **Nachweisstatus:** Verwendung `configured`; Verwahrung, Escrow und Rotierbarkeit `unknown`
- **Risiko:** **P1.** Verlust von K-01 macht die verschlüsselten Vollberichte,
  Assessment-Snapshots und verschlüsselten Checkpayloads sämtlicher Mandanten dauerhaft unlesbar;
  insbesondere können kanonische PDFs nicht mehr reproduziert werden. Datenbankzeilen und bewusst
  gespeicherte Klartextzusammenfassungen werden dadurch nicht vernichtet. Kompromittierung von K-01
  bedeutet umgekehrt den Verlust der Vertraulichkeit über **alle** verschlüsselten Mandantendaten,
  weil keine Mandantentrennung im Schlüsselmaterial existiert. Eine Rotation ist heute technisch
  nicht durchführbar, da das Envelope keine Version trägt und damit kein Mischzustand aus altem und
  neuem Schlüssel lesbar wäre. **Gap G-15, G-16.**

#### E-03 K-02 `SUPABASE_SERVICE_ROLE_KEY`, K-03 `SUPABASE_URL` / `SUPABASE_ANON_KEY`

- **Beleg:** `workers/hono/src/index.ts:35-37`; Nutzung über `supabaseRest`.
- **Datenklasse:** K-02 D3, K-03 D1/D0 (Anon Key ist öffentlich, aber durch RLS geschützt –
  `docs/ARCHITECTURE.md`, „Security Model").
- **Plattform:** `CF-SEC` · **Technischer Owner:** `owner_required`
- **Backupautorität / -stand:** `unknown`; beide sind beim Provider neu erzeugbar, das
  **Neuerzeugen ist aber selbst nicht dokumentiert**.
- **Wiederherstellungsreihenfolge:** R0 (Beschaffung) / R6 (Einspielen)
- **Risiko:** K-02 umgeht RLS vollständig. ADR-001 Abschnitt 7 hält fest, dass Praxisfilter und
  Rollenprüfung im Worker deshalb **primäre** Kontrollen sind, nicht RLS. Bei Kompromittierung
  ist Rotation zwingend – ein Rotationsrunbook existiert nicht. **Gap G-17.**

#### E-04 K-04 `BACKOFFICE_INVITE_HMAC_SECRET`

- **Beleg:** `workers/hono/src/index.ts:47-54` samt Deploymentkommentar
  (`wrangler secret put`, `openssl rand -base64 48`, fail-closed unterhalb
  `BACKOFFICE_INVITE_MIN_SECRET_BYTES`), Ableitung in `deriveInviteCode`
  (`workers/hono/src/index.ts:3870`).
- **Datenklasse:** D3 · **Plattform:** `CF-SEC` · **Technischer Owner:** `owner_required`
- **Abhängiger Bestand:** A-11 `practice_invitations`
- **Besonderheit:** Dies ist der **einzige** Schlüssel im Produkt, dessen Rotationsverhalten im Code
  ausdrücklich beschrieben ist („rotation invalidates outstanding un-redeemed codes by design").
- **Wiederherstellungsreihenfolge:** R0/R6
- **Nachweisstatus:** Verhalten `configured`; Verwahrung `unknown`
- **Risiko:** P3 – Verlust invalidiert offene Einladungen, zerstört aber keine Bestandsdaten.

#### E-05 K-05 `ANTHROPIC_API_KEY`

- **Beleg:** `workers/hono/src/index.ts:30-31`, `.env.example`
- **Datenklasse:** D3 · **Plattform:** `CF-SEC` · **Technischer Owner:** `owner_required`
- **Recoverybezug:** keiner für Bestandsdaten – Berichte sind nach ihrer Erzeugung als
  verschlüsselter Snapshot persistiert (A-03) und werden zum Export **nicht** neu generiert.
- **Wiederherstellungsreihenfolge:** R7
- **Nachweisstatus:** `configured` / Verwahrung `unknown`
- **Risiko:** P4 für Recovery; Kosten- und Missbrauchsrisiko bei Kompromittierung bleibt davon
  unberührt.

#### E-06 K-06 Provider-Secrets

- **Beleg:** `workers/hono/src/index.ts:38-43`:
  `SECURITYTRAILS_API_KEY`, `SHODAN_API_KEY`, `HIBP_API_KEY`, `MXTOOLBOX_API_KEY`,
  `VIRUSTOTAL_API_KEY`, `RESEND_API_KEY`.
- **Fail-closed-Verhalten belegt:** `workers/hono/src/index.ts:5353-5366` bildet ein fehlendes Key
  auf `not_configured` ab – **nicht** auf „kein Risiko" (`docs/SCORING.md`,
  `docs/ARCHITECTURE.md`).
- **Datenklasse:** D3 · **Plattform:** `CF-SEC` · **Technischer Owner:** `owner_required`
- **Wiederherstellungsreihenfolge:** R7
- **Nachweisstatus:** Verhalten `configured`; Verwahrung, Rotationsfristen und
  Providerkontenowner `unknown`
- **Risiko:** P3 – Verlust senkt sichtbar die Coverage statt falsche Entwarnung zu erzeugen; das ist
  das gewünschte Verhalten. Offen bleibt, **wer** die Providerkonten besitzt und in welcher Frist
  ein kompromittierter Key gesperrt werden kann. **Gap G-18.**

### 5.F Report- und Manifestverschlüsselung als eigener Recoverypfad

#### F-01 Kanonischer Berichtsartefaktpfad

- **Beleg:** `supabase/migrations/20260811130000_sp2_04_assessment_manifest.sql`
  (`persist_assessment_report`, ein Transaktionsschritt für Manifest und Report),
  `workers/hono/src/index.ts:2269-2270` (`encryptJson` für Snapshot und Report),
  `docs/SP2_04_ASSESSMENT_MANIFEST_RUNBOOK.md`, `docs/ARCHITECTURE.md`.
- **Integritätskette:** `snapshot_sha256` bindet an `manifest`, dieses an `manifest_sha256` und
  weiter an `reports.report_manifest_sha256`; `POST /api/report/pdf` akzeptiert nur `practiceId`
  und eine persistierte `reportId`, prüft beide Hashes und rendert byte-identisch mit dem
  ursprünglichen Zeitstempel.
- **Datenklasse:** D2 (Snapshot), D1 (Manifest) · **Plattform:** `SB-DB` + `CF-SEC`
- **Schlüsselabhängigkeit:** K-01 – ausschließlich.
- **Wiederherstellungsreihenfolge:** R5b
- **Nachweisstatus:** Erzeugung und Integritätsprüfung `configured`; ein
  **Restore-Roundtrip** (Backup, Restore, PDF byte-identisch) ist `unknown`.
- **Risiko:** Das Produkt verspricht reproduzierbare, revisionsfeste Berichte. Dieses Versprechen
  hängt an einem einzigen, nicht rotierbaren, nicht versionierten Schlüssel (E-02). Der
  Phase-B-Prüfpunkt P-04 ist deshalb der eigentliche Wertnachweis des ganzen Drills.

### 5.G Lokale Schlüssel und Persistenz auf dem Endgerät

#### M-01 Auth-Session im SecureStore

- **Beleg:** `lib/store/secureAuthStorage.ts`, operativer Probe
  `lib/security/secureStoreAvailability.ts`.
- **Datenklasse:** D3 · **Plattform:** `MOB` · **Technischer Owner:** `owner_required`
- **Backupautorität:** **keine – und das ist die Entscheidung, nicht die Lücke.** Der Store wird mit
  `keychainAccessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY` betrieben; Android schließt jede Sicherung
  über `allowBackup="false"`, `full-backup-content` und `data-extraction-rules` aus
  (`plugins/with-secure-android-backup.js:13-39`, `app.json:28`).
- **Wiederherstellung:** durch **erneute Anmeldung**, nicht durch Restore.
- **Nachweisstatus:** `configured`; Verhalten bei fehlendem Keychain in früheren Stufen `measured`
  (`docs/AKTUELLER_STAND.md`, Abschnitt „Erhaltene Verträge")
- **Risiko:** keines im Recoverysinn. **Dieser Bestand darf in keinem Runbook als
  wiederherstellbares Cloudbackup dargestellt werden.**

#### M-02 Lokaler Inventar-DEK im SecureStore

- **Beleg:** `lib/inventory/nativeInventoryPersistence.ts:20-53` – Namensraum
  `praxisshield-inventory-key-v1`, Schlüssel je Praxis (`keyName(practiceId)`), 32 Byte aus
  `getRandomBytesAsync`, Envelope `{ version: 1, alg: "A256GCM", keyB64u }`,
  `keychainService: KEY_NAMESPACE`, `WHEN_UNLOCKED_THIS_DEVICE_ONLY`.
- **Datenklasse:** D3 · **Plattform:** `MOB`
- **Backupautorität:** **keine, vertraglich gewollt** – ADR-001 Abschnitt 6.4: „Der lokale DEK wird
  nie synchronisiert … Schlüsselverlust bedeutet nicht wiederherstellbaren lokalen Datenverlust und
  wird als solcher angezeigt."
- **Wiederherstellungsreihenfolge:** entfällt
- **Nachweisstatus:** `configured`; iOS-Verhalten in SP2-01A `measured`
- **Risiko:** Gerätewechsel oder Keychainverlust ist endgültiger lokaler Datenverlust. Das ist eine
  **Produktentscheidung**, keine Recoverylücke – sie muss aber in der Recovery-UX und im
  Incident-Tabletop (Phase D) ausdrücklich als solche auftreten.

#### M-03 Verschlüsselte SQLite-Inventarpersistenz

- **Beleg:** `lib/inventory/nativeInventoryPersistence.ts:56-139` – Datenbank
  `praxisshield-inventory-v1.db`, Tabelle `local_inventory_snapshots (practice_id, revision,
  envelope, updated_at)`, `PRAGMA journal_mode = WAL`, Compare-and-Swap über
  `withExclusiveTransactionAsync`.
- **Envelope:** `lib/inventory/localInventoryCrypto.ts` – AES-256-GCM mit **echter AAD** über
  `practiceId` und Envelope-Metadaten, Feldern `keyVersion`, `payloadVersion`, `aadVersion`,
  `revision`, `createdAt`.
- **Bemerkenswert:** Der **lokale** Kryptovertrag ist damit deutlich strenger als der
  **Cloud**-Vertrag aus E-02 – lokal existieren AAD und Versionsfelder, im Worker nicht.
- **Datenklasse:** D2 (verschlüsselt) · **Plattform:** `MOB`
- **Backupautorität:** Android: durch `allowBackup="false"` und die Ausschlussregeln bewusst keine.
  iOS: `WHEN_UNLOCKED_THIS_DEVICE_ONLY` verhindert die Migration des DEK, belegt aber keinen
  Backupausschluss der SQLite-Datei selbst. Der Backupstatus des verschlüsselten SQLite-Ciphertexts
  ist deshalb `unknown`; ein auf ein anderes Gerät restaurierter Ciphertext bleibt ohne den lokalen
  DEK unlesbar.
- **Nachweisstatus:** `configured`; SQLite extern klartextfrei geprüft in SP2-01A `measured`
- **Risiko:** ohne funktionsfähigen SecureStore entsteht kein Snapshot; das Repository meldet
  `volatile` und blockiert die Synchronisierung. Fail-closed und korrekt.

#### M-04 Fragebogenentwurf und flüchtige lokale Caches

- **Beleg:** `lib/store/questionnaireDraftStorage.ts` – Namensraum
  `praxisshield-questionnaire-draft`, `MANIFEST_VERSION = 1`, gechunkte Ablage
  (`CHUNK_LENGTH = 500`) und `RETENTION_MS = 14 * 24 * 60 * 60 * 1000` (14 Tage);
  `lib/store/localData.ts` (`clearLocalTenantCaches`) leert Report-, Inventar- und WLAN-Caches im
  Arbeitsspeicher und entfernt zusätzlich den PDF-Cache aus M-05.
- **Wichtige Korrektur am dokumentierten Stand:** `CLAUDE.md` beschreibt MMKV
  (`lib/store/storage.ts`) als Speicher für nicht sensible Caches. **Diese Datei existiert nicht,
  und MMKV ist keine Abhängigkeit des Projekts** (kein Treffer für `react-native-mmkv` in
  `package.json` oder im Quellcode). Der Fragebogenentwurf liegt tatsächlich in **SecureStore** –
  also strenger als dokumentiert, nicht schwächer. Siehe **Gap G-24**.
- **Datenklasse:** D2 – ein Fragebogenentwurf enthält Selbstauskünfte einer konkreten Praxis zu
  ihrer Sicherheitslage, nicht bloß Betriebsmetadata.
- **Plattform:** `MOB` · **Backupautorität:** keine (dieselben Gerätegrenzen wie M-01)
- **Wiederherstellungsreihenfolge:** entfällt
- **Retention/Löschung:** 14 Tage, lokal im Modul durchgesetzt.
- **Nachweisstatus:** `configured`
- **Risiko:** gering im Recoverysinn; Verlust bedeutet Neuerfassung eines Entwurfs.

#### M-05 Klartext-PDF-Cache

- **Beleg:** `lib/ai/report-pdf.ts` – Ablage ausschließlich unter `Paths.cache`, Löschung in einem
  `finally` nach Dialogende, zusätzlich bei Logout, Praxiswechsel und lokaler Praxisentfernung
  (`docs/AKTUELLER_STAND.md`, Abschnitt „`expo-file-system` migriert").
- **Datenklasse:** D2 · **Plattform:** `MOB` · **Backupautorität:** bewusst keine
- **Nachweisstatus:** `configured`, iOS-Dialog und Cleanup in SP2-04 `measured`
- **Risiko:** keines im Recoverysinn. Der Bestand ist **absichtlich** flüchtig.

#### M-06 Offene Einladung im SecureStore

- **Beleg:** `lib/auth/pending-invitation.ts` – `WHEN_UNLOCKED_THIS_DEVICE_ONLY`, Löschung nach
  Einlösung.
- **Datenklasse:** D3 · **Plattform:** `MOB` · **Backupautorität:** keine
- **Nachweisstatus:** `configured` · **Risiko:** P4

### 5.H Release-Signing-Material

#### H-01 Android-Signing

- **Beleg:** `.github/workflows/release-android.yml` – `environment: production-android`,
  Secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`,
  `ANDROID_KEY_PASSWORD`, `ANDROID_SIGNING_CERT_SHA256`; Verifikation über
  `scripts/verify-android-release-signature.mjs`; Debug-Signing ist aus dem Release-Buildtyp
  entfernt (`docs/ARCHITECTURE.md`, „Native release contract (SP2-06)").
- **Datenklasse:** D3 · **Plattform:** `GH-ENV` · **Technischer Owner:** `owner_required`
- **Backupautorität / -stand:** `unknown`. Ein Upload-Key ist bei Google Play unter Umständen
  ersetzbar, ein verlorener **App-Signing-Key ohne Play App Signing ist es nicht**. Welcher Fall
  hier vorliegt, ist im Repository **nicht belegbar**.
- **Wiederherstellungsreihenfolge:** unabhängiger Pfad R8
- **Nachweisstatus:** Pipelinevertrag `configured`; echte signierte Releases stehen laut
  `docs/UMSETZUNGSPLAN_2026.md` Abschnitt 22 für SP3-01 noch aus, daher `unknown`
- **Risiko:** **P1.** Ein verlorener oder kompromittierter Signing-Key kann bedeuten, dass
  bestehende Installationen kein Update mehr erhalten können. Dieser Bestand hat die längste
  Wiederbeschaffungszeit von allen und ist gleichzeitig der am schlechtesten belegte.
  **Gap G-19.**

#### H-02 Apple-Signing

- **Beleg:** `.github/workflows/release-ios.yml` – `environment: production-ios`, Secrets
  `APPLE_CERTIFICATE_BASE64`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_PROVISIONING_PROFILE_BASE64`,
  `APPLE_PROVISIONING_PROFILE_NAME`, `APPLE_SIGNING_CERT_SHA256`, `APPLE_TEAM_ID`,
  `IOS_CI_KEYCHAIN_PASSWORD`; temporäre Runner-Keychain (`security create-keychain` bis
  `security delete-keychain` im Cleanup, Zeilen 65–70 und 141).
- **Datenklasse:** D3 · **Plattform:** `GH-ENV` · **Technischer Owner:** `owner_required`
- **Backupautorität / -stand:** `unknown`. Apple-Zertifikate sind widerrufbar und neu ausstellbar,
  sofern **Accountzugang und Zwei-Faktor-Wiederherstellung** verfügbar sind – genau diese
  Abhängigkeit ist nirgends dokumentiert.
- **Wiederherstellungsreihenfolge:** R8
- **Nachweisstatus:** Pipelinevertrag `configured`; Accountrecovery `unknown`
- **Risiko:** P2. **Gap G-19.**

#### H-03 Produktive App-Konfiguration in Release-Workflows

- **Beleg:** `PRODUCTION_API_BASE_URL`, `PRODUCTION_SUPABASE_URL`,
  `PRODUCTION_SUPABASE_ANON_KEY` als Environment-Secrets beider Release-Workflows.
- **Recoverybedeutung:** Die beim Build gesetzte URL ist in ausgelieferten Binaries gebunden.
  Ändert ein Restore die von ihnen verwendete URL und existiert kein stabiler eigener Hostname,
  Proxy-, Alias- oder Failoverpfad, ist ein Appstore-Release mit dessen Reviewdauer erforderlich.
  Ob ein solcher stabiler Umschaltpfad produktiv existiert, ist im Repository nicht belegbar.
- **Nachweisstatus:** `configured` (Verwendung) / `unknown` (Werte, Wechselpfad)
- **Risiko:** **P1 für RTO.** Dieser Punkt begrenzt jede realistische RTO-Zusage stärker als die
  Datenbankwiederherstellung selbst und muss in die RPO/RTO-Entscheidung D-01 einfließen.
  **Gap G-20.**

### 5.I GitHub Actions, SBOM und Attestationsartefakte

#### I-01 CI-Pipelines

- **Beleg:** `.github/workflows/ci.yml` (`quality` mit Gitleaks und `npm run verify`,
  `rls-pgtap` über `supabase db test --local`), `.github/workflows/security.yml`
  (Dependency-/SBOM-Gate, Dependency Review, CodeQL `security-extended` mit SARIF-Gate).
- **Datenklasse:** D0 · **Plattform:** `GH-CI` · **Backupautorität:** `GIT` für die Definition
- **Nachweisstatus:** `configured`; zuletzt grün gemeldet als CI `35102657829` und Secure SDLC
  `35102657678` (`docs/AKTUELLER_STAND.md`), für diese Läufe `measured`
- **Risiko:** gering.

#### I-02 SBOM- und Attestationsartefakte

- **Beleg:** `.github/workflows/security.yml:30-36` – Artefaktname `cyclonedx-sbom-<sha>`,
  `retention-days: 90`. `.github/workflows/release-android.yml:79-93` und
  `.github/workflows/release-ios.yml:123-127` – `actions/attest` gepinnt auf
  `1e69f48acb82d1966a394da916b4c1698aa569d6`, `permissions: attestations: write`,
  Releaseartefakte mit `retention-days: 365`; Hashmanifest über
  `scripts/create-release-manifest.mjs`, Prüfung über `scripts/verify-sbom.mjs`.
- **Datenklasse:** D0/D1 · **Plattform:** `GH-CI`
- **Wiederherstellungsreihenfolge:** R8
- **Retention:** 90 Tage (SBOM) beziehungsweise 365 Tage (Release) – **kürzer als jede plausible
  Nachweispflicht** für ein Produkt im Medizinumfeld.
- **Nachweisstatus:** `configured`
- **Risiko:** P3 – Nachweise für einen Vorfall, der älter als 90 beziehungsweise 365 Tage ist, sind
  nicht mehr abrufbar, während Auditdaten in der Datenbank sechs Jahre aufbewahrt werden. Diese
  Asymmetrie ist heute weder begründet noch entschieden. **Gap G-21.**

#### I-03 Versionierte Sicherheitsbaselines

- **Beleg:** `security/dependency-allowlist.json`, `security/github-action-inventory.json`,
  `security/mobile-upgrade-baseline.json`, `.gitleaks.toml`, durchgesetzt über
  `scripts/gate-dependencies.mjs`, `scripts/gate-sarif.mjs`, `scripts/gate-expo-doctor.mjs`.
- **Datenklasse:** D0 · **Backupautorität:** `GIT` · **Wiederherstellungsreihenfolge:** R8
- **Nachweisstatus:** `configured`, aktiv grün laut `docs/AKTUELLER_STAND.md`, daher `measured`
- **Risiko:** gering.

#### I-04 Git-Repository selbst

- **Beleg:** `git remote` verweist auf `github.com:kwhussam/praxis-ai`. Es existiert kein
  dokumentiertes Repository-Backup, kein Mirror und keine Offlinekopie.
- **Datenklasse:** D0/D1 · **Plattform:** `GIT` · **Backupautorität:** `unknown`
- **Wiederherstellungsreihenfolge:** **R1 – ohne das Repository ist kein Schema, kein Worker und
  keine Migration reproduzierbar.**
- **Nachweisstatus:** `unknown`
- **Risiko:** P2. Das Repository ist die Backupautorität für Schema, Worker, Gates und Runbooks –
  und hat selbst keine belegte Backupautorität. **Gap G-22.**

### 5.J Externe Provider

#### J-01 Sicherheits- und Zustellprovider

- **Beleg:** `workers/hono/src/index.ts:38-43` und `:5353-5366`; Providerliste in
  `CLAUDE.md` und `docs/ARCHITECTURE.md`: SecurityTrails, Shodan, HIBP, MXToolbox, VirusTotal,
  SSL Labs, Cloudflare DNS, Anthropic, Resend.
- **Datenabfluss belegt:** Domains und Subdomains an die Domainprovider; **E-Mail-Adressen
  ausschließlich an HIBP und nur nach eigenständiger, purposegebundener Einwilligung**
  (`consent_log`-Typ `hibp_email_leak_check`,
  `supabase/migrations/20260812150000_sp2_05_consent_registry.sql`; fail-closed vor Quota und
  Request laut `docs/ARCHITECTURE.md`, „Purpose-bound consent registry (SP2-05)").
- **Datenklasse:** D2 (ausgehende Werte), D3 (Provider-Keys, siehe E-06)
- **Plattform:** extern · **Technischer Owner:** `owner_required`
- **Backupautorität:** die Provider selbst; PraxisShield besitzt **keine** Kopie und keinen
  dokumentierten Löschanspruch gegen sie.
- **Retention/Löschung:** **`unknown`.** Es existiert im Repository **keine** Angabe zu
  Providerlöschfristen, Auftragsverarbeitungsverträgen oder Regionen der Provider. ADR-001
  Abschnitt 8 verweist auf „die dokumentierte Providerlöschfrist" – diese Dokumentation gibt es
  nicht.
- **Nachweisstatus:** Einwilligungs- und Fail-closed-Pfad `configured`; Providerverträge,
  Regionen und Löschfristen `unknown`
- **Risiko:** **P2.** Eine Praxislöschung kann heute nicht belegen, dass die an Provider
  übermittelten Werte dort entfernt wurden. Für ein DSGVO-Produkt im Medizinumfeld ist das eine
  Nachweislücke, nicht nur eine Dokumentationslücke. **Gap G-23.**

## 6. Wiederherstellungsreihenfolge

Die Stufen sind so geschnitten, dass eine übersprungene Stufe einen **erkennbaren** Fehler erzeugt
statt eines stillen Teilzustands.

| Stufe | Inhalt | Ohne diese Stufe |
|---|---|---|
| **R0** | Schlüssel und Secrets beschaffen: K-01 `DATA_ENCRYPTION_KEY`, K-02 Service Role, K-04 Invite-HMAC | Ein Datenrestore liefert dauerhaft unlesbare Chiffrate (K-01) oder einen Worker ohne Schreibrecht (K-02) |
| **R1** | Repository und Toolchain: Git-Stand, Supabase-CLI-Version, Migrationsliste | Kein reproduzierbares Schema |
| **R2** | Schema: Extension `pgcrypto`, Migrationen in exakter Reihenfolge, RLS, `force RLS`, Grants, 54 öffentliche Funktionen einschließlich RPCs und Triggerfunktionen | Daten ohne Mandantengrenze; Grants fehlen still |
| **R3** | `auth.users`, `auth.identities`, MFA-Faktoren und erforderliche GoTrue-Konfiguration; JWT-Signaturschlüssel separat behandeln | ohne Auth-Daten brechen FKs und Anmeldepfade; ein geänderter Signaturschlüssel invalidiert bestehende Sessions und erzwingt eine Neuanmeldung |
| **R4** | Mandantenkern A-01 und Backoffice-Autorisierung A-11 | Alle praxisgebundenen FKs verletzt |
| **R5a–e** | Praxisdaten in FK-Reihenfolge: a `security_checks`, b `assessment_manifests` und `reports`, c `monitoring_*` und `wlan_scans`, d Inventar/Router/Targets, e `consent_log` **in Ereignisreihenfolge** | Zusammengesetzte FK `reports_assessment_manifest_practice_fkey` bricht; `consent_log`-Kette bricht an `on delete restrict` |
| **R6** | Audit- und Löschzustandsdaten A-08/A-09, Realtime-Publikation, danach **erst** Worker-Deployment und Cron-Trigger | Cron arbeitet auf halbem Datenstand; Monitoring-Tab ohne Livepfad |
| **R7** | Quota-, Rate-Limit- und Idempotenzzustand A-10; K-05/K-06 Providerkeys | Coverage sinkt sichtbar (gewolltes Verhalten), keine Datenverluste |
| **R8** | Unabhängiger Pfad: Release-Signing H-01/H-02, CI-Evidenz I-02/I-03 | Kein neuer Release möglich – blockiert H-03-abhängige Szenarien |

**Der kritische Pfad für eine RTO-Aussage umfasst neben R2 bis R5 auch R0 und H-03.** Falls ein
Restore einen neuen, nicht über einen stabilen Endpoint umschaltbaren Supabase-Host erfordert,
benötigen bereits ausgelieferte Binaries einen Store-Release. Jede RTO-Schätzung muss diesen
bedingten, aber potenziell dominanten Pfad ausdrücklich bewerten.

## 7. Priorisierte Gap-Liste

Priorität: **P1** Datenverlust, Mandantenbruch oder Rechtsverstoß unmittelbar möglich ·
**P2** belegte Nachweis- oder Verfügbarkeitslücke mit erheblicher Wirkung ·
**P3** Betriebsrisiko mit begrenzter Wirkung · **P4** vorbeugend.

| ID | P | Risiko | Betroffener Bestandteil | Benötigter Owner | Empfohlener Folgeschritt | Überprüfbares Abnahmekriterium |
|---|---|---|---|---|---|---|
| **G-15** | P1 | Verlust von K-01 macht verschlüsselte Vollberichte, Snapshots und Checkpayloads aller Mandanten unlesbar und verhindert die kanonische PDF-Reproduktion; Datenbankzeilen und Klartextzusammenfassungen bleiben vorhanden, aber es existiert kein belegter Escrow- oder Wiederbeschaffungspfad | E-02 `DATA_ENCRYPTION_KEY` | Operations + Security | Verwahrung, Escrow und Zugriffsvierauge für K-01 entscheiden und dokumentieren (D-05) | Ein dokumentierter, mindestens einmal geprobter Beschaffungspfad existiert; der Drill weist nach, dass ein Restore **ohne** K-01 fail-closed abbricht statt leere Berichte zu liefern |
| **G-16** | P1 | K-01 ist global, ohne Keyversion und ohne AAD; eine Rotation ist technisch nicht durchführbar, eine Kompromittierung trifft alle Mandanten gleichzeitig | E-02, F-01 | Security + Technical Owner | Versioniertes Envelope nach ADR-001 Abschnitt 6.3 **planen**, nicht implementieren, bis D-05/D-06 entschieden sind | Ein Entwurf bindet Keyversion und AAD an bestehende Envelopes und benennt den Lesepfad für Altdaten; Rotation bleibt bis dahin ausdrücklich als Blocker geführt |
| **G-01** | P1 | `complete_privacy_deletion` erfasst sechs D2-Tabellen nicht; nach Praxislöschung bleiben MAC, SSID, Hostname, Firewallregeln und Monitoringziele erhalten | A-06 | Datenschutz + Technical Owner | Löschumfang erweitern (bereits ADR-001-Blocker vor M5) und Löschzustand prüfbar machen | pgTAP-Test weist nach, dass nach `complete_privacy_deletion` in allen sechs Tabellen **null Zeilen** der Praxis verbleiben |
| **G-19** | P1 | Release-Signing-Recovery ist vollständig unbelegt; ein verlorener App-Signing-Key kann Updates für bestehende Installationen dauerhaft verhindern | H-01, H-02 | Operations + Product | Klären und dokumentieren, ob Play App Signing aktiv ist und wie Apple-Accountrecovery abläuft (D-08) | Dokumentierter Wiederbeschaffungspfad je Plattform mit benanntem Kontoinhaber und Zweitzugang; ohne Nachweis bleibt SP3-02 `blocked_by_owner_decisions` |
| **G-20** | P1 | Wenn ein Restore einen neuen Supabase-Host benötigt und kein stabiler Proxy-/Alias-/Failoverpfad existiert, erfordert die eingebettete URL einen Store-Release | H-03, B-01 | Operations + Product | RTO-Entscheidung D-01 muss diesen Pfad explizit enthalten und das Vorhandensein eines stabilen Endpoints klären | Die RTO-Entscheidung benennt getrennte Werte für „Restore am bestehenden Endpoint" und „Endpointwechsel mit erforderlichem App-Release" |
| **G-02** | P1 | `wlan_scans.network_info` und `vulnerabilities` liegen im Klartext; ein Backupzugriff legt die vollständige Netztopologie offen | A-05 | Security + Datenschutz | SP2-02 beziehungsweise ADR-001 M1 bis M5 abwarten; bis dahin Backupzugriff wie Produktionsdatenzugriff behandeln | Backupzugriffsrechte sind dokumentiert und auf denselben Personenkreis begrenzt wie Produktionszugriff |
| **G-04** | P1 | Backupumfang des `auth`-Schemas sowie Wiederherstellung der GoTrue-Konfiguration sind unbelegt; ein geänderter JWT-Signaturschlüssel invalidiert bestehende Sessions, während fehlende Auth-Daten Identitäten und Anmeldepfade zerstören | B-01 | Operations | Beim Provider getrennt verifizieren, welche Auth-Daten im Backup liegen und wie Auth-Konfiguration beziehungsweise Signaturschlüssel nach einem Restore behandelt werden (D-02) | Schriftliche Providerauskunft liegt vor; der Drill prüft Neuanmeldung nach dem Restore und dokumentiert die erwartete Invalidierung alter Sessions |
| **G-03** | P2 | Ein Restore auf einen Zeitpunkt vor einer Löschung stellt gelöschte D2-Daten wieder her, während `deletion_requests` sie als `completed` führt | A-08, A-09 | Datenschutz + Operations | Post-Restore-Reconciliation definieren: offene `deletion_requests` nach jedem Restore erneut anwenden | Drill-Prüfpunkt P-06 schlägt fehl, wenn nach dem Restore eine als `completed` geführte Löschung nicht durchgesetzt ist |
| **G-06** | P2 | `consent_log` ist append-only, `truncate` und `delete` sind auch `service_role` entzogen; ein wiederholter Restore in eine nicht leere Tabelle ist mit normalen Rollen unmöglich | A-07 | Technical Owner + Operations | Restore-Runbook um den Eigentümer-/Superuserpfad ergänzen; die Schutzmechanismen **nicht** abschwächen | Der Drill dokumentiert einen reproduzierbaren Wiederholungslauf, ohne Trigger oder Grants zu verändern |
| **G-05** | P2 | `practices_create_default_avv` erzeugt beim Restore AVV-Datensätze mit `now()` und kollidiert anschließend mit den echten Zeilen | A-01 | Technical Owner | Restorereihenfolge und Triggerbehandlung festlegen | Drill-Prüfpunkt P-05 weist nach, dass `data_processing_agreements.accepted_at` nach dem Restore unverändert ist |
| **G-13** | P2 | Grants und RLS sind Clusterzustand; ein Datenrestore stellt sie nicht her, ein zu weiter Grant bliebe unentdeckt | D-02, D-03 | Security | Grant- und Policy-Snapshotvergleich als Pflichtprüfpunkt | Drill-Prüfpunkt P-03 vergleicht Policy- und Grant-Snapshot vor und nach dem Restore auf exakte Gleichheit |
| **G-22** | P2 | Das Git-Repository ist Backupautorität für Schema, Worker und Gates – und hat selbst keine belegte Sicherung | I-04 | Operations | Repository-Backup beziehungsweise Mirror entscheiden (D-02) | Ein zweiter, unabhängiger Repositorystand ist dokumentiert und mindestens einmal verifiziert |
| **G-23** | P2 | Providerlöschfristen, Regionen und AV-Verträge sind nirgends dokumentiert; Löschung gegenüber Providern ist nicht nachweisbar | J-01 | Datenschutz | Providerregister mit Region, Rechtsgrundlage und Löschfrist anlegen (D-04) | Für jeden der neun Provider liegen Region, AV-Status und Löschfrist dokumentiert vor |
| **G-17** | P2 | Für `SUPABASE_SERVICE_ROLE_KEY` existiert kein Rotationsrunbook, obwohl er RLS vollständig umgeht | E-03 | Security + Operations | Rotationsablauf für Worker-Secrets festlegen (D-07) | Ein Runbook beschreibt Rotation ohne Ausfall und wurde gegen die lokale Umgebung geprobt |
| **G-08** | P2 | Hash-Constraints erzwingen nur das Format, nicht die Übereinstimmung; ein Restore mit gemischten Ständen wird von der Datenbank akzeptiert | A-03, F-01 | Technical Owner | Hashabgleich als Drill-Pflichtprüfung | Drill-Prüfpunkt P-04 rechnet `snapshot_sha256` und `manifest_sha256` neu und bricht bei jeder Abweichung ab |
| **G-14** | P3 | Kein dokumentierter Schalter legt die sieben Cron-Trigger während eines Restores still | E-01 | Operations | Restore-Runbook um Cron-Stilllegung ergänzen | Runbookschritt existiert und ist im Drill als eigener Schritt protokolliert |
| **G-09** | P3 | Realtime-Publikationsmitgliedschaft ist Clusterzustand und wird durch einen Datenrestore nicht wiederhergestellt | A-04 | Technical Owner | In R6 als expliziten Schritt aufnehmen | Drill prüft nach dem Restore die Mitgliedschaft beider Tabellen in `supabase_realtime` |
| **G-11** | P3 | `guard_last_practice_owner` kann nach einem Teilrestore eine Praxis ohne Zugriff blockieren | A-11 | Technical Owner | Reihenfolge R4 verbindlich machen | Drill weist nach, dass beide Fixturepraxen nach dem Restore mindestens einen Owner besitzen |
| **G-21** | P3 | Artefaktretention (90/365 Tage) ist deutlich kürzer als die Datenaufbewahrung (sechs Jahre) | I-02 | Operations + Datenschutz | Nachweisaufbewahrung entscheiden (D-04) | Retentionwerte sind begründet dokumentiert oder angepasst |
| **G-18** | P3 | Providerkontoinhaber und Sperrfristen für kompromittierte Provider-Keys sind unbekannt | E-06 | Operations | In das Providerregister aus G-23 aufnehmen | Je Provider ist ein Kontoinhaber und eine Sperrfrist dokumentiert |
| **G-10** | P3 | Es ist nicht entschieden, ob Quota-, Rate-Limit- und Idempotenzzustand wiederhergestellt oder verworfen wird | A-10 | Operations | Entscheidung in R7 dokumentieren | Restore-Runbook benennt je Tabelle „wiederherstellen" oder „verwerfen" mit Begründung |
| **G-07** | P4 | `encrypted_payload = '{}'` ist mehrdeutig: nie verschlüsselt, anonymisiert oder beim Restore verloren | A-02, A-05 | Technical Owner | Statusfeld nach ADR-001 M1 planen | Ein Entwurf unterscheidet die drei Zustände maschinell |
| **G-12** | P4 | Drei ungenutzte URL-Spalten sind ein offener Pfad zu einem zweiten Datenbestand ohne Backup-, Export- oder Löschabdeckung | C-01 | Technical Owner | Vor jeder Storage-Nutzung Export-, Lösch- und Backupvertrag ergänzen | Ein Test schlägt fehl, sobald eine der drei Spalten erstmals beschrieben wird |
| **G-24** | P4 | `CLAUDE.md` benennt MMKV (`lib/store/storage.ts`) als lokalen Cachespeicher; weder Datei noch Abhängigkeit existieren. Die Abweichung ist sicherheitstechnisch harmlos (der tatsächliche Speicher ist SecureStore und damit strenger), aber eine Inventarprüfung, die sich auf diese Angabe verlässt, sucht am falschen Ort | M-04 | Technical Owner | `CLAUDE.md` an den tatsächlichen Speicherpfad angleichen | `CLAUDE.md` nennt keinen Pfad, der nicht existiert; der Fragebogenentwurf ist als SecureStore-Bestand mit 14-Tage-Retention beschrieben |

## 8. Entwurf des Phase-B-Restore-Drills

Dieser Abschnitt entstand in Phase A als Entwurf. Der daraus abgeleitete Drill ist inzwischen in
`scripts/recovery/restore-drill.sh` implementiert und in
`docs/SP3_02_PHASE_B_RUNBOOK.md` dokumentiert. Der Referenzlauf vom 16. September 2026 bestand
P-01 bis P-05 sowie P-07 und P-08; P-06 bestätigte den Blocker G-01. Die folgenden Abschnitte
bleiben als fachlicher Vertrag des Drills erhalten.

### 8.1 Geltungsbereich und Grenzen

- **Ausschließlich synthetische Daten.** Grundlage ist die bereits vorhandene
  Zwei-Mandanten-Fixture aus `supabase/seed.sql`: Praxis A `20000000-0000-4000-8000-0000000000a1`
  und Praxis B `20000000-0000-4000-8000-0000000000b1` mit `*.example.test`-Domains und
  `@example.test`-Adressen. Sie wird um Canary-Datensätze je geprüfter Entität erweitert.
- **Isolierte Umgebung.** Der Drill läuft gegen den lokalen Stack aus
  `scripts/e2e/env-up.sh` (Supabase auf `127.0.0.1:54321`, Worker auf `127.0.0.1:8787`) oder gegen
  eine ausdrücklich freigegebene Stagingumgebung. **Keine produktive Datenbank, kein produktives
  Cloudflare-Konto, kein produktives Supabase-Projekt.**
- **Keine produktiven Secrets.** Der Drill verwendet die bereits vorhandene Testkonstante aus
  `scripts/e2e/env-up.sh` (dort ausdrücklich als „Test-only AES-256 material" kommentiert). Ein
  produktiver Schlüssel wird weder gelesen noch erzeugt noch rotiert.
- **Keine produktive Automatisierung.** Phase B liefert ein reproduzierbares Skript **und**
  Prüfergebnisse, aber keine Anbindung an produktive Backupjobs und keinen CI-Job, der gegen eine
  produktive Umgebung läuft.
- **Keine Abschwächung.** Trigger, Grants, RLS-Policies, `force row level security` und
  fail-closed Pfade werden für den Drill **nicht** verändert. Wo sie den Restore erschweren
  (G-06), ist genau das der zu dokumentierende Befund.

### 8.2 Canary-Fixture

Je Mandant wird ein eindeutig unterscheidbarer Canary-Datensatz erzeugt – so gewählt, dass eine
Verwechslung zwischen A und B im Ergebnis sofort sichtbar wird:

| Entität | Canary-Eigenschaft |
|---|---|
| `security_checks` | je ein Check mit bekanntem `score` und einem verschlüsselten Payload bekannter kanonischer Form |
| `assessment_manifests` und `reports` | ein über `persist_assessment_report` erzeugtes Paar mit festgehaltenem `snapshot_sha256` und `manifest_sha256` |
| `wlan_scans` | ein Scan mit synthetischer, eindeutig mandantenspezifischer Topologie |
| Inventar/Router/Targets | je eine Zeile pro der sechs Tabellen aus A-06 |
| `consent_log` | eine Kette aus mindestens drei Ereignissen inklusive einem Widerruf, damit `supersedes_id` geprüft werden kann |
| `monitoring_snapshots` und `monitoring_events` | je ein Ereignis mit verschlüsseltem und unverschlüsseltem Anteil |
| Löschzustand | Praxis B erhält einen abgeschlossenen `complete_privacy_deletion`-Lauf **vor** dem Backup, damit der Restore den Löschzustand erhalten muss |

Der letzte Punkt ist der wichtigste: Er macht G-03 messbar, statt es nur zu beschreiben.

### 8.3 Ablauf

1. **Vorzustand festhalten.** Zeilenzahlen je Tabelle und Mandant, Policy- und Grant-Snapshot,
   Liste der `supabase_migrations.schema_migrations`, Hashes der Canary-Artefakte,
   Realtime-Publikationsmitgliedschaft. Zeitstempel `t_baseline`.
2. **Backup erzeugen.** Zeitstempel `t_backup`. Das Verfahren hängt von Entscheidung D-02 ab und
   bleibt bis dahin offen; für den lokalen Drill ist ein vollständiger logischer Dump ausreichend.
3. **Zielumgebung leeren.** Frische, leere Instanz. Kein Restore über einen bestehenden Datenstand,
   solange G-06 nicht geklärt ist.
4. **In Stufenreihenfolge R1 bis R7 wiederherstellen**, mit stillgelegten Cron-Triggern (G-14).
   Zeitstempel `t_restore_start` und `t_restore_end`.
5. **Prüfpunkte P-01 bis P-08 ausführen.** Jeder Fehler ist ein harter Abbruch.
6. **Protokoll schreiben.** Nur Metadaten, Counts, Hashes, Ergebnisse und Zeitstempel.

### 8.4 Prüfpunkte

| ID | Prüfung | Fail-closed-Bedingung |
|---|---|---|
| **P-01** | Schema und Migrationen: angewandte Migrationsliste gegen `supabase/migrations/` – nutzt den bereits vorhandenen Vergleich aus `scripts/e2e/env-up.sh` | jede Abweichung |
| **P-02** | RLS und Mandantentrennung: die 13 pgTAP-Suiten (242 Assertions) laufen gegen den **wiederhergestellten** Stand | ein einziger fehlgeschlagener Test |
| **P-03** | Grants und Policies: Snapshot vor und nach dem Restore, inklusive `force row level security` auf allen 34 Tabellen | jede Abweichung, insbesondere ein zusätzliches Recht |
| **P-04** | Reports und Manifeste: `snapshot_sha256` und `manifest_sha256` werden aus dem entschlüsselten Artefakt **neu berechnet** und verglichen; anschließend ein PDF-Export, der byte-identisch zum Vorzustand ist | Hashabweichung, Entschlüsselungsfehler oder abweichende Bytes |
| **P-05** | Consent und Audit: Ereigniszahl und `supersedes_id`-Kette je `(practice_id, type)` lückenlos; `data_processing_agreements.accepted_at` unverändert (deckt G-05 ab) | gebrochene Kette oder verschobener Zeitstempel |
| **P-06** | Löschzustand: Für Praxis B, die vor dem Backup gelöscht wurde, gilt nach dem Restore derselbe Löschzustand; als `completed` geführte `deletion_requests` sind durchgesetzt | jede wiederauferstandene D2-Zeile |
| **P-07** | Cross-Tenant-Gegenprobe: A-Viewer, B-Manager und ein Außenstehender greifen nach dem Restore auf fremde Canary-Zeilen zu | **ein** erfolgreicher Fremdzugriff |
| **P-08** | Schlüsselabhängigkeit: ein zweiter Restorelauf **ohne** K-01 muss beim Berichtsexport fail-closed abbrechen und darf keinen leeren Bericht liefern (deckt G-15 ab) | stiller Erfolg oder leerer Bericht |

### 8.5 Artefakte

Das Drillprotokoll enthält **ausschließlich**: Commit-SHA, Migrationsversion, Umgebungskennung,
Tool- und Supabase-CLI-Version, `t_baseline`, `t_backup`, `t_restore_start`, `t_restore_end`,
Zeilenzahlen je Tabelle und Mandant, Hashwerte der Canary-Artefakte, Policy- und Grant-Snapshot als
strukturierten Vergleich sowie je Prüfpunkt `pass`/`fail` mit Fehlerklasse.

Es enthält **nicht**: Payloads, Klartexte, Ciphertexte, Schlüsselmaterial, Tokens,
Praxisidentifikatoren außerhalb der festen Fixture-UUIDs, E-Mail-Adressen außerhalb
`*.example.test`, Requestbodies oder Providerantworten.

### 8.6 Was Phase B ausdrücklich **nicht** liefert

- **Keine gültigen RPO-/RTO-Werte.** Die gemessenen Zeitspannen gelten nur für die lokale
  beziehungsweise Stagingumgebung. Sie sind ein Anhaltspunkt für D-01, kein Produktclaim.
- **Keinen Nachweis für die Produktion.** Ein lokaler Restore beweist Schema-, RLS-,
  Integritäts- und Löschverhalten. Er beweist **nicht**, dass ein produktives Backup existiert,
  vollständig ist oder in einer zugesagten Zeit verfügbar wäre. Das bleibt an D-02 gebunden.
- **Keine Schlüsselrotation.** Rotation ist Phase C und bleibt bis D-05/D-06 gesperrt.

## 9. Zusammenfassung des Iststandes

- **Verschlüsselung und Mandantentrennung im laufenden Betrieb sind belastbar gebaut:** 34 Tabellen
  mit erzwungener RLS, 242 pgTAP-Assertions, append-only Consent-Registry, transaktionale
  Berichtserzeugung, fail-closed Providerstatus, vollständiger Ausschluss mobiler Daten aus
  Gerätebackups.
- **Recovery bleibt produktiv unbelegt.** Phase B liefert inzwischen einen lokalen synthetischen
  `measured`-Nachweis mit 7/8 Prüfpunkten. Ein produktives Backup, dessen Providerkonfiguration
  und ein produktionsrepräsentativer Restore bleiben weiterhin `unknown`.
- **Der Einzelpunkt mit dem größten Schadenspotenzial ist K-01.** Ein globaler, versionsloser,
  AAD-freier Schlüssel entscheidet über die Lesbarkeit aller verschlüsselten Vollberichte und
  Snapshots aller Mandanten und ist heute weder rotierbar noch nachweislich verwahrt.
- **Die längste Wiederherstellungszeit kann außerhalb der Datenbank liegen**, insbesondere in
  H-03 und H-01/H-02: Benötigt ein Projektwechsel ohne stabilen Endpoint einen Store-Release, wird
  dessen Reviewdauer Teil des RTO; parallel ist der Signing-Recoverypfad unbelegt.
- **Sechs D2-Tabellen sind vom Löschpfad nicht erfasst.** Dies ist bereits als ADR-001-Blocker
  geführt und wird durch die Restorebetrachtung bestätigt, nicht neu entdeckt.

SP3-02 bleibt damit auf `audit_completed` mit offenen Owner-Entscheidungen. Eine Freigabe als
`released` ist ausgeschlossen, solange kein gemessener Restore und keine benannten Owner existieren.
