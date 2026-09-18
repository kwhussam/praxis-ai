# SP3-02 Decision Log – Recovery, Schlüsselverwaltung und Incident-Rollen

- **Ticket:** SP3-02
- **Phase:** A – Istaufnahme und Entscheidungsregister
- **Stand:** 2026-09-17
- **Branch:** Basis über PR #59 gemergt; G-01-Folgebranch `codex/sp3-02-g01-deletion`
- **Status:** Phase A `audit_completed`, lokaler Phase-B-Drill `technical_complete_8_of_8`,
  Produktionsübertragbarkeit und Release `blocked_by_owner_decisions` – **alle** Entscheidungen
  offen
- **Grundlage:** `docs/SP3_02_RECOVERY_INVENTORY.md`, `docs/SP3_02_RECOVERY_TABLETOP_PLAN.md`,
  `docs/adr/ADR-001_INVENTORY_WLAN_DATA_PROTECTION.md` (Abschnitt 13),
  `docs/adr/ADR-001_VERIFICATION_PLAN.md` (Abschnitt 2)

## 1. Regeln dieses Registers

1. **Es wird nichts erfunden.** Weder ein Zielwert, noch ein Provider, noch eine Region, noch eine
   Frist, noch eine Person. Wo das Repository keinen Beleg liefert, steht `unknown`
   beziehungsweise `owner_required`.
2. **Eine technische Empfehlung ist keine Entscheidung.** Wo unten eine Option als „technisch
   naheliegend" markiert ist, ist das eine Entscheidungsvorlage – die Entscheidung trifft der
   benannte Owner.
3. **Kein Eintrag gilt als entschieden, solange die Freigabezeile leer ist.** Die Freigabezeile
   verlangt Name, Rolle, Datum und die Artefaktversion, auf die sich die Entscheidung bezieht.
4. **`blocking_for_phase_b`** markiert Entscheidungen, ohne die der Restore-Drill aus
   `docs/SP3_02_RECOVERY_INVENTORY.md` Abschnitt 8 nicht sinnvoll oder nicht sicher startbar ist.
5. RPO und RTO gelten **niemals** als erfüllt oder verbindlich, solange kein gemessener Restore
   und keine Owner-Freigabe existieren. Das gilt auch dann, wenn Phase B erfolgreich verläuft.

### Statuswerte

| Status | Bedeutung |
|---|---|
| `open` | Entscheidung steht aus; kein Owner benannt |
| `owner_required` | Fachlich klar umrissen, aber es existiert keine benannte zuständige Person |
| `decided` | Entscheidung getroffen, Freigabezeile vollständig ausgefüllt |
| `superseded` | Durch eine spätere Entscheidung ersetzt, mit Verweis |

### Übersicht

| ID | Thema | Status | Benötigter Owner | Blockt Phase B |
|---|---|---|---|---|
| D-01 | Verbindliche RPO-/RTO-Ziele | `open` / `owner_required` | Operations + Product | nein (aber blockt jede Aussage nach außen) |
| D-02 | Backup- und Restoreprovider, Verfahren, Prüfzyklus | `open` / `owner_required` | Operations | nein für lokalen Drill; ja für Produktionsübertragbarkeit |
| D-03 | Region und Datenresidenz | `open` / `owner_required` | Datenschutz + Operations | nein |
| D-04 | Retention, Providerlöschfristen, Nachweisaufbewahrung | `open` / `owner_required` | Datenschutz | nein |
| D-05 | KEK-/KMS-Provider und Verwahrung von K-01 | `open` / `owner_required` | Operations + Security | nein für lokalen Drill; ja für Produktionsübertragbarkeit und Phase C |
| D-06 | DEK-/IIK-Rotationsmodell | `open` / `owner_required` | Security + Technical Owner | nein (blockt Phase C) |
| D-07 | Rotation der Worker- und Provider-Secrets | `open` / `owner_required` | Security + Operations | nein (blockt Phase C) |
| D-08 | Release-Signing-Recovery | `open` / `owner_required` | Operations + Product | nein (blockt Phase D, Szenario 4) |
| D-09 | Incident Commander und Stellvertretung | `open` / `owner_required` | Geschäftsführung | nein (blockt Phase D) |
| D-10 | Datenschutz-, NIS2- und Kundenkommunikationsrollen | `open` / `owner_required` | Datenschutz + Geschäftsführung | nein (blockt Phase D) |

