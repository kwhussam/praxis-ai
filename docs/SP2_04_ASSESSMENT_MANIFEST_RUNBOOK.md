# SP2-04 – Assessment-Manifest und kanonisches PDF

Stand: 2026-08-12
Status: `verification`

## Sicherheits- und Datenvertrag

- Jeder neue persistierte Bericht referenziert genau ein `assessment_manifests.id` derselben Praxis.
- Quelle ist ein nicht anonymisierter, tenantgebundener `security_checks`-Datensatz. Clientseitige
  Fragebogen-, Score-, Praxis- oder PDF-Metadaten sind für persistierte Berichte nicht autoritativ.
- Der Snapshot enthält Praxisbezug, Quellcheck, Fragebogen und kanonische Scoringfakten. Er wird nur
  als AES-256-GCM-Envelope gespeichert. Das Klartext-Manifest enthält ausschließlich IDs, Versionen
  und SHA-256-Werte.
- JSON-Hashes verwenden rekursiv sortierte Objektschlüssel. Arrayreihenfolgen bleiben fachlich
  relevant. Nur endliche JavaScript-Zahlen sind zulässig, `-0` wird zu `0`; die konkrete
  Dezimal-/Exponentschreibweise erzeugt `JSON.stringify`. Ganzzahlen außerhalb des exakt
  darstellbaren JavaScript-Bereichs müssen im jeweiligen Fachvertrag als String modelliert werden.
  `undefined`-Objektfelder werden ausgelassen, `undefined` in Arrays sowie BigInt, Zyklen und
  Nicht-JSON-Objekte werden abgelehnt. Dadurch sind Sonderfälle explizit und Hashes nach einer
  JSONB-Rundreise stabil.
- `persist_assessment_report` schreibt Snapshotmanifest und Bericht atomar. Ein identischer
  `client_sync_id` liefert auch bei einem konkurrierenden Retry das zuerst persistierte Paar zurück.
- Der PDF-Endpunkt nimmt ausschließlich `practiceId` und `reportId` an, prüft Tenant, Manifesthash
  und Reporthash und rendert mit dem im Manifest gespeicherten Zeitstempel und Templatevertrag.
  Altberichte ohne Manifest liefern `409 canonical_report_unavailable`; ein ungültiges oder nicht
  entschlüsselbares Report-Envelope liefert fail-closed `409 report_integrity_failed` statt `500`.
- Die App rendert kein eigenes HTML/PDF mehr. Sie validiert Content-Type und `%PDF-`-Signatur und
  cached die Serverbytes ausschließlich tenantgetrennt unter `cacheDirectory`. Dieser Cache ist
  nicht Bestandteil regulärer iOS-Backups und wird bei Logout, Praxiswechsel sowie lokal erkanntem
  Entzug/Löschen einer Praxis idempotent entfernt. Eine serverseitige Löschung von einem anderen
  Gerät kann lokale Offline-Dateien naturgemäß erst beim nächsten Session-/Praxisabgleich entfernen.

## Datenschutz

`assessment_manifests.encrypted_snapshot` ist D2-Sicherheits-/Topologiedatenbestand. Zugriff ist
über RLS auf Viewer derselben Praxis begrenzt; nur `service_role` darf einfügen. Es existiert bewusst
kein `UPDATE`-Recht. Der Art.-15/20-Export enthält Manifestmetadaten und Hashes, nicht den
verschlüsselten Payload. Bei Praxislöschung werden Assessment-Manifeste sofort gelöscht, bevor
Quellchecks und Berichte anonymisiert werden.

## Deployment

1. Datenbankmigration `20260811130000_sp2_04_assessment_manifest.sql` anwenden.
2. Worker deployen. Erst dieser Worker nutzt `persist_assessment_report` und den neuen PDF-Vertrag.
3. App-Build mit `expo-file-system` ausrollen.
4. Einen neuen Fragebogenbericht erzeugen und prüfen:
   - Report und Manifest besitzen dieselbe Praxis und Quellcheck-ID;
   - ein Retry mit gleicher `client_sync_id` erzeugt keine zweite Zeile;
   - zwei PDF-Exporte besitzen identische Bytes/ETags;
   - fremde Praxis erhält keine Manifest- oder Reportzeile;
   - App-Neustart lädt die Berichtshistorie und der Detail-Export cached das Server-PDF;
   - Logout und Praxiswechsel entfernen den jeweiligen lokalen PDF-Cache.
5. Fehlerraten für `canonical_report_unavailable` (erwartete Altberichte) und
   `report_integrity_failed` (nicht erwarteter Integritätsalarm) getrennt beobachten.

## Rollback

Der sichere Rollback ist vorwärtskompatibel und löscht keine Evidenz:

1. App-PDF-Button per Release-Rollback deaktivieren, falls der neue Worker nicht erreichbar ist.
2. Worker auf die vorherige Version zurückrollen. Die zusätzlichen Tabellenspalten und Manifeste
   bleiben erhalten; bestehende Read-Pfade ignorieren sie.
3. Datenbankobjekte nicht während eines Incident-Rollbacks droppen. Erst nach bestätigter
   Aufbewahrung/Exportentscheidung darf eine separate, reviewte Cleanup-Migration RPC, Policy,
   Fremdschlüssel und Tabelle entfernen.
4. Berichte, die bereits ein Manifest besitzen, niemals auf einen clientseitigen PDF-Renderer
   zurückstufen. Bis zur Behebung bleibt Export geschlossen, während die JSON-Detailansicht lesbar ist.

## Verifikationsnachweise

- frischer lokaler `supabase db reset --local`: alle Migrationen angewandt;
- `supabase db lint --local --level warning`: keine neue SP2-04-Warnung;
- reale RLS-Probe: Praxis A sieht kein Manifest von Praxis B;
- reale RPC-Probe: Manifest+Report atomar, Retry idempotent;
- `supabase db test --local`: eigenständige `assessment_manifest.sql` prüft 19 RLS-, Grant-,
  `search_path`-, Cross-Tenant-FK-, Atomicity- und Idempotenz-Eigenschaften; gesamter Lauf 225 Tests;
- Worker-Test: zwei Exporte byte-identisch, mehrseitig, tenantgebunden;
- Worker-Test: manipuliertes Manifest und nicht entschlüsselbarer Report werden vor PDF-Ausgabe
  mit `409 report_integrity_failed` abgelehnt;
- App-Test: Request enthält nur Praxis-/Report-ID, Cache schreibt exakt die Serverbytes in
  `cacheDirectory` und wird tenantbezogen beziehungsweise vollständig gelöscht.

## Noch offene Release-Gates

- CI-Lauf der pgTAP-/Jest-Gates nach Push;
- nativer PDF-Export-, Öffnen-, Logout- und Praxiswechsel-Smoke auf iOS und Android;
- Datenschutz-Sign-off für ADR-001 und externe D1-Rechtsprüfung. Der vorbestehende Löschumfang für
  Inventar- und Monitoring-Target-Tabellen bleibt ein ADR-001-Blocker vor M5 und wird durch SP2-04
  nicht als behoben deklariert.
