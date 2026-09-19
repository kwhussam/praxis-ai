# ADR-002: Autoritativer Assessment-Snapshot v1

- **Status:** implementiert, technische Verifikation ausstehend
- **Ticket:** SP3-03 / P1-01
- **Datum:** 2026-09-19
- **Betroffene Plattformen:** Cloud/API, Supabase, Web, Android, iOS; später Windows-/Linux-/macOS-Agent und Router-Connector
- **Vertrag:** `docs/schema/assessment-snapshot-v1.schema.json`
- **Runtime-Grenze:** `lib/security/assessment-snapshot-contract.ts`
- **Fixtures:** `lib/security/__fixtures__/assessmentSnapshots.ts`

## 1. Entscheidung

PraxisShield führt `assessment_snapshots` als eigenständige, unveränderliche und
mandantengebundene Bewertungsentität ein. Ein Snapshot friert den gesamten für
eine Bewertung verwendeten Faktenstand ein:

- alle verwendeten Komponenten und ihre Quellen;
- Kontrollstatus und Anwendbarkeit;
- Posture, Coverage, Confidence, Freshness und Reviewstatus;
- Scoreerklärungen als stabile Codes;
- Fakten-, Scoring-, Kontrollkatalog-, Policy-Pack- und Engine-Version;
- Hash des kanonischen Klartextpayloads;
- optional eine echte Ed25519-Signatur mit Schlüssel-ID.

Die **Posture** ist die autoritative Managementaussage. Technische Gesamt- und
Domänenscores sind untergeordnete Erklärwerte. Ein hoher Score kann daher durch
Coverage-, Freshness- oder Kernkontroll-Gates weiterhin Gelb oder Rot ergeben.

Der bestehende `assessment_manifests`-Datensatz wird nicht umgedeutet: Er bleibt
das versionsgebundene Artefakt eines konkreten Reports. Ein Manifest kann künftig
optional auf einen autoritativen Snapshot verweisen. Historische Manifeste bleiben
ohne Backfill gültig.

## 2. Warum der SP2-04-Manifestvertrag nicht genügt

Das aktuelle Reportmanifest ist absichtlich eng:

1. Es bindet genau einen Fragebogen-`security_check` an genau einen Report.
2. Es speichert Report- und PDF-Versionen, aber keinen vollständigen
   Mehrquellen-Komponentenvertrag.
3. Es besitzt keine eigene Posture-/Coverage-/Freshness-Semantik.
4. Sein Snapshot ist ein Reportinput; er ist nicht die langfristige Identität
   einer Bewertung, aus der mehrere Berichte oder Maßnahmen entstehen können.

Eine Erweiterung derselben Tabelle würde Reportlebenszyklus und
Bewertungslebenszyklus koppeln. Die additive Trennung ermöglicht dagegen
mehrere Reportformate, Retests und spätere Maßnahmen, ohne einen historischen
Bewertungsstand neu zu berechnen.

## 3. Vertrag und Semantik

### 3.1 Identität und Versionierung

`schema_version` versioniert die Form des Snapshotvertrags. Die fünf fachlichen
Versionen bleiben zusätzlich Pflicht:

| Feld | Bedeutung |
|---|---|
| `facts` | Projektion der autoritativen Fakten |
| `scoring` | mathematische Punkte- und Gewichtungslogik |
| `control_catalog` | Identität und Fassung der Kontrollen |
| `policy_pack` | Profil-, Gate- und Regelauswahl, etwa Deutschland/Gesundheit |
| `engine` | ausführende Implementierung |

Eine neue aktuelle Version verändert keine gespeicherte Zeile und kein
verschlüsseltes Payload. Ein historischer Snapshot wird angezeigt oder exportiert,
aber niemals beim Lesen gegen aktuelle Regeln neu bewertet.

### 3.2 Komponenten

Eine Komponente beschreibt eine tatsächlich herangezogene Quelle. v1 unterstützt:

`questionnaire`, `external_monitoring`, `wlan`, `mobile`, `desktop_agent`,
`router` und `manual_attestation`.

Jede Komponente führt Collectionstatus, Freshness, Beobachtungs-/Ablaufzeit,
Quellversion, betroffene Kontroll-IDs und einen Payloadhash. `unsupported` ist
eine Plattformgrenze und kein negativer Sicherheitsbefund. `not_checked`,
`permission_denied`, `timeout`, `error` und `unavailable` dürfen niemals als
bestandene Kontrolle serialisiert werden.

### 3.3 Scoreerklärung

Persistiert werden stabile Codes und strukturierte Auswirkungen, keine
generierten Erklärungstexte. Die UI lokalisiert Codes und kann dadurch weder
Bewertungsfakten noch rechtliche Aussagen über Freitext verändern.