**Es gibt derzeit null `decided`-Einträge.**

---

## D-01 Verbindliche RPO- und RTO-Ziele

- **Status:** `open` / `owner_required` · **Benötigter Owner:** Operations (Zielwert) und Product
  (Zusagefähigkeit gegenüber Praxen und Partnern)
- **Blockt Phase B:** nein. Phase B misst Zeitspannen in einer lokalen Umgebung; diese Messwerte
  sind Eingangsdaten für diese Entscheidung, nicht ihr Ersatz.

**Belegter Iststand.** Es existiert **kein** RPO- oder RTO-Wert im Repository.
`docs/adr/ADR-001_INVENTORY_WLAN_DATA_PROTECTION.md` Abschnitt 11 hält fest: „RPO/RTO sind keine
stillschweigenden Produktclaims. Operations dokumentiert die verbindlichen Werte vor M1; bis dahin
gibt es keine Produktionsfreigabe." `docs/UMSETZUNGSPLAN_2026.md` führt unter P3-06 „Grün nur bei
frischem erfolgreichen Restorebeleg". Beides ist eine Anforderung, kein Wert.

**Was entschieden werden muss.**

1. Getrennte RPO-Werte je Datenklasse – insbesondere: Gilt für `consent_log` und
   `deletion_requests` (sechs Jahre Aufbewahrung, rechtlich relevant) derselbe RPO wie für
   `monitoring_events`?
2. **Zwei getrennte RTO-Szenarien**, nicht eines. Die Istaufnahme (`G-20`, Bestandteil H-03)
   belegt: Ein Restore am bestehenden Endpoint ist primär ein Datenvorgang. Erfordert der Restore
   einen neuen Host und existiert kein stabiler Proxy-/Alias-/Failoverpfad, benötigt die in
   ausgelieferten Binaries gebundene URL einen Store-Release mit Apple-/Google-Reviewdauer. Ein
   einzelner RTO-Wert verdeckt diesen bedingten Unterschied.
3. Ab welchem Ausfall gilt welcher Wert, und wer stellt das fest.

**Ausdrücklich nicht entschieden.** Dieses Dokument schlägt **keine Zahlenwerte vor**. Jeder Wert
ohne gemessenen Restore und Owner-Freigabe wäre eine erfundene Zusage.

**Abhängigkeiten:** D-02 (ohne bekanntes Backupverfahren ist kein RPO bestimmbar), D-05 (ohne
Schlüsselbeschaffungszeit ist kein RTO bestimmbar), G-20, G-04.

**Freigabe:** _Name, Rolle, Datum, Artefaktversion – offen._

---

## D-02 Backup- und Restoreprovider, Verfahren und Prüfzyklus

- **Status:** `open` / `owner_required` · **Benötigter Owner:** Operations
- **Blockt Phase B:** nein für den isolierten lokalen Drill. Dieser verwendet ausdrücklich einen
  als Testverfahren gekennzeichneten vollständigen logischen Dump. Die Entscheidung blockiert die
  Übertragung der Messwerte auf Produktion und jeden produktionsrepräsentativen Drill, nicht den
  technischen Nachweis von Schema-, RLS-, Integritäts- und Löschverhalten.

**Belegter Iststand.** Im Repository existiert **keinerlei** Backupkonfiguration: kein PITR-Setting,
kein Dumpjob, kein Snapshotplan, kein Aufbewahrungsort, kein Wiederherstellungsskript. Vorhanden ist
ausschließlich der lokale Entwicklungsaufbau `scripts/e2e/env-up.sh` (`supabase start`,
`supabase db reset`) – das ist ein Neuaufbau aus Migrationen, **kein Restore aus einem Backup**.
Der bereits implementierte Migrationsabgleich in ebendieser Datei ist der einzige verwertbare
Baustein.

