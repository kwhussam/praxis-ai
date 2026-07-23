# Control-Result-Modell (W2)

> **Status:** Zielarchitektur-Dokument (Entwurf zur Gegenprüfung durch @Codex).
> **Bezug:** E-007 (additiv + rückwärtskompatibel, Migration zum vollständigen
> `ControlResult`-Modell vorbereiten), D-002.
> **Prinzip:** „not_checked ≠ passing". Unbekannte oder nicht anwendbare
> Kontrollen dürfen niemals stillschweigend als erfüllt gewertet werden.

Dieses Dokument definiert das **Ziel**-Datenmodell für ein Prüfergebnis
(`ControlResult`), das **kleinste additive MVP-Subset**, das jetzt ohne
Schema-Migration eingeführt wird, das **Mapping** vom heutigen Code dorthin, die
**Invarianten**, die **Migrationsphasen** und die **Berichtstrennung** zwischen
Management-Empfehlung und technischer Aktion.

Es ist bewusst so geschnitten, dass das MVP schnell bleibt und trotzdem keine
Sackgasse entsteht: Alle heutigen Felder bleiben lesbar, das Zielmodell ist eine
Obermenge.

---

## 0. Ist-Stand (verifiziert im Code)

Quelle: `lib/security/scoring.ts`, `lib/ai/report.ts` (Stand `SCORING_VERSION = "2.0.0"`).

Heute liefert die Engine pro Regel eine `RuleEvaluation`:

```ts
// lib/security/scoring.ts — Ist
export interface RuleEvaluation {
  rule_id: ScoringRuleId;              // 10 feste IDs, z. B. "MFA_ENABLED"
  category: SecurityCategory;          // access_control | backup | email_security | network | dsgvo | updates
  points_earned: number;
  points_before_evidence_cap: number;
  points_max: number;
  passed: boolean;                     // binär – kein "partially_met", kein "unknown", kein "not_applicable"
  finding: string;
  evidence: string;
  evidence_coverage: EvidenceCoverage; // source/kind/score/confidence/label/detail
  evidence_weight_cap_applied: boolean;
  review_status: ReviewStatus;         // "ok" | "review_required"
  review_reasons: string[];
  risk_flags: string[];
  recommendation?: string;             // optionaler Freitext – nicht getrennt nach Ziel/Empfänger
}

export interface EvidenceCoverage {
  source: EvidenceSource;              // measured | inferred | self_reported | not_checked | unavailable
  kind: EvidenceKind;                  // technical_evidence | derived_signal | claim | missing
  score: number;                       // 0..100
  confidence: number;                  // 0..1
  label: string;
  detail: string;
}
```

**Bekannte Lücken gegenüber dem Ziel (Grund für W2/W3):**

