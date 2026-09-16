# SP3-02 – Restore, Schlüsselrotation und Incident-Tabletop

Stand: 2026-09-16  
Status: `planning`  
Branch: `codex/sp3-02-recovery-tabletop`

## Ziel

SP3-02 schafft belastbare betriebliche Nachweise für Wiederherstellung, Schlüsselrotation und
Incident Response. Das Arbeitspaket erzeugt keine ungeprüften Verfügbarkeits- oder
Sicherheitsclaims. RPO und RTO gelten erst nach einem gemessenen Restore und benannter Freigabe
durch Operations und Product.

## Sicherheitsgrenzen

- Keine Produktionsdaten, keine realen Praxisdaten und keine produktiven Secrets verwenden.
- Keine produktive Datenbank, Cloudflare-Konfiguration, KMS-/KEK-Konfiguration oder
  GitHub-Environment-Einstellung verändern.
- Restore- und Rotationstests ausschließlich gegen synthetische lokale oder ausdrücklich
  freigegebene Staging-Fixtures ausführen.
- Schlüsselmaterial nie loggen, in Artefakte schreiben oder in Git aufnehmen.
- Bestehende RLS-, Mandanten-, AAD-, Lösch-, Export- und Auditverträge dürfen nicht aufgeweicht
  werden. Unbekannte Schlüsselversionen und unvollständige Restore-Artefakte scheitern
  fail-closed.
- ADR-001 bleibt vor Datenmigration und produktiver KEK-/DEK-/IIK-Einführung durch die dort
  genannten menschlichen Sign-offs gesperrt.

## Phasen

### Phase A – Istaufnahme und Entscheidungsregister

1. Alle Datenbestände, Backuppfade, Schlüssel und Recovery-Abhängigkeiten inventarisieren:
   Supabase/Postgres, Auth, Storage, Worker-Secrets, Reportverschlüsselung, lokale
   SecureStore-/SQLite-Inventare, Release-Signing und CI-Artefakte.
2. Pro Bestand dokumentieren: Datenklasse, Owner, Backupautorität, Aufbewahrung, Verschlüsselung,
   Wiederherstellungsreihenfolge, Abhängigkeiten und aktuell belegbarer Recovery-Stand.
3. Behauptungen strikt als `measured`, `configured`, `documented` oder `unknown` kennzeichnen.
4. Offene Entscheidungen für Provider, Region, RPO, RTO, Retention, KEK/KMS und Notfallrollen in
   einem Decision Log erfassen; keine Werte erfinden.

### Phase B – Reproduzierbarer lokaler Restore-Drill

1. Ein synthetisches Zwei-Mandanten-Fixture mit eindeutigen Canary-Datensätzen und ohne D2/D3-
   Echtdaten definieren.
2. Backup, isolierten Restore und Integritätsprüfung skriptbar machen. Der Test muss mindestens
   Schema/Migrationen, RLS/Grants, Mandantentrennung, Reports/Manifeste, Consent-/Auditdaten und
   Löschzustände prüfen.
3. Gemessen werden Startzeit, Backupzeitpunkt, wiederherstellbarer Datenstand, Ende, RPO und RTO.
   Ein unvollständiger Restore, Cross-Tenant-Zugriff, Hashfehler oder fehlendes Auditobjekt ist ein
   harter Fehler.
4. Artefakte enthalten nur Metadaten, Counts, Hashes und Testergebnisse – keine Payloads, Tokens,
   Schlüssel oder Praxisidentifikatoren.

### Phase C – Schlüsselrotations-Drill

1. Bestehende Schlüsselverwendung und Versionsfähigkeit zuerst gegen Code und ADR-001 abgleichen.
2. Rotation nur für bereits implementierte, testbare Schlüsselpfade durchführen. Nicht
   implementierte KEK-/DEK-/IIK-Registries werden nicht vorgetäuscht, sondern als Blocker mit
   Owner und Folgeticket dokumentiert.
3. Der Drill muss alte Ciphertexte während des freigegebenen Übergangsfensters lesen, neue Writes
   ausschließlich mit der neuen Version erzeugen, unbekannte Versionen ablehnen und Retirement
   bei verbleibenden Referenzen blockieren.
4. Rollback bedeutet Reaktivierung einer weiterhin vorhandenen `decrypt_only`-Version; niemals
   Klartext-Rehydration oder Keyverlust.

### Phase D – Incident-Tabletop

Mindestens diese Szenarien als zeitlich protokollierte Übung durchführen:

1. kompromittierter Worker-/Provider-Key;
2. Ransomware beziehungsweise beschädigte Datenbank mit Restorebedarf;
3. vermuteter Cross-Tenant-Datenzugriff;
4. verlorenes oder kompromittiertes Release-Signing-Material;
5. fehlerhafte Schlüsselrotation mit teilweise migrierten Ciphertexten;
6. Ausfall eines externen Providers, ohne daraus fälschlich einen sicheren Zustand abzuleiten.

Für jedes Szenario: Detection, Severity, Incident Commander, technische und fachliche Owner,
Containment, Evidenzerhalt, Datenschutz-/NIS2-Eskalationsentscheidung, Recovery, interne/externe
Kommunikation, Exit-Kriterien und Follow-ups. Rechtliche Meldefristen werden nur nach Fachreview
als verbindlicher Produkttext übernommen.

### Phase E – Abnahme und Automatisierung

- Ausführbare Tests und Runbooks werden in CI geprüft, soweit sie ohne produktive Credentials
  sicher reproduzierbar sind.
- Jeder Nachweis bindet Commit, Schema-/Migrationsversion, Umgebung, Zeitstempel und Toolversion.
- `npm run verify`, relevante pgTAP-Suiten, Secret Scan und neue Recovery-Tests müssen grün sein.
- Ein unabhängiges Review prüft mindestens Secret-Leaks, Restorevollständigkeit, RLS/Grants,
  Cross-Tenant-Isolation, Key-Lifecycle, Log-Redaktion und fail-closed Fehlerpfade.

## Definition of Done

SP3-02 kann erst `released` werden, wenn:

1. ein isolierter Restore mit synthetischen Daten reproduzierbar erfolgreich war und RPO/RTO
   gemessen wurden;
2. Operations und Product die Zielwerte benannt und den Messnachweis freigegeben haben;
3. ein unterstützter Schlüsselpfad Rotation, Rollbackfenster und Retirement-Gate nachweislich
   bestanden hat;
4. das Incident-Tabletop protokolliert ist und alle Follow-ups Owner, Priorität und Termin haben;
5. keine Secrets oder D2/D3-Payloads in Logs, Git oder CI-Artefakten enthalten sind;
6. offene produktive Provider-/KMS-/Signing-Entscheidungen ausdrücklich als Blocker dokumentiert
   bleiben und nicht durch lokale Simulation als gelöst gelten.

## Erster Umsetzungsschritt

Zuerst Phase A vollständig durchführen und daraus eine konkrete, nach Risiko priorisierte
Gap-Liste sowie den minimal sicheren lokalen Restore-Drill für Phase B ableiten. Vor dieser
Istaufnahme werden weder produktive Recoveryautomatisierung noch neue Schlüsselregistries gebaut.