**Was entschieden werden muss.**

1. Wer ist Backupautorität für `SB-DB` – der Supabase-Managed-Backuppfad, ein eigener Dumpjob, oder
   beides? Wird PITR genutzt, und mit welchem Fenster?
2. Welche Auth-Tabellen und providerseitigen GoTrue-Einstellungen umfasst beziehungsweise
   rekonstruiert das Verfahren? Der JWT-Signaturschlüssel ist getrennt von den Datenbankdaten zu
   behandeln: Sein Wechsel invalidiert bestehende Sessions, während fehlende Auth-Daten
   Identitäten, Fremdschlüssel und neue Anmeldepfade beeinträchtigen (`G-04`).
3. Sind Backups verschlüsselt, und **mit welchem Schlüssel** – insbesondere, ob dieser Schlüssel
   von denselben Personen verwahrt wird wie K-01 (siehe D-05).
4. Wer darf ein Backup lesen? Solange `wlan_scans` und die sechs Inventartabellen D2 im Klartext
   führen (`G-02`), ist Backupzugriff gleichwertig zu Produktionsdatenzugriff.
5. Backupautorität für das **Git-Repository** selbst (`G-22`): Es ist Backupautorität für Schema,
   Worker, Gates und Runbooks, hat aber selbst keine belegte Sicherung.
6. Turnus, in dem ein Restore tatsächlich geprobt wird.

**Freigabe:** _Name, Rolle, Datum, Artefaktversion – offen._

---

## D-03 Region und Datenresidenz

- **Status:** `open` / `owner_required` · **Benötigter Owner:** Datenschutz (rechtliche Zusage) und
  Operations (technische Durchsetzung)
- **Blockt Phase B:** nein

**Belegter Iststand – und ein konkreter Widerspruch.** Das Produkt schreibt an **zwei** Stellen die
Zeichenkette `EU / Frankfurt` als `data_region` in den AVV-Datensatz jeder Praxis:

- `supabase/migrations/20260624150000_initial_schema.sql`, Funktion `create_default_avv`
  (automatisch beim Anlegen jeder Praxis über den Trigger `practices_create_default_avv`);
- `workers/hono/src/index.ts:2966`, beim Annehmen des AVV.

Dieser Wert ist **fest einkodiert**. Im Repository existiert **kein** Beleg, der ihn stützt: keine
Supabase-Projektregionskonfiguration, keine Cloudflare-Jurisdiktionsbeschränkung, keine Angabe zur
Region der neun externen Provider aus `docs/SP3_02_RECOVERY_INVENTORY.md`, Abschnitt J-01.

Das ist eine **vertragliche Zusage gegenüber jeder Praxis ohne technischen Nachweis**. Für ein
Produkt im Medizinumfeld ist das nicht nur ein Dokumentationsmangel.

**Was entschieden werden muss.**

1. Ist `EU / Frankfurt` für den Supabase-Datenbestand faktisch zutreffend, und woran wird das
   belegt?
2. Cloudflare Workers laufen standardmäßig am Edge. Gilt die Zusage auch für die
   Workerausführung, und wird sie über eine Jurisdiktionsbeschränkung erzwungen oder nicht?
3. Gilt die Zusage auch für das **Backup**, und für einen **Restore in eine andere Region**?
4. Gilt sie für die externen Provider, an die Domains und – nach Einwilligung – E-Mail-Adressen
   gehen (J-01)?
5. Falls die Zusage nicht in vollem Umfang haltbar ist: Wird die Infrastruktur angepasst, oder wird
   der AVV-Text korrigiert? Eine der beiden Seiten muss sich bewegen.

**Hinweis zur Bearbeitung:** Eine Änderung des Wertes `data_region` ist eine
**rechtliche und Datenmigrationsfrage** (Bestands-AVVs tragen den alten Wert), keine reine
Codeänderung. Sie wird hier bewusst **nicht** vorgenommen.

