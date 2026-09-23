# ADR-003 – SafeScan-Policy und Scan-Autorisierung v1

- Status: technisch angenommen, Fach-/Rechtsfreigabe offen
- Datum: 2026-09-20
- Arbeitspaket: SP3-04 / P1-03 / P1-04
- Vertrag: `de-health-safescan-1.0.0`, Schema `1.0.0`

## 1. Entscheidung und Grenze

PraxisShield darf keine aktive Netzwerkprüfung allein aus einem UI-Schalter, einem Scanjob oder
einer historischen Freigabe starten. Unmittelbar vor **jedem** Probe-Aufruf müssen zwei
unabhängige Prüfungen erfolgreich sein:

1. die serverseitige Lifecycle-Prüfung bestätigt Mandant, Gültigkeit, Widerruf, maximal erlaubte
   Safety Class und den aktuellen Praxis-Kill-Switch;
2. die entschlüsselte, strikt geparste D2-Scopeprüfung bestätigt Policyversion, Ziel, Ausschlüsse,
   gerätespezifische Obergrenze, Wartungsfenster und gegebenenfalls die Zusatzfreigabe.

Ein Fehler, unbekannter Zustand, Versionsunterschied oder nicht erreichbarer Autorisierungsdienst
führt zu `deny`. SP3-04 implementiert nur Policy, Schema, Persistenz und Preflight. Es führt keine
Scanqueue und keinen aktiven Probe-Code ein. Der produktive Scanpfad bleibt gesperrt, bis das
Dokument fachlich und rechtlich namentlich freigegeben sowie SP3-06 abgenommen ist.

## 2. Safety Classes

| Klasse | Zulässiger Zweck | Beispiele | v1-Regel |
|---|---|---|---|
| **S0** | lokal/passiv, keine gezielt erzeugten Netzwerkpakete | Fragebogen, importierte Konfiguration, lokale Inventarauswertung | innerhalb des autorisierten Scopes jederzeit |
| **S1** | sehr geringe, read-only Netzlast | begrenzte Erreichbarkeit, ARP/ND-Beobachtung, minimale Serviceerkennung | Standardobergrenze für unbekannte und medizinische Geräte |
| **S2** | begrenzte aktive oder authentifizierte Prüfung | explizit freigegebene Protokoll-/Konfigurationsprüfung | nur für explizite Ziele im aktiven Wartungsfenster |
| **S3** | potenziell disruptive/intrusive Prüfung | Belastungstest, Exploit, Credential Attack, invasive Fuzzing- oder Schreiboperation | in PraxisShield v1 **verboten** und nicht autorisierbar |

Die Klassifizierung beschreibt die maximal zulässige Wirkung, nicht die vermeintliche Absicht des
Probes. Neue Probes beginnen bei der konservativeren Klasse und benötigen vor Herabstufung eine
technische Safety-Prüfung.

## 3. Passive-first und empfindliche Ziele

- Erkennung startet passiv oder mit S0. S1 darf erst nach Scope-Prüfung folgen.
- `medical_device` und `unknown` besitzen ohne Zusatzfreigabe eine harte S1-Obergrenze.
- S2 für ein solches Ziel benötigt eine zielgebundene, zeitlich befristete Zusatzfreigabe mit
  `clinical_owner_approved=true`, Begründung, Actor und Ablauf. Sie ersetzt weder Hersteller-
  vorgaben noch den Praxisbetrieb-/Medizintechnikprozess.
- Ausschlüsse haben Vorrang vor Einschlüssen. Ein Ziel in beiden Mengen ist `deny`.
- Ein Host, Präfix oder Asset, das nicht anhand seiner Scope-ID in der entschlüsselten
  Autorisierung gefunden wird, ist nicht autorisiert. Es gibt kein implizites Subnetz oder
  „gleiche Praxis“-Fallback.

## 4. Autorisierungsinhalt

Jede Autorisierung bindet unveränderlich:

- Praxis-ID und opaken Standortbezug;
- Autorisierungs-ID, Schema- und Policyversion;
- verantwortlichen Praxis-Owner oder -Manager und Autorisierungszeit;
- `valid_from`, `valid_until` und die maximale Safety Class;
- explizite Ziel-IDs mit Zielart, Locator, Assetklasse und eigener Obergrenze;
- explizite Ausschlüsse;
- Wartungsfenster;
- alle verpflichtenden Stoppbedingungen;
- Hash des entschlüsselten Scopes und den verschlüsselten D2-Vollpayload.