Mögliche Effekte sind:

- `blocks_green`: Gate verhindert Grün unabhängig vom technischen Score;
- `reduces_score`: Regel reduziert den technischen Score;
- `coverage_only`: beeinflusst Evidenzabdeckung, nicht den Kontrollstatus;
- `informational`: reine Erklärung ohne Bewertungswirkung.

### 3.4 Integrität und Authentizität

`payload_sha256` wird über die in `canonical-json.ts` definierte kanonische
Darstellung aller Felder außer `integrity` berechnet. Der Hash erkennt
Veränderungen nach dem Entschlüsseln. Er beweist **nicht**, wer den Snapshot
erzeugt hat.

Darum modelliert der Vertrag zwei wahrheitsgemäße Zustände:

- `hash_only` mit `signature: null`;
- `signed` ausschließlich mit `algorithm=ed25519`, `key_id` und Signaturwert.

PraxisShield besitzt aktuell keinen freigegebenen Assessment-Signierschlüssel.
Die offenen Schlüsselentscheidungen D-05/D-06/D-07 aus SP3-02 blockieren daher
den Zustand `signed`. Bis dahin darf UI, Bericht oder Marketing keinen
„signierten Snapshot“ behaupten. Die Datenbank verhindert unvollständige oder
als signiert deklarierte Nullsignaturen.

## 4. Speicherung und Datenklassen

### 4.1 D1-Klartext

Relational lesbar bleiben ausschließlich:

- IDs, Zeitpunkte, Versionen und Hashes;
- Posture, technische Aggregatwerte, Coverage, Confidence und Freshness;
- Collection-/Reviewstatus sowie stabile Gate-/Erklärungscodes;
- nicht identifizierende Quellreferenzen und Kontroll-IDs.

### 4.2 D2-verschlüsselt

Der vollständige Snapshotvertrag liegt zusätzlich als verschlüsseltes Payload
in `assessment_snapshots.encrypted_payload`. Freitext, Evidenzdetails,
Netzwerkinformationen, Praxisattribute oder künftige `EvidenceRef`-Details sind
immer D2 und erscheinen nie in den relationalen Metadaten.

Neue Writes müssen ein versioniertes Envelope mit Algorithmus, Keyversion, IV,
Ciphertext und AAD-Hash liefern. Die Tabelle akzeptiert das heutige globale
Legacy-Envelope bewusst nicht. Produktive Snapshoterzeugung bleibt dadurch bis
zur freigegebenen v2-Schlüsselstrecke geschlossen; die additive Schemaeinführung
startet keine unfreigegebene ADR-001-Migration.

D3-Zugangsdaten, Tokens, WLAN-Schlüssel und private Schlüssel sind in Snapshot
und Komponenten verboten.

## 5. Datenbank- und Autorisierungsvertrag

Die Migration führt drei Tabellen ein:

1. `assessment_snapshots` – Identität, Versionen, Posture, Aggregate,
   Integritätsstatus und verschlüsseltes Payload;
2. `assessment_snapshot_components` – geordnete Quellenmetadaten;
3. `assessment_snapshot_score_explanations` – geordnete, maschinenlesbare
   Bewertungsgründe.

Alle Tabellen verwenden `ENABLE` und `FORCE ROW LEVEL SECURITY`. Mitglieder
derselben Praxis benötigen mindestens Viewerrechte zum Lesen. `anon` hat keine
Rechte. Weder `authenticated` noch `service_role` dürfen direkt schreiben.

Nur die `SECURITY DEFINER`-RPC
`persist_assessment_snapshot(jsonb,jsonb,text)` darf Snapshot, Komponenten und
Scoreerklärungen atomar erstellen. Ihr `search_path` ist leer. Der
Idempotency-Key ist pro Praxis eindeutig; ein Retry mit gleichem Hash liefert
dieselbe ID, ein anderer Hash scheitert als Konflikt.

Direkte Updates sind zusätzlich zu den entzogenen Grants durch Trigger
verboten. Löschen ist ausschließlich Teil des administrativen
Datenschutzlebenszyklus: `complete_privacy_deletion` löscht den Snapshot und
seine Kindzeilen per Cascade und hält im Löschbeleg nur den Sammlungsnamen fest.

## 6. API-Vertrag

Das JSON Schema beschreibt die entschlüsselte, autorisierte API-Repräsentation.
Der Runtime-Parser ist absichtlich streng und lehnt unbekannte Felder ab. Eine
Erweiterung benötigt daher eine neue `schema_version`, statt alte Clients still
anders interpretieren zu lassen.