**Freigabe:** _Name, Rolle, Datum, Artefaktversion – offen._

---

## D-04 Retention, Providerlöschfristen und Nachweisaufbewahrung

- **Status:** `open` / `owner_required` · **Benötigter Owner:** Datenschutz
- **Blockt Phase B:** nein

**Belegter Iststand.** Implementiert und damit `configured`:

| Bestand | Frist | Beleg |
|---|---|---|
| `email_outbox` | 30 Tage (Default) | `20260722093000_email_outbox_retention.sql` |
| `backoffice_audit_events` | 183 Tage, max. 3650, Untergrenze erzwungen | `20260727113000_backoffice_audit_retention.sql` |
| `password_reset_audit_events` | 183 Tage, gleiche Erzwingung | `20260729220000_admin_password_reset_backend.sql` |
| `password_reset_rate_limit` | 24 Stunden | ebenda |
| `consent_log`, `practice_access_audit`, `deletion_requests`, `data_processing_agreements` | 6 Jahre `retained_for_legal` | `20260811130000_sp2_04_assessment_manifest.sql` |
| `monitoring_*` | 1 Jahr `monitoring_retention_until` | ebenda |

Nur `documented`, **nicht implementiert**: ADR-001 Abschnitt 8 sieht für rohe WLAN-Scans 90 Tage
(konfigurierbar 30/90/180) und für WLAN-Aggregate 12 Monate vor. Es existiert **kein Cron und keine
RPC**, die das durchsetzt.

`unknown`: sämtliche Providerlöschfristen (`G-23`). ADR-001 Abschnitt 8 verweist auf „die
dokumentierte Providerlöschfrist" – diese Dokumentation existiert nicht.

**Was entschieden werden muss.**

1. Providerregister mit Region, Rechtsgrundlage, AV-Vertragsstatus, Löschfrist und Kontoinhaber für
   alle neun Provider (deckt zugleich `G-18`).
2. WLAN-Retention: Wird die dokumentierte 90-Tage-Regel implementiert, oder wird die Dokumentation
   an das tatsächliche Verhalten angepasst? Der heutige Zustand – dokumentiert, aber nicht
   durchgesetzt – ist der schlechteste von beiden.
3. **Nachweisaufbewahrung (`G-21`):** CI-Artefakte laufen nach 90 Tagen (SBOM) beziehungsweise
   365 Tagen (Release) ab, während Auditdaten sechs Jahre aufbewahrt werden. Ist diese Asymmetrie
   gewollt?
4. Verhältnis von Backupaufbewahrung zu Löschfrist: Wie lange darf eine gelöschte Praxis in einem
   Backup fortbestehen, und wie wird das gegenüber der betroffenen Praxis dargestellt?

**Freigabe:** _Name, Rolle, Datum, Artefaktversion – offen._

---

## D-05 KEK-/KMS-Provider und Verwahrung von K-01

- **Status:** `open` / `owner_required` · **Benötigter Owner:** Operations (Betrieb, Verwahrung) und
  Security (Kryptovertrag)
- **Blockt Phase B:** nein für den lokalen Drill. P-08 verwendet ausschließlich Testmaterial und
  weist nach, dass ein fehlender Testschlüssel geschlossen scheitert. D-05 blockiert die
  Übertragung dieses Ergebnisses auf Produktion, einen produktiven Recoverynachweis und Phase C.

**Belegter Iststand.** `workers/hono/src/index.ts:2416-2451`: ein **einziger globaler**
AES-256-GCM-Schlüssel (`DATA_ENCRYPTION_KEY`) für alle Mandanten, **ohne Keyversion im Envelope**,
**ohne AAD**, ohne Wrapping und ohne KEK. Er entscheidet über die Lesbarkeit von
`security_checks.encrypted_payload`, `reports.encrypted_content`,
`assessment_manifests.encrypted_snapshot` und `monitoring_snapshots.encrypted_checks`.

