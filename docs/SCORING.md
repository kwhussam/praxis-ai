# PraxisShield Scoring 2.0.0

Die Scoring-Engine ist regelbasiert, versioniert und auditierbar. Jeder Gesamtscore entsteht aus `SCORING_RULES` in `lib/security/scoring.ts`; jede Regel liefert Punkte, Kategorie, Evidenztyp, Confidence, Finding, Empfehlung und Audit-Hinweise.

Version 2.0.0 trennt den Security Score vom Ampelstatus. Eine Praxis kann einen hohen Security Score erreichen und trotzdem nicht Grün sein, wenn die Nachweise schwach sind, Kernanforderungen fehlen, Mindestwerte unterschritten werden oder technische Befunde widersprechen.

## Datenmodell

Zentrale Typen in `lib/security/scoring.ts`:

```ts
type EvidenceSource =
  | "measured"       // technisch gemessen, z. B. WLAN/DMARC/Portprobe
  | "inferred"       // aus technischen Befunden abgeleitet
  | "self_reported"  // Claim/Selbstauskunft, nicht belastbarer Nachweis
  | "not_checked"
  | "unavailable";

type EvidenceKind =
  | "technical_evidence"
  | "derived_signal"
  | "claim"
  | "missing";

type CheckData = {
  mfa_enabled?: boolean;
  backup_tested?: boolean;
  backup_frequency?: "none" | "weekly" | "daily";
  dmarc_exists?: boolean;
  updates_current?: boolean;
  privacy_documents_current?: boolean;
  staff_training?: boolean;
  responsibilities_defined?: boolean;
  encryption?: "WEP" | "WPA" | "WPA2" | "WPA3" | "OPEN" | "UNKNOWN";
  external?: { email_security?: { dmarc?: { policy?: "none" | "quarantine" | "reject" | null } } };
  externalFindings?: SecurityFinding[];
  wlanFindings?: SecurityFinding[];
  wlanSecurityFindings?: NetworkSecurityFinding[];
  evidence_sources?: Partial<Record<ScoringRuleId, EvidenceSource>>;
};
```

`ScoreReport` enthält zusätzlich:

- `score`: Security Score von 0 bis 100 nach Evidence-Kappung.
- `evidence_confidence`: separater gewichteter Confidence-Wert von 0 bis 100.
- `ampel`: `rot`, `gelb` oder `grün`, entschieden über Score plus Gates.
- `ampel_reasons`: Audit-Log der Ampelentscheidung mit Code, Schwelle, Ist-Wert, Kategorie und Regel.
- `scores_by_category`: Kategorie-Scores nach Evidence-Kappung.
- `category_minimums`: aktuell `backup >= 70`, `access_control >= 70`, `updates >= 70`, `email_security >= 70`.
- `review_status`: `review_required`, wenn widersprüchliche Evidenz erkannt wird.

## Evidence & Confidence

Evidence Confidence bewertet die Belastbarkeit der Datenbasis und verändert den Security Score nicht direkt.

| Evidence Source | Kind | Confidence | Bewertung |
| --- | --- | ---: | --- |
| `measured` | `technical_evidence` | 100 | technisch gemessen, z. B. WLAN, DMARC, lokale Netzwerkprobe |
| `inferred` | `derived_signal` | 70 | aus technischen Findings abgeleitet |
| `self_reported` | `claim` | 45 | Selbstauskunft, nur unbestätigte Behauptung |
| `not_checked` | `missing` | 0 | Prüfung nicht ausgeführt |
| `unavailable` | `missing` | 0 | technisch nicht verfügbar oder nicht zuverlässig auslesbar |

Selbstauskünfte sind Claims. Sie werden pro Regel auf `SELF_REPORTED_POINT_CAP_RATIO = 0.5` begrenzt. Dadurch können rein selbstberichtete technische Kernkontrollen maximal 50 Prozent ihrer Regelpunkte beitragen. `points_before_evidence_cap` und `evidence_weight_cap_applied` machen den Abzug auditierbar.

Fehlende Evidenz (`not_checked`, `unavailable`) erhält keine Punkte und gilt nicht als bestanden. Ausgeführte technische Prüfungen ohne Befund bleiben positiv bewertbar, sofern die Ergebnisquelle explizit vorliegt, z. B. leere Finding-Listen nach abgeschlossenem Scan.

## Kategoriegewichtung

E-Mail-Sicherheit wurde stärker gewichtet, weil Phishing ein Hauptangriffsvektor für Arztpraxen ist. DSGVO-Dokumentation wurde reduziert, damit Dokumente technische Kontrollen nicht überkompensieren.

| Kategorie | Regeln | Max. Punkte |
| --- | --- | ---: |
| `access_control` | MFA | 15 |
| `backup` | Backup-Frequenz, Restore-Test | 20 |
| `email_security` | DMARC Policy | 15 |
| `updates` | Patchstand | 15 |
| `network` | WLAN, aktive Findings, lokale Probes | 30 |
| `dsgvo` | Schulung, Dokumentation, Verantwortlichkeiten | 20 |