SP3-03 führt noch keinen öffentlichen `/api/v1`-Endpunkt ein. Das geschieht in
P1-08 zusammen mit OpenAPI, generiertem Client und Deprecation-Vertrag. Bis
dahin ist die einzige Write-Grenze die interne Service-RPC. Dadurch entsteht
kein zweiter provisorischer HTTP-Vertrag.

Der spätere HTTP-Vertrag folgt mindestens diesen Regeln:

- Pfad enthält Praxis- und Snapshot-ID; Body-/Pfad-Praxis müssen identisch sein;
- Viewer darf lesen, nur autorisierte Assessment-Engine darf schreiben;
- kein Clientfeld darf Posture, Score, Version oder Integrität setzen;
- Hashprüfung erfolgt nach Entschlüsselung vor jeder Antwort;
- ungültige Verschlüsselung oder Hashabweichung liefert fail-closed `409`;
- unbekannte Schemafassung liefert `409 unsupported_snapshot_version`;
- Listen liefern nur D1-Metadaten, Details ausschließlich autorisiert und
  auditiert.

## 7. Historie und Migration

Die Migration ist rein additiv:

- bestehende Reports und Manifeste werden nicht verändert;
- `assessment_manifests.assessment_snapshot_id` ist nullable;
- es gibt keinen automatischen Backfill aus alten Reports, weil alte Manifeste
  nur eine Quelle repräsentieren und fehlende Komponenten nicht erfunden werden
  dürfen;
- die produktive Engine-Cutover-Migration folgt erst nach v2-Crypto- und
  Datenschutzfreigabe.

Ein späterer Backfill darf höchstens ausdrücklich als `legacy_report_import`
gekennzeichnete, unvollständige Snapshots erzeugen. v1 erlaubt diese
Komponentenart absichtlich noch nicht; ein vermeintlich vollständiger Backfill
ist damit fail-closed ausgeschlossen.

## 8. Verifikation und Abnahmekriterien

Die Contract-Suite prüft:

- vollständige und unzureichend abgedeckte Golden Fixtures;
- kanonisch stabile Hashes;
- keine unbekannten Felder ohne Versionssprung;
- kein bestandener Status bei nicht erhobener Evidenz;
- keine behauptete Signatur ohne Signaturmaterial;
- unveränderte historische Bytes bei neuen aktuellen Engine-/Policyversionen.

Die pgTAP-Suite prüft:

- RLS und `FORCE RLS` auf allen drei Tabellen;
- entzogene direkte Writes und service-role-only RPC;
- fixierten leeren `search_path`;
- atomare Komponenten-/Erklärungspersistenz;
- Idempotenz und Hashkonflikt;
- Update-Unveränderlichkeit;
- Cross-Tenant-Isolation auf allen Tabellen;
- Löschung über den Datenschutz-RPC.

SP3-03 ist technisch abgenommen, wenn Unit-/Contracttests, frischer DB-Reset,
gesamte pgTAP-Suite, Lint und TypeScript grün sind. Das autorisiert noch keine
produktive Snapshoterzeugung; dafür bleiben ADR-001 sowie die SP3-02-
Schlüsselentscheidungen verbindliche Gates.

## 9. Bewusste Folgearbeiten

- **P1-02:** vollständiges Control-/Assertion-/Finding-/Evidence-Modell; v1
  friert vorerst das heutige additive ControlResult-Subset ein.
- **P1-08:** `/api/v1`, OpenAPI, generierte Clients, Fehler- und
  Deprecation-Vertrag.
- **P1-10:** finaler Retention-/Auditvertrag je Phase-1-Entität.
- **D-05/D-06/D-07:** KMS/KEK/DEK-, Escrow- und Rotationentscheidung sowie
  Signierschlüssel-Lebenszyklus.
- **Engine-Cutover:** aktuelle Quellen zu Komponenten normalisieren, v2
  verschlüsseln, Snapshot-ID an neue Reportmanifeste binden und erst danach
  Dashboard/Reports auf Snapshot-ID umstellen.

## 10. Verworfene Alternativen

**Reportmanifest zur Assessmentidentität erklären.** Verworfen, weil es nur
einen Fragebogencheck und einen Reportlebenszyklus abbildet.

**Nur Hash ohne Authentizitätsstatus speichern.** Verworfen, weil Nutzer einen
Hash leicht als Signatur missverstehen können.

**Aktuelle Regeln beim Lesen erneut ausführen.** Verworfen, weil historische
Bewertungen dadurch ohne neue Evidenz wechseln und Auditierbarkeit verlieren.

**Vollpayload relational im Klartext speichern.** Verworfen wegen D2-
Topologie- und Sicherheitsdaten sowie unnötig breiter Abfragefläche.

**Alte Manifeste automatisch backfillen.** Verworfen, weil fehlende Quellen,
Coverage und Gatezustände nicht zuverlässig rekonstruiert werden können.