Kein Escrow, kein Registry, keine Rotationsspur, kein Wiederbeschaffungspfad ist im Repository
belegt. ADR-001 Abschnitt 6.1 beschreibt den Zielzustand (praxisgebundene DEKs unter versioniertem
KEK) – dieser ist **nicht implementiert**, und ADR-001 Abschnitt 13 führt das Gate
„KEK/DEK/IIK, Rotation/Reindex, Backup, Restore, RPO/RTO" seit dem 2026-08-10 als `offen`.

**Was entschieden werden muss.**

1. **Verwahrung von K-01 heute** – bevor irgendein Zielzustand gebaut wird. Wo liegt der Schlüssel
   außer in der Cloudflare-Secret-Bindung? Wer kommt an ihn heran? Existiert eine Zweitkopie? Diese
   Frage ist dringender als der gesamte ADR-001-Zielzustand, weil ihr Verlust sämtliche
   verschlüsselten Vollberichte und Snapshots aller Mandanten unlesbar und kanonische PDFs nicht
   reproduzierbar macht (`G-15`).
2. Vierauge-/Zugriffsregel für die Beschaffung im Notfall.
3. KEK-/KMS-Provider für den Zielzustand: Cloudflare-eigene Mechanismen, ein externes KMS, oder
   eine andere Lösung – einschließlich der Frage, ob der KEK-Provider in derselben Ausfalldomäne
   liegt wie die zu schützenden Daten.
4. Wrap-Algorithmus und Envelopeformat für `wrapped_dek` (ADR-001 Abschnitt 6.1 verlangt
   ausdrücklich eine Trennung von Nutzdaten- und Wrap-Algorithmus).

**Sicherheitsgrenze dieser Phase.** Es wurde **kein** Schlüssel erzeugt, gelesen, angezeigt,
rotiert oder widerrufen, und es wurde **keine** KEK-/DEK-/IIK-Registry implementiert. ADR-001
Abschnitt 1 sperrt das bis zu den dort genannten Freigaben.

**Freigabe:** _Name, Rolle, Datum, Artefaktversion – offen._

---

## D-06 DEK- und IIK-Rotationsmodell

- **Status:** `open` / `owner_required` · **Benötigter Owner:** Security und Technical Owner
- **Blockt Phase B:** nein · **Blockt Phase C:** ja

**Belegter Iststand.** ADR-001 Abschnitt 6.1 und 6.2 spezifizieren ein vollständiges Modell:
praxisgebundene DEKs mit `(practice_id, key_version)`, genau eine `active`-Version,
`decrypt_only`-Übergang, Retirement erst nach vollständiger Re-encryption, sowie einen davon
**unabhängigen** rotationsstabilen Identity Index Key mit eigenem Reindex-, Dual-HMAC- und
transaktionalem Swap-Pfad. `docs/adr/ADR-001_VERIFICATION_PLAN.md` Abschnitt 4.1 definiert dafür
bereits 13 Testfälle (CR-01 bis CR-13).

**Nichts davon ist implementiert.** Der Code kennt genau einen globalen Schlüssel ohne Version.
Es existiert keine Schlüsselregistry-Tabelle in `supabase/migrations/`.

**Konsequenz für Phase C, ehrlich benannt.** Eine Rotation ist am heutigen Stand **technisch nicht
durchführbar**: Weil das Cloud-Envelope keine `key_version` trägt (`G-16`), kann kein Mischzustand
aus altem und neuem Schlüssel gelesen werden. Phase C kann deshalb **keinen** produktiven
Cloud-Rotationsdrill leisten. Was Phase C leisten kann:

- den **lokalen** Envelope-Pfad prüfen, der bereits `keyVersion`, `payloadVersion`, `aadVersion`
  und echte AAD führt (`lib/inventory/localInventoryCrypto.ts`);
- den K-04-Pfad prüfen, dessen Rotationsverhalten im Code dokumentiert ist;
- die nicht vorhandene Cloud-Rotierbarkeit als Blocker mit Owner und Folgeticket festhalten – genau
  so, wie es `docs/SP3_02_RECOVERY_TABLETOP_PLAN.md` Phase C Punkt 2 verlangt.