Zieladressen, Präfixe, Hostnamen und Assetbezüge sind D2. Sie liegen ausschließlich im
authentifizierten verschlüsselten Envelope. Die Tabellenoberfläche enthält nur D1-Metadaten,
Zähler und Hashes. Authentifizierte Clients erhalten keinen Spaltenzugriff auf den Ciphertext.
SHA-256 ist nur ein Integritäts-/Idempotenznachweis und keine Signatur.

## 5. Lifecycle, Widerruf und Kill Switch

Autorisierungen und alle Zustandsereignisse sind append-only. Direkte Inserts, Updates und Deletes
sind auch für `service_role` entzogen. Nur RPCs mit leerem `search_path` dürfen:

- eine neue Autorisierung mit initialem `granted`-Ereignis atomar persistieren;
- sie mit einem `revoked`-Ereignis widerrufen;
- den Praxis-Kill-Switch aktivieren oder freigeben;
- den aktuellen Lifecycle unmittelbar vor einem Probe prüfen.

Die neueste Ereigniszeile wird deterministisch über `(occurred_at, created_at, id)` bestimmt.
Advisory Locks serialisieren Änderungen je Autorisierung beziehungsweise Praxis. Ein Widerruf ist
endgültig; ein nachfolgendes Grant derselben Autorisierung ist unzulässig. Der Kill Switch kann
nur über ein neues Ereignis gelöst werden und reaktiviert keine widerrufene Autorisierung.

## 6. Stoppbedingungen

Jeder Runner muss während eines Laufs mindestens vor jedem Probe und zusätzlich zwischen
mehrstufigen Probe-Phasen stoppen, wenn einer dieser Zustände vorliegt:

- Praxis-Kill-Switch aktiv;
- klinische Beeinträchtigung gemeldet;
- Konnektivitätsverschlechterung erkannt;
- unerwartetes medizinisches Gerät erkannt;
- definierte Fehler-/Timeoutschwelle überschritten;
- Autorisierung, Scope, Policyversion oder Lifecycle seit dem letzten Schritt geändert.

Ein Runner darf bei Kontrollverlust keinen begonnenen Folgeschritt „zu Ende versuchen“. Er beendet
den aktiven Netzwerkzugriff, markiert das Ergebnis als abgebrochen/unknown und schreibt nur
metadatenarme Audit-Evidenz. Automatische Wiederholung ist für Safety-Abbrüche verboten.

## 7. Rollen und Mandantentrennung

Nur aktive `practice_owner` oder `practice_manager` dürfen eine Autorisierung fachlich auslösen
oder widerrufen. Die Datenbank-RPC prüft den Actor nochmals gegen `can_access_practice`; ein
service-role-Aufruf allein ist keine fachliche Berechtigung. Metadaten sind für Manager sichtbar,
nicht für Viewer. Cross-Tenant-IDs werden abgelehnt. Die spätere Scanjob-Tabelle muss einen
zusammengesetzten mandantenfesten Fremdschlüssel `(authorization_id, practice_id)` und eine
nicht-nullbare Autorisierungsreferenz besitzen.

## 8. Datenschutz, Export und Löschung

Der Art.-15/20-Export enthält D1-Metadaten, Lifecycle- und Kill-Switch-Ereignisse, aber niemals den
verschlüsselten Scope als vermeintlich lesbaren Export. Ein späterer entschlüsselter Scopeexport
benötigt einen eigenen autorisierten Decryptpfad und Integritätsprüfung. Die Praxislöschung löscht
Autorisierungen, Ciphertexte und Ereignisse atomar und nennt im Löschbeleg nur die Sammlungen.
Eine darüber hinausgehende gesetzliche Aufbewahrung ist mit Datenschutz und Fachrecht zu
entscheiden; SP3-04 erfindet keine Rechtsgrundlage.

## 9. Pflichtnachweise vor produktiver Freigabe

- benannte Freigabe durch Security, medizinisch/fachlich verantwortliche Stelle, Product,
  Datenschutz und Rechtsprüfung;
- Safety-Fixtures einschließlich unbekanntem und medizinischem Gerät, Exclusion, Zeitgrenze,
  Widerruf, Kill Switch, Cross-Tenant und Policy-Drift;
- frischer Datenbankreset, pgTAP für RLS/Grants/RPC/Append-only/Lifecycle/Löschung;
- Runner-Integration, bei der jeder Probe einen gültigen Autorisierungsbezug besitzt;
- Failover-/Abbruchtest mit Kill Switch während eines mehrstufigen Laufs;
- Wartungsfenster- und Zeitzonenreview; gespeichert wird ausschließlich UTC;
- SP3-06 End-to-End-Abnahme.

Bis alle Pflichtnachweise vorliegen, bedeutet der Status `technical_complete`, nicht
`released`, „rechtssicher“ oder „für Medizingeräte freigegeben“.