## Berechnungslogik

Vereinfachter TypeScript-Pseudocode:

```ts
rule_results = SCORING_RULES.map(rule => rule.evaluate(checkData));

for (const result of rule_results) {
  if (result.evidence.source in ["not_checked", "unavailable"]) {
    result.points_earned = 0;
    result.passed = false;
  }

  if (result.evidence.source === "self_reported") {
    result.points_before_evidence_cap = result.points_earned;
    result.points_earned = min(result.points_earned, result.points_max * 0.5);
    result.evidence.kind = "claim";
    result.evidence_weight_cap_applied = true;
  }
}

score = round(sum(points_earned) / sum(points_max) * 100);
scores_by_category = groupByCategory(rule_results);
evidence_confidence = weightedAverage(rule.evidence.confidence, rule.points_max);
review_status = hasEvidenceConflict(checkData, rule_results) ? "review_required" : "ok";
ampel = decideAmpel(score, evidence_confidence, scores_by_category, rule_results, review_status);
```

## Ampellogik

Rot:

- `score < 50`.

Grün nur, wenn alle Bedingungen erfüllt sind:

- `score >= 75`.
- `evidence_confidence >= 70`.
- Kategorie-Mindestwerte erfüllt: `backup >= 70`, `access_control >= 70`, `updates >= 70`, `email_security >= 70`.
- Harte Grün-Anforderungen erfüllt:
  - `BACKUP_TESTED`: Backup und Restore-Test belastbar nachgewiesen.
  - `MFA_ENABLED`: MFA technisch gemessen oder belastbar abgeleitet bestätigt.
  - `PATCHING_CURRENT`: Patchstand geprüft, nicht nur behauptet.
  - `DMARC_POLICY`: DMARC technisch geprüft und mindestens `quarantine`.
- Keine kritischen Rot-Befunde in Kernbereichen, z. B. WEP/offenes WLAN, kritische aktive Findings, kritische lokale Netzwerkprobes.
- `review_status === "ok"`.

Gelb:

- `score >= 50`, aber mindestens ein Grün-Gate ist nicht erfüllt.
- Beispiele: hoher Score mit niedriger Evidence Confidence, Kernkategorie unter Mindestwert, kritische Kategorie nur selbstberichtet, Widerspruch zwischen Selbstauskunft und Messung.

Jede Entscheidung landet in `ampel_reasons`. Beispiele für Codes:

- `score_threshold`
- `score_below_yellow_threshold`
- `evidence_confidence_too_low_for_green`
- `category_minimum_failed`
- `green_hard_requirement_failed`
- `core_critical_finding_blocks_green`
- `review_required_blocks_green`
- `evidence_conflict_dmarc`
- `self_reported_claim_capped`

## DSGVO-Wirksamkeitsprüfung

Die DSGVO-Bewertung prüft nicht nur Dokumentenexistenz, sondern Aktualität, Praxisbezug, technische Umsetzung und Nachweisführung.

Bewertungsstufen:

- `0 nicht vorhanden`: keine belastbare Angabe oder Prüfung nicht ausgeführt.
- `1 dokumentiert`: Dokument/Prozess existiert, Umsetzung nicht nachgewiesen.
- `2 technisch umgesetzt`: Maßnahme ist im Praxisbetrieb eingerichtet.
- `3 nachgewiesen und getestet`: aktueller Nachweis liegt vor, Wirksamkeit wurde geprüft.

| Bereich | Prüfkriterien für Stufe 3 |
| --- | --- |
| Verzeichnis von Verarbeitungstätigkeiten | Vollständig für Patientendaten, Abrechnung, Labor, Termin, Kommunikation; in den letzten 12 Monaten geprüft; praxisbezogene Systeme und Empfänger benannt |
| Rechtsgrundlagen/Einwilligungen | Je Verarbeitung dokumentiert; Einwilligungen versioniert; Widerruf praktisch handhabbar; Sonderfälle wie Recall, Newsletter oder Videosprechstunde abgedeckt |
| Auftragsverarbeitung | AVV für IT-Dienstleister, Cloud, Labor, Abrechnung, Termin-/Kommunikationsdienste; Unterauftragsnehmer und TOM-Anlagen geprüft |
| TOMs | Nicht nur Dokument vorhanden; Verschlüsselung, MFA, Patchmanagement, Backup, Rechtekonzept und Protokollierung technisch belegt |
| Zugriffsprotokolle | Patientendatenzugriffe werden protokolliert; Stichprobenprüfung möglich; Aufbewahrung und Zugriff auf Logs geregelt |
| Lösch-/Aufbewahrungskonzepte | Fristen je Datenart; Löschläufe oder Archivprozesse nachweisbar; Ausnahmen dokumentiert |
| Backup/Wiederherstellung | Verfügbarkeit und Integrität belegt; Restore-Test mit Datum, Ergebnis, Umfang und Verantwortlichem |
| Datenschutzverletzungen | Meldeprozess mit 72-Stunden-Frist, Rollen, Eskalationsweg, Vorlagen und Test/Übung |
| Betroffenenrechte | Auskunft, Berichtigung, Löschung, Einschränkung und Datenübertragbarkeit mit Verantwortlichen, Fristen und Fallnachweisen |
| Rollen-/Berechtigungskonzept | Need-to-know je Rolle; Adminrechte begründet; regelmäßige Rechteprüfung; Austritte/Wechsel abgedeckt |
| Fernwartung/externe Zugriffe | MFA, Protokollierung, explizite Freigabe, zeitliche Begrenzung, Dienstleisterzuordnung |
| Nachweisführung | Screenshots, Config-Exporte, Logs, Verträge, Testprotokolle und Freigaben versioniert und datenschutzarm abgelegt |