**Was entschieden werden muss.** Reihenfolge und Zeitpunkt: Wird zuerst das versionierte Envelope
nachgerüstet (Voraussetzung für jede Rotation) oder zuerst der KEK-Provider (D-05) festgelegt?
Beides ist an ADR-001 M1 gebunden, das bis zu den Sign-offs aus ADR-001 Abschnitt 13 gesperrt ist.

**Freigabe:** _Name, Rolle, Datum, Artefaktversion – offen._

---

## D-07 Rotation der Worker- und Provider-Secrets

- **Status:** `open` / `owner_required` · **Benötigter Owner:** Security und Operations
- **Blockt Phase B:** nein · **Blockt Phase C:** ja

**Belegter Iststand je Secret** (Details in `docs/SP3_02_RECOVERY_INVENTORY.md`, Abschnitt 5.E):

| Secret | Rotationsverhalten heute belegt? | Wirkung einer Rotation |
|---|---|---|
| K-01 `DATA_ENCRYPTION_KEY` | **nein** | Rotation heute nicht durchführbar (D-06, `G-16`) |
| K-02 `SUPABASE_SERVICE_ROLE_KEY` | **nein** (`G-17`) | umgeht RLS vollständig; Rotation bei Kompromittierung zwingend |
| K-03 `SUPABASE_ANON_KEY` / `SUPABASE_URL` | nein | Eine Hoständerung erfordert ohne stabilen Proxy-/Alias-/Failoverpfad einen Store-Release (H-03, `G-20`) |
| K-04 `BACKOFFICE_INVITE_HMAC_SECRET` | **ja**, im Code kommentiert | invalidiert offene Einladungen – gewolltes Verhalten |
| K-05 `ANTHROPIC_API_KEY` | nein | keine Wirkung auf Bestandsdaten |
| K-06 Provider-Keys | nein | Coverage sinkt sichtbar auf `not_configured`, keine falsche Entwarnung |

**Was entschieden werden muss.**

1. Rotationsturnus je Secretklasse und Sperrfrist bei Verdacht auf Kompromittierung.
2. **Wer besitzt die Providerkonten** (`G-18`)? Ohne Kontoinhaber gibt es keinen Sperrpfad.
3. Rotationsrunbook für K-02 (`G-17`): Wie wird rotiert, ohne dass Worker-Schreibpfade ausfallen?
4. Wer stellt die Kompromittierung fest und löst die Rotation aus – diese Frage hängt direkt an
   D-09.

**Sicherheitsgrenze dieser Phase.** Kein Secret wurde gelesen, angezeigt, erzeugt, rotiert oder
widerrufen; keine Cloudflare-, Supabase- oder GitHub-Environment-Konfiguration wurde verändert.

**Freigabe:** _Name, Rolle, Datum, Artefaktversion – offen._

---

## D-08 Release-Signing-Recovery

- **Status:** `open` / `owner_required` · **Benötigter Owner:** Operations (Verwahrung, Kontozugang)
  und Product (Auswirkung auf Auslieferung)