1. **`passed: boolean`** kann „unbekannt" und „teilweise" nicht abbilden. Ein
   nicht geprüfter Punkt ist heute entweder `false` (fälschlich „nicht erfüllt")
   oder wird nur über `evidence_coverage.source = not_checked` transportiert –
   Status und Evidenz sind vermischt.
2. **Keine Anwendbarkeit (`applicability`)** – Profilspezifische Kontrollen
   (Gesundheit) lassen sich nicht sauber als „nicht anwendbar" markieren.
3. **Kein Katalog-Bezug (`control_ids`)** – Empfehlungen sind Freitext, nicht an
   einen versionierten Katalog gebunden.
4. **Kein Zeitbezug (`observed_at`/`expires_at`)** – Re-Test/Ablauf von Evidenz
   ist nicht modelliert.
5. **Kein Empfänger-getrennter Rat** – `recommendation` ist ein einzelner
   String; der Bericht (`lib/ai/report.ts`) kennt `top_risks` und `quick_wins`
   (`action`), aber **keine** Trennung `management_recommendation`
   vs. `technical_action`.
6. **Keine Disposition** – „Risiko akzeptiert / kompensiert / behoben" fehlt.

---

## 1. Vollständiges Ziel-`ControlResult`

Ein `ControlResult` ist das normalisierte Ergebnis **einer** Kontrolle. Score,
Ampel und Coverage bleiben **abgeleitete Ansichten** hierüber (wie heute in
`decideAmpel`), niemals eine zweite maßgebliche Wahrheit.

```ts
// ZIEL – noch nicht implementiert; Referenz für Migration
export interface ControlResult {
  // --- Identität & Katalog ---
  control_id: string;                  // stabiler, versionierter Slug, z. B. "AC.MFA.001"
  control_version: string;             // Katalogversion, deterministisch
  category: SecurityCategory;
  profile_scope: ProfileScope[];       // ["general"] | ["general","health"] – wo die Kontrolle gilt

  // --- Anwendbarkeit ---
  applicability: Applicability;        // applicable | not_applicable | conditional
  applicability_reason?: string;       // Pflicht bei not_applicable/conditional

  // --- Status (getrennt von Evidenz!) ---
  status: ControlStatus;               // met | partially_met | not_met | unknown | not_applicable

  // --- Evidenz (wie heute, unverändert übernommen) ---
  evidence_coverage: EvidenceCoverage; // source/kind/score/confidence/label/detail
  evidence_refs: EvidenceRef[];        // 0..n konkrete Belege (Messung, Attestierung, externer Befund)
  observed_at: string;                 // ISO – wann zuletzt gemessen/erhoben
  expires_at?: string;                 // ISO – ab wann Evidenz als veraltet gilt (Re-Test nötig)

  // --- Risiko (getrennt von Status) ---
  severity: FindingSeverity;           // critical | warning | info – Schwere WENN nicht erfüllt
  likelihood?: "low" | "medium" | "high"; // Eintrittswahrscheinlichkeit, optional

  // --- Bewertung (abgeleitet, für Audit gespeichert) ---
  points_earned: number;
  points_before_evidence_cap: number;
  points_max: number;
  evidence_weight_cap_applied: boolean;

  // --- Empfehlung, getrennt nach Empfänger ---
  management_recommendation?: string;  // was & warum – landet im Kundenbericht
  technical_action?: string;           // wie – INTERN, nie im Kundenbericht

  // --- Lebenszyklus ---
  disposition: Disposition;            // open | remediated | risk_accepted | compensating
  disposition_note?: string;
  disposition_reviewer?: string;       // wer hat akzeptiert/kompensiert markiert
  disposition_at?: string;             // ISO

  // --- Review ---
  review_status: ReviewStatus;         // ok | review_required
  review_reasons: string[];
}

export type ProfileScope = "general" | "health";
export type Applicability = "applicable" | "not_applicable" | "conditional";
export type ControlStatus = "met" | "partially_met" | "not_met" | "unknown" | "not_applicable";
export type Disposition = "open" | "remediated" | "risk_accepted" | "compensating";

export interface EvidenceRef {
  type: "measurement" | "attestation" | "external_finding" | "document";
  source_id: string;                   // z. B. WLAN-Scan-ID, Fragebogen-Key, externer Provider
  observed_at: string;
  detail?: string;                     // KEINE PII/Patientendaten/Screenshots – nur Metadaten
}
```

`EvidenceCoverage`, `SecurityCategory`, `FindingSeverity`, `ReviewStatus`,
`EvidenceSource`, `EvidenceKind` bleiben **exakt** die heutigen Typen aus
`lib/security/scoring.ts` – das Ziel erweitert, ersetzt nicht.

---

## 2. Additiv eingeführtes MVP-Subset

Das MVP führt **keine** neue Datenstruktur ein. Es ergänzt `RuleEvaluation` um
optionale Felder, sodass jeder heutige Leser (`report.ts`, `report-findings.ts`,
`practiceGuidance.ts`, UI) unverändert weiterläuft. Reihenfolge: erst der
P0-Fix (W1, erledigt), dann diese additiven Felder (W3).

```ts
// MVP (W3) – additive Ergänzung an RuleEvaluation, alle optional
export interface RuleEvaluation {
  // ... alle heutigen Felder unverändert ...

  // NEU, optional (fehlend = heutiges Verhalten):
  status?: ControlStatus;              // met | partially_met | not_met | unknown | not_applicable
  applicability?: Applicability;       // default "applicable", wenn fehlt
  control_ids?: string[];              // Katalog-Bezug (mehrere möglich)
  observed_at?: string;                // ISO
  expires_at?: string;                 // ISO
  disposition?: Disposition;           // default "open", wenn fehlt
  management_recommendation?: string;  // ersetzt schrittweise `recommendation`
  technical_action?: string;           // intern
}
```

**Warum additiv und optional:**

- Bestehende Consumer lesen weiter `passed`, `points_earned`, `finding`,
  `recommendation`, `evidence_coverage` – nichts bricht.
- `status` wird zunächst **aus** dem vorhandenen Zustand abgeleitet
  (siehe §4), nicht doppelt gepflegt.
- `management_recommendation` läuft parallel zu `recommendation`, bis alle
  Regeln migriert sind; danach wird `recommendation` entfernt (Phase 3).

Bewusst **Post-MVP** (nicht im Subset): Subcontrol-Ebene, `EvidenceRef[]`,
`likelihood`, getrennte `control_version` je Regel, `disposition_reviewer/at`.
Diese boilen sonst das Modell den Ozean, ohne kurzfristigen MVP-Nutzen.

---

## 3. Mapping Alt → MVP → Ziel

| Konzept | Alt (heute) | MVP (additiv, W3) | Ziel (`ControlResult`) |
|---|---|---|---|
| Kontroll-Identität | `rule_id` (10 feste IDs) | `rule_id` + optional `control_ids[]` | `control_id` + `control_version` |
| Status | `passed: boolean` | `status?: ControlStatus` (abgeleitet) | `status` (Pflicht) |
| Anwendbarkeit | – (implizit „gilt immer") | `applicability?` (default applicable) | `applicability` (Pflicht) + Grund |
| Evidenzquelle | `evidence_coverage.source` | unverändert | unverändert |
| Evidenzbelege | `evidence` (String) | `evidence` (String) | `evidence_refs[]` (strukturiert) |
| Zeitbezug | – | `observed_at?`/`expires_at?` | Pflicht `observed_at`, optional `expires_at` |
| Schwere | `risk_flags[]` (Freitext) | `risk_flags[]` | `severity` + optional `likelihood` |
| Rat (Management) | `recommendation?` (ein String) | `management_recommendation?` | `management_recommendation?` |
| Rat (Technik) | – (nicht getrennt) | `technical_action?` (intern) | `technical_action?` (intern) |
| Lebenszyklus | – | `disposition?` (default open) | `disposition` + Reviewer/Datum |
| Profil | – | über `applicability` | `profile_scope[]` + `applicability` |
| Punkte/Cap | `points_*`, `evidence_weight_cap_applied` | unverändert | unverändert |
| Review | `review_status`, `review_reasons` | unverändert | unverändert |

**Lesart:** Jede Zeile ist entweder identisch (Evidenz, Punkte, Review) oder eine
**Verfeinerung** (String → strukturiert, boolean → Enum). Kein Feld verschwindet
ohne Ersatz; die einzige geplante Entfernung ist `recommendation` → aufgeteilt in
`management_recommendation`/`technical_action` (Phase 3, nach vollständiger
Migration).

---

## 4. Invarianten

Diese Regeln gelten in **allen** Phasen und sind Testgegenstand (W1 hat die
ersten Regressionstests dafür bereits geliefert).

### 4.1 `unknown`

- **Definition:** Die Kontrolle ist anwendbar, aber es liegt keine ausreichende
  Evidenz vor (Gruppe leer oder nur teilweise beantwortet, keine Messung).
- **`status = unknown`** ⟺ `evidence_coverage.source ∈ {not_checked, unavailable}`.
- **Punkte:** `unknown` vergibt **0 erreichte Punkte** und reduziert die
  Coverage, erzeugt aber **keinen** `not_met`-Befund (kein „nicht erfüllt").
  → genau der W1-Fix: teilweise/leer beantwortete Gruppe ⇒ `undefined`
  (`not_checked`), **nicht** `false`.
- **Ableitung im MVP:** `status = unknown`, wenn die Eingangsdaten `undefined`
  sind bzw. `evidence_coverage.source` „not_checked"/„unavailable" ist.

### 4.2 `not_applicable`

- **Definition:** Die Kontrolle gilt für dieses Profil / diese Praxis nicht.
- **`status = not_applicable`** ⟺ `applicability = not_applicable`.
- **Punkte:** zählt **weder** zu `points_max` **noch** zu `points_earned` –
  die Kontrolle wird vollständig aus Nenner und Zähler entfernt. Eine nicht
  anwendbare Kontrolle darf den Score **weder heben noch senken**.
- **Pflicht:** `applicability_reason` muss gesetzt sein (Auditierbarkeit).

### 4.3 Coverage

- `evidence_coverage` bleibt **unabhängig** vom `status`: Status = „was gilt",
  Coverage = „wie sicher wissen wir das".
- Coverage-Score (`evidence_coverage_score` in `ScoreReport`) wird nur über
  **anwendbare** Kontrollen gemittelt (`not_applicable` ausgeschlossen).
- Selbstauskunft bleibt bei max. 50 % der Regelpunkte gedeckelt
  (`evidence_weight_cap_applied`) – unverändert.
- `unknown` senkt Coverage, ist aber kein Malus auf den Sicherheits-Score.

### 4.4 Score & Ampel

- Score = Summe `points_earned` / Summe `points_max` über **anwendbare**
  Kontrollen. Bänder unverändert: grün ≥75, gelb ≥50, rot <50.
- **Grün erfordert** für Kernregeln `measured`/`inferred`-Evidenz – ein grüner
  Score bei überwiegend `unknown`/`self_reported`-Evidenz ist unzulässig und
  muss `review_required` auslösen (heute in `detectReviewReasons`).
- Ampel/Score sind **abgeleitet**; sie werden nie unabhängig persistiert und
  können jederzeit aus den `ControlResult`s neu berechnet werden.
- `scoring_version`/`control_version` werden mitgeschrieben (Auditierbarkeit,
  bestehende Anforderung aus `CLAUDE.md`).

---

## 5. Migrationsphasen & Abwärtskompatibilität

**Phase 0 – P0-Fix (W1, erledigt):** Unknown-vs-Fail in
`questionnaireAnswersToCheckData` korrigiert (`allAnswered`-Gate). Keine
Schema-Änderung.

**Phase 1 – additive Felder (W3):** Optionale Felder an `RuleEvaluation`
(§2). `status`/`applicability`/`disposition` werden **abgeleitet** befüllt.
Bestehende Consumer bleiben unverändert. Neue Tests: leer / teilweise /
vollständig-erfüllt / vollständig-nicht-erfüllt je Aggregat (bereits in W1
angelegt) + `not_applicable` zählt nicht in den Score.

**Phase 2 – Profil-Applicability (W4) + Wizard (W4a):** Engine kennt
`profile_scope`; UI rendert profilabhängig über stabile `section_id`s. Draft-
Speicher gerätegebunden in SecureStore (E-010). Kontrollen außerhalb des Profils
⇒ `applicability = not_applicable`.

**Phase 3 – Katalog & Berichtstrennung (W5):** Versionierter `control_id`-
Katalog; `management_recommendation`/`technical_action` verbindlich getrennt;
`recommendation` (alt) wird entfernt, sobald alle Regeln migriert sind. Bericht
übernimmt nur Katalog-Empfehlungen, `technical_action` bleibt intern.

**Phase 4 – Voll-`ControlResult` (Post-MVP):** `RuleEvaluation` → eigenständiges
`ControlResult` mit `evidence_refs[]`, Subcontrols, `likelihood`. Ein Adapter
`ruleEvaluationToControlResult()` erlaubt Parallelbetrieb; alte persistierte
Reports bleiben über `scoring_version` lesbar.

**Abwärtskompatibilität – Garantien:**

- Jedes neue Feld ist optional; fehlend = heutiges Verhalten.
- Kein bestehendes Feld wird ohne dokumentierten Ersatz entfernt.
- Persistierte Reports tragen `scoring_version`; ein Reader wählt das Mapping
  anhand der Version.
- Score/Ampel jederzeit aus den gespeicherten Kontrollergebnissen reproduzierbar.

---

## 6. Beispiele

### 6.1 Allgemeines Profil – MFA teilweise beantwortet (`unknown`)

```jsonc
{
  "control_id": "AC.MFA.001",
  "category": "access_control",
  "profile_scope": ["general", "health"],
  "applicability": "applicable",
  "status": "unknown",                       // Gruppe nur teilweise beantwortet (W1)
  "evidence_coverage": {
    "source": "not_checked", "kind": "missing",
    "score": 0, "confidence": 0,
    "label": "Nicht geprüft", "detail": "MFA-Fragen unvollständig beantwortet"
  },
  "observed_at": "2026-07-23T10:00:00Z",
  "severity": "critical",
  "points_earned": 0, "points_max": 12,      // zählt in points_max, 0 erreicht
  "management_recommendation": "MFA-Status vollständig erheben und aktivieren.",
  "disposition": "open",
  "review_status": "review_required",
  "review_reasons": ["Kernkontrolle ohne belastbare Evidenz"]
}
```

### 6.2 Gesundheitsprofil – KBV-/Gematik-Kontrolle nicht anwendbar

```jsonc
{
  "control_id": "HC.TI.KIM.001",
  "category": "dsgvo",
  "profile_scope": ["health"],
  "applicability": "not_applicable",
  "applicability_reason": "Praxis ohne TI-Anbindung – Profil 'general' aktiv",
  "status": "not_applicable",
  "evidence_coverage": {
    "source": "unavailable", "kind": "missing",
    "score": 0, "confidence": 0,
    "label": "Nicht verfügbar", "detail": "Kontrolle für dieses Profil nicht relevant"
  },
  "observed_at": "2026-07-23T10:00:00Z",
  "severity": "info",
  "points_earned": 0, "points_max": 0,       // aus Zähler UND Nenner entfernt (§4.2)
  "disposition": "open",
  "review_status": "ok",
  "review_reasons": []
}
```

---

## 7. Berichtstrennung: Management-Empfehlung vs. technische Aktion

Verbindliche Regel (aus D-002, @Hussams Geschäftsmodell):

| Feld | Zielgruppe | Inhalt | Im Kundenbericht? |
|---|---|---|---|
| `management_recommendation` | Praxisinhaber | **Was** & **warum**: Risiko, Auswirkung, empfohlene Maßnahme auf Leitungsebene | **Ja** |
| `technical_action` | @Hussam / IT-Dienstleister | **Wie**: konkrete technische Umsetzung | **Nein – intern** |

**Invarianten für den Bericht (W5):**

- Der Kundenbericht (`lib/ai/report.ts` → `top_risks`, `quick_wins`) übernimmt
  **nur** `management_recommendation` aus einem versionierten `control_id`-
  Katalog. `technical_action` wird **nie** in `Report` serialisiert.
- Beide Felder sind über `control_id` deterministisch versioniert.
- Die KI darf **formulieren oder kürzen**, aber **keine neue technische
  Handlung erfinden** – sie wählt nur aus Katalogeinträgen.
- Das MVP ist kein Remediation-Tool (E-005): Der Bericht erklärt *was & warum*;
  die technische Umsetzung ist eine separate fachliche Leistung.

**Konkrete MVP-Auswirkung auf `lib/ai/report.ts`:** `QuickWin.action` und
`TopRisk` speisen sich künftig aus `management_recommendation`. Ein neues
internes Feld (nicht Teil von `Report`) trägt `technical_action` für die
Berateransicht. Damit kann `technical_action` strukturell gar nicht in den
Kundenbericht gelangen.