DSGVO-Dokumentation kann technische Kontrollen nicht verdrängen. Selbst ein vollständiger DSGVO-Dokumentensatz erzeugt kein Grün, wenn Backup, MFA, Patchstand oder E-Mail-Schutz nicht belastbar nachgewiesen sind.

## Beispielrechnungen

### Beispiel 1: Alter Fall "82 Punkte, überwiegend self_reported"

Alt:

- Positive Fragebogenangaben wurden voll gewertet.
- Ergebnis: `score = 82`, `ampel = grün`.

Neu:

- `self_reported` wird als `claim` mit Confidence 45 behandelt.
- Claim-Punkte werden auf 50 Prozent pro Regel begrenzt.
- Harte Grün-Anforderungen für MFA, Backup und Patchstand sind nicht belastbar erfüllt.
- Ergebnis im typischen Voll-Fragebogenfall: `score = 70`, `evidence_confidence = 65`, `ampel = gelb`.
- Audit-Log enthält u. a. `self_reported_claim_capped`, `evidence_confidence_too_low_for_green`, `green_hard_requirement_failed`.

### Beispiel 2: Belastbar geprüfter Bestfall

Eingaben:

- MFA, Backup/Restore, Patchstand, DSGVO-Nachweise technisch gemessen oder belastbar belegt.
- DMARC technisch geprüft mit `reject`.
- WLAN WPA3, lokale Netzwerkprobes ohne Befund.

Neu:

- `score = 100`.
- `evidence_confidence = 99`, weil eine Aggregation aus Findings als `inferred` zählt.
- Kategorie-Mindestwerte erfüllt.
- Harte Grün-Anforderungen erfüllt.
- Ergebnis: `ampel = grün`.

### Beispiel 3: Hoher Score, aber DMARC-Widerspruch

Eingaben:

- Fragebogen sagt `dmarc_exists = true`.
- Technischer Domain-Check findet keinen DMARC-Record.

Neu:

- DMARC-Regel erhält 0 Punkte aus technischem Befund.
- `review_status = review_required`.
- Ergebnis: höchstens `gelb`, selbst wenn der Gesamtscore rechnerisch hoch bleibt.
- Audit-Log enthält `evidence_conflict_dmarc` und `review_required_blocks_green`.

### Beispiel 4: Kritischer Kernbefund trotz Score >= 75

Eingaben:

- Viele Kontrollen sind gemessen und bestanden.
- WLAN ist `WEP` oder lokale Probes finden einen kritischen Dienst.

Neu:

- Kritischer Kernbefund setzt `core_critical_finding`.
- Grün wird blockiert.
- Audit-Log enthält `core_critical_finding_blocks_green`.

## Lokale Netzwerkprüfungen

Der WLAN-Scanner erzeugt strukturierte `NetworkSecurityFinding`-Objekte für WLAN-Verschlüsselung, WPA3-Empfehlung, Router-HTTP, Telnet, SMB, SMB-Sicherheitsmetadaten, UPnP/SSDP, RDP, Datenbankports, Drucker-, NAS-, Kamera-/IoT-Hinweise, vorsichtige medizinische Geräte-Metadaten, IPv6, DNS-Resolver, DHCP-Konsistenz, Gastnetz-Heuristik, Segmentierungs-Score, Rogue-AP-/Rogue-Device-Hinweise, Router-Firmware-Hinweise, Default-Passwort-Risiko und Firewall-Basischeck. Kritische Dienste wie Telnet, RDP oder offen erreichbare Datenbankports reduzieren den lokalen WLAN-Risikoscore direkt über `scoreImpact`; das globale Scoring berücksichtigt die aggregierten Befunde zusätzlich über `NETWORK_SECURITY_PROBES`.

Die Prüfungen sind local-first und dürfen keine Patientendaten, Dateien, SMB-/NFS-Freigaben, Druckjobs, Datenbankinhalte oder medizinische Protokollinhalte lesen. Nicht verfügbare native Plattformfunktionen werden als `unknown`/`unavailable` dokumentiert und nicht als offene Ports gewertet. WPS wird als `not_supported`/`unavailable` gekennzeichnet, solange der Status technisch nicht zuverlässig auslesbar ist.