- **Blockt Phase B:** nein · **Blockt Phase D:** ja, Szenario 4 („verlorenes oder kompromittiertes
  Release-Signing-Material")

**Belegter Iststand.** Die Pipelines sind sauber gebaut: geschützte Environments
`production-android` und `production-ios`, fail-closed Secretvollständigkeit, freigegebener
Zertifikatsfingerabdruck, temporäre Runner-Keychain mit Cleanup, Sigstore-/GitHub-Attestation
(`actions/attest`, per Commit-SHA gepinnt), Hashmanifest. **Über die Wiederbeschaffung des
Schlüsselmaterials selbst sagt das nichts.**

Zusätzlich belegt `docs/UMSETZUNGSPLAN_2026.md` Abschnitt 22, dass für SP3-01 „echte signierte
AAB-/IPA-Releases und unabhängige Attestation-/Store-Identitätsprüfung" noch offen sind. Der
Signing-Pfad ist also nicht nur im Recovery unbelegt, sondern insgesamt noch nicht durchlaufen.

**Was entschieden werden muss.**

1. **Ist Google Play App Signing aktiv?** Davon hängt ab, ob ein verlorener Upload-Key ersetzbar
   ist oder ob der Verlust bedeutet, dass bestehende Installationen **dauerhaft** kein Update mehr
   erhalten können. Diese eine Frage trennt ein handhabbares von einem existenziellen Risiko
   (`G-19`).
2. Apple: Wer ist Account Holder, wie läuft die Zwei-Faktor-Wiederherstellung, und gibt es einen
   zweiten Zugang?
3. Verwahrung und Zweitkopie des Android-Keystores außerhalb der GitHub-Environment-Secrets.
4. Wiederbeschaffungszeit je Plattform – sie ist Eingangsgröße für D-01.

**Sicherheitsgrenze dieser Phase.** Kein Signing-Material wurde gelesen, erzeugt, exportiert oder
verändert; keine GitHub-Environment-Einstellung wurde angefasst.

**Freigabe:** _Name, Rolle, Datum, Artefaktversion – offen._

---

## D-09 Incident Commander und Stellvertretung

- **Status:** `open` / `owner_required` · **Benötigter Owner:** Geschäftsführung (Benennung)
- **Blockt Phase B:** nein · **Blockt Phase D:** ja – ein Tabletop ohne benannten Incident Commander
  übt eine Rolle, die es nicht gibt.

**Belegter Iststand.** Das Repository enthält **keine** namentliche Rollenzuordnung:

- keine `CODEOWNERS`-Datei;
- `SECURITY.md` definiert Reaktions- und Patchziele (kritisch: 1 Arbeitstag Rückmeldung,
  24 Stunden Eindämmung, 72 Stunden Korrektur), benennt aber **keine Person und keine Rolle**, die
  diese Fristen hält;
- `docs/SP3_01_SECURE_SDLC_RUNBOOK.md` verlangt „benannte Owner für Patch-Triage und Vulnerability
  Inbox" – als offene Anforderung;
- `docs/UMSETZUNGSPLAN_2026.md` Abschnitt 22 führt für SP3-01 „benannte Triage-Owner" als offen;
- `docs/adr/ADR-001_VERIFICATION_PLAN.md` Abschnitt 2 führt **alle sieben** Gate-Owner als `offen`.

Die in `SECURITY.md` zugesagten Fristen sind damit heute **durch niemanden gedeckt**.

**Was entschieden werden muss.**

1. Incident Commander und mindestens eine Stellvertretung, namentlich.
2. Erreichbarkeitsfenster und Eskalationsweg außerhalb der Geschäftszeiten – die 24-Stunden-
   Eindämmungszusage aus `SECURITY.md` impliziert eine Bereitschaft, die nirgends geregelt ist.
3. Wer darf einen Kill Switch ziehen, einen Restore anordnen und eine Secret-Rotation auslösen
   (Bezug zu D-07).
4. Wie wird die Rolle bei Abwesenheit übergeben.

**Es wird hier ausdrücklich keine Person vorgeschlagen.** Eine aus der Git-Historie abgeleitete
Zuordnung wäre eine Erfindung, keine Benennung.

**Freigabe:** _Name, Rolle, Datum, Artefaktversion – offen._

---

## D-10 Datenschutz-, NIS2- und Kundenkommunikationsrollen

- **Status:** `open` / `owner_required` · **Benötigter Owner:** Datenschutz und Geschäftsführung
- **Blockt Phase B:** nein · **Blockt Phase D:** ja

**Belegter Iststand.** `docs/SP3_02_RECOVERY_TABLETOP_PLAN.md` Phase D verlangt je Szenario eine
„Datenschutz-/NIS2-Eskalationsentscheidung" und hält zugleich fest: „Rechtliche Meldefristen werden
nur nach Fachreview als verbindlicher Produkttext übernommen." `SECURITY.md` formuliert dazu:
„Datenschutzverletzungen und meldepflichtige Vorfälle folgen zusätzlich dem Incident- und
Datenschutzprozess; diese Richtlinie ersetzt keine gesetzlichen Fristen." Ein solcher Prozess
existiert im Repository **nicht**.

**Was entschieden werden muss.**

1. Benannte datenschutzrechtlich verantwortliche Person beziehungsweise Datenschutzbeauftragte(r)
   und deren Rolle im Vorfall.
2. Ob und ab wann PraxisShield selbst in den NIS2-Anwendungsbereich fällt – und wer diese
   Einschätzung verantwortet. Das ist eine **Rechtsfrage**, die hier nicht beantwortet wird.
   Unabhängig davon können Kundenpraxen eigene Melde- und Informationspflichten haben, die eine
   Mitwirkung von PraxisShield erfordern; auch dieser Mitwirkungsumfang ist zu entscheiden.
3. Wer entscheidet über eine Meldung an eine Aufsichtsbehörde, und in welcher Frist wird diese
   Entscheidung getroffen (nicht: welche gesetzliche Frist gilt – das ist Fachreview).
4. Wer kommuniziert mit betroffenen Praxen und White-Label-Partnern, über welchen Kanal, und wer
   gibt den Wortlaut frei. Die Partnerbeziehung (`white_label_partner_id`, `partner_practices`)
   bedeutet, dass ein Vorfall **zwei** Adressatenkreise mit unterschiedlichem Informationsbedarf
   hat.
5. Wer beantwortet Rückfragen zu einem bereits ausgeführten Restore, der einen zuvor
   durchgesetzten Löschzustand rückgängig gemacht haben könnte (`G-03`) – dies ist ein
   datenschutzrechtlich relevanter Fall, der aus der Istaufnahme neu hervorgeht.

**Freigabe:** _Name, Rolle, Datum, Artefaktversion – offen._

---

## 2. Auswirkung auf den Phasenfortschritt

| Phase | Startbar? | Begründung |
|---|---|---|
| A – Istaufnahme | abgeschlossen | `docs/SP3_02_RECOVERY_INVENTORY.md` |
| B – lokaler Restore-Drill | **technisch abgeschlossen, 8/8** | Nach ausdrücklicher Implementierungsfreigabe schließt die G-01-Migration den D2-Löschumfang. 266 pgTAP-Assertions und P-01 bis P-08 sind grün. D-02/D-05 blockieren weiterhin die Übertragung auf Produktion, produktive Claims und produktionsnahe Drills. |
| C – Rotationsdrill | **nach D-05, D-06, D-07** | Eine Cloud-Rotation ist am heutigen Stand technisch nicht durchführbar (D-06). |
| D – Incident-Tabletop | **nach D-08, D-09, D-10** | Ein Tabletop ohne benannte Rollen übt Rollen, die nicht existieren. |
| E – Abnahme | nach B bis D | Definition of Done aus `docs/SP3_02_RECOVERY_TABLETOP_PLAN.md`. |

## 3. Was dieses Register nicht tut

- Es trifft **keine** Entscheidung stellvertretend für einen Owner.
- Es schlägt **keine** RPO-/RTO-Zahlenwerte, Provider, Regionen oder Fristen vor, für die es keinen
  Beleg gibt.
- Es benennt **keine** Person.
- Es erklärt **keinen** Punkt für erledigt, weil er technisch plausibel erscheint.

Solange die Freigabezeilen leer sind, bleibt SP3-02 im Status `blocked_by_owner_decisions`. Eine
Freigabe als `released` ist unabhängig vom technischen Fortschritt ausgeschlossen.

Die Anweisung zur Umsetzung von G-01 am 17. September 2026 autorisiert ausschließlich die
technische Löschmigration und ihre Tests. Sie wird nicht als Entscheidung D-01 bis D-10 und nicht
als formales Datenschutz-, Betriebs- oder Produktions-Sign-off ausgelegt.
