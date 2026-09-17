# SP3-02 Phase B – lokaler Restore-Drill

Stand: 2026-09-16  
Status: `technical_complete_8_of_8_release_blocked_by_owner_decisions`

## Zweck

Der Drill erzeugt aus dem repositoryeigenen synthetischen Zwei-Mandanten-Seed einen logischen
Postgres-Dump der verantworteten Schemas `public`, `auth`, `storage` und `supabase_migrations`,
stellt ihn in einer neu angelegten isolierten Datenbank desselben lokalen
Supabase-Containers wieder her und führt die Prüfpunkte P-01 bis P-08 aus. Er greift weder auf ein
verknüpftes Supabase-Projekt noch auf Produktionsdaten oder produktive Schlüssel zu.

Providerverwaltete Supabase-Systemschemata wie `realtime` werden bewusst nicht als portables
Kundenbackup ausgegeben: Der lokale Datenbank-Owner darf einzelne providerseitige
Funktionsparameter nicht wiederherstellen. Ihre Rekonstruktion ist Providerverantwortung und
bleibt für einen produktionsnahen Drill an D-02 gebunden.

Dasselbe gilt für `DEFAULT ACL`-Einträge fremder Supabase-Servicerollen: Der lokale
Anwendungs-Owner darf deren zukünftige Standardrechte nicht verändern. Der Restore lässt nur
diese Default-ACL-TOC-Einträge aus. Alle gegenwärtigen Grants auf den 34 Anwendungstabellen werden
wiederhergestellt und in P-03 exakt gegen den Vorzustand verglichen.

## Ausführung

Voraussetzungen: laufendes Docker Desktop, Supabase CLI 2.109.1 oder neuer und Node.js 22.

```bash
cd /private/tmp/Praxis-AI-sp3-02
npm run recovery:drill
```

Der Befehl setzt die **repositorylokale** Supabase-Datenbank auf `supabase/seed.sql` zurück. Vor
dem Dump lehnt er jeden Mandanten ab, dessen Domain oder E-Mail nicht der synthetischen
`example.test`-Fixture entspricht. Das Restoreziel trägt ausschließlich einen Namen nach dem
Muster `praxisshield_recovery_<PID>` und wird beim Beenden gelöscht.

## Prüfpunkte

- P-01: Migrationen stimmen exakt mit `supabase/migrations/` überein.
- P-02: alle pgTAP-Suiten laufen gegen die wiederhergestellte Datenbank.
- P-03: Tabellen-RLS, `FORCE ROW LEVEL SECURITY`, Policies sowie Schema-, Tabellen-, Routine- und
  Usage-Grants sind bytegleich; exakt 34 öffentliche Tabellen erzwingen RLS.
- P-04: Report, Snapshot und Manifest werden mit dem Testschlüssel entschlüsselt, kanonisch neu
  gehasht und mit den gespeicherten Hashes verglichen. Der PDF-Hash wird vor und nach dem Restore
  über denselben produktiven PDF-Renderer berechnet.
- P-05: die append-only Consent-Kette und der ursprüngliche AVV-Zeitstempel bleiben erhalten.
- P-06: ein vor dem Backup abgeschlossener Löschlauf bleibt nach dem Restore vollständig
  durchgesetzt, einschließlich der sechs Inventar-/Router-/Monitoringzieltabellen.
- P-07: wiederhergestellter Passwort-Hash und mandantenfeste RLS-Gegenproben für Tenant A und
  einen Außenstehenden.
- P-08: ohne den expliziten Testschlüssel scheitert die Artefaktprüfung fail-closed und schreibt
  weder leere noch unverschlüsselte Ersatzdaten.

## Evidenz und Grenzen

Der Report unter `artifacts/recovery/` enthält ausschließlich Zeitstempel, Tool- und
Migrationsversion, Counts, Hashes, Checkstatus und Fehlerklassen. Temporäre Dumps, Payloads,
Ciphertexte, lokale Tokens und der Testschlüssel werden beim Ende des Laufs gelöscht. Das
Artefakt ist absichtlich durch `.gitignore` ausgeschlossen.

Die Messwerte gelten nur für die lokale synthetische Datenbank. Sie belegen weder das Vorhandensein
eines Produktionsbackups noch ein produktives RPO/RTO. Die GoTrue-Passworthashprüfung beweist den
logischen Auth-Datenrestore; ein echter Login gegen einen separat gestarteten Restore-Stack bleibt
Teil des späteren produktionsnäheren Drills nach D-02.

## Gemessener Stand

Der Referenzlauf vom 17. September 2026 gegen den Arbeitsstand auf Basis von `715f3abd20ac`
stellte den logischen Dump in 389 ms wieder her; die Dufferzeugung dauerte 308 ms. Diese Zeiten sind
ausschließlich lokale Messwerte und kein RPO-/RTO-Claim. P-01 bis P-08 bestanden. P-02 führte alle
14 pgTAP-Dateien mit 266 Assertions gegen den Restore aus.

P-06 ist nach der ausdrücklich freigegebenen G-01-Migration grün: Die sechs D2-Sammlungen sind
sowohl unmittelbar nach `complete_privacy_deletion` als auch im wiederhergestellten Stand leer.
Die neue Regression belegt zugleich, dass der andere Mandant unverändert und
`practice_access_audit`, `deletion_requests`, `consent_log` sowie
`data_processing_agreements` erhalten bleiben. Phase B ist damit technisch abgeschlossen; die
Produktionsübertragbarkeit bleibt durch D-01 bis D-10 blockiert.
