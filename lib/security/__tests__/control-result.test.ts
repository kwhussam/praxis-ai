import {
  calculateScore,
  controlApplicabilityReviewReasons,
  deriveControlStatus,
  isCountedInScore,
  type Applicability,
  type CheckData,
  type EvidenceSource,
  type RuleEvaluation
} from "@/lib/security/scoring";

// W3-Abnahmekriterium (docs/CONTROL_RESULT_MODEL.md §5.1): die verbindliche Testmatrix.
// Die reinen Ableitungsfunktionen (deriveControlStatus / controlApplicabilityReviewReasons /
// isCountedInScore) sind die zentrale Wahrheit; die Produktionsregeln pflegen keinen zweiten Status.
// Deshalb wird die Matrix auf Funktionsebene vollständig geprüft und über calculateScore für die
// heute produktiv erreichbaren Zustände (met / not_met / unknown / self-report) integriert.
// not_applicable und conditional entstehen erst mit W4 aus einer Produktionsregel; ihre Semantik
// wird hier auf der Ebene geprüft, auf der sie in W3 lebt: den reinen Funktionen und der Aggregation.

describe("deriveControlStatus – §5.1 Statusmatrix", () => {
  const applicable = (over: Partial<{ passed: boolean; source: EvidenceSource }>) =>
    deriveControlStatus({ passed: false, source: "self_reported", applicability: "applicable", ...over });

  it("Eingang leer / nicht geprüft ⇒ unknown (nie not_met)", () => {
    expect(applicable({ source: "not_checked" })).toBe("unknown");
    expect(applicable({ source: "not_checked", passed: true })).toBe("unknown");
  });

  it("Evidenz nicht verfügbar ⇒ unknown", () => {
    expect(applicable({ source: "unavailable" })).toBe("unknown");
  });

  it("anwendbar + bestanden ⇒ met (auch bei Self-Report)", () => {
    expect(applicable({ passed: true, source: "measured" })).toBe("met");
    expect(applicable({ passed: true, source: "self_reported" })).toBe("met");
  });

  it("anwendbar + nicht bestanden mit vorhandener Evidenz ⇒ not_met", () => {
    expect(applicable({ passed: false, source: "self_reported" })).toBe("not_met");
    expect(applicable({ passed: false, source: "measured" })).toBe("not_met");
  });

  it("not_applicable dominiert jeden anderen Zustand", () => {
    expect(
      deriveControlStatus({ passed: true, source: "measured", applicability: "not_applicable" })
    ).toBe("not_applicable");
  });

  it("conditional (ungeklärt) ⇒ unknown, nie not_applicable und nie geraten", () => {
    expect(deriveControlStatus({ passed: true, source: "measured", applicability: "conditional" })).toBe("unknown");
    expect(deriveControlStatus({ passed: false, source: "self_reported", applicability: "conditional" })).toBe(
      "unknown"
    );
  });

  it("leitet partially_met NIEMALS ab (nur explizite Subcontrol-Semantik darf es setzen)", () => {
    const sources: EvidenceSource[] = ["measured", "inferred", "self_reported", "not_checked", "unavailable"];
    const applicabilities: Applicability[] = ["applicable", "not_applicable", "conditional"];
    for (const source of sources) {
      for (const applicability of applicabilities) {
        for (const passed of [true, false]) {
          expect(deriveControlStatus({ passed, source, applicability })).not.toBe("partially_met");
        }
      }
    }
  });
});

describe("controlApplicabilityReviewReasons – §4.2/§4.3 Pflichtgrund", () => {
  it("not_applicable ohne Grund ⇒ review_required-Grund", () => {
    expect(controlApplicabilityReviewReasons({ applicability: "not_applicable" })).toHaveLength(1);
  });

  it("conditional ohne Grund ⇒ review_required-Grund", () => {
    expect(controlApplicabilityReviewReasons({ applicability: "conditional", applicability_reason: "  " })).toHaveLength(
      1
    );
  });

  it("mit dokumentiertem Grund ⇒ kein Review-Grund", () => {
    expect(
      controlApplicabilityReviewReasons({ applicability: "not_applicable", applicability_reason: "Kein TI-Anschluss" })
    ).toHaveLength(0);
  });

  it("applicable braucht nie einen Grund", () => {
    expect(controlApplicabilityReviewReasons({ applicability: "applicable" })).toHaveLength(0);
  });
});

describe("isCountedInScore – §4.2 Nenner-Ausschluss identisch", () => {
  const base = (over: Partial<RuleEvaluation>): RuleEvaluation => ({
    rule_id: "MFA_ENABLED",
    category: "access_control",
    points_earned: 0,
    points_before_evidence_cap: 0,
    points_max: 15,
    passed: false,
    finding: "",
    evidence: "",
    evidence_coverage: { source: "self_reported", kind: "claim", score: 45, confidence: 45, label: "", detail: "" },
    evidence_weight_cap_applied: false,
    review_status: "ok",
    review_reasons: [],
    risk_flags: [],
    ...over
  });

  it("applicable, unknown und conditional bleiben im Score", () => {
    expect(isCountedInScore(base({ applicability: "applicable", status: "met" }))).toBe(true);
    expect(isCountedInScore(base({ applicability: "applicable", status: "unknown" }))).toBe(true);
    expect(isCountedInScore(base({ applicability: "conditional", status: "unknown" }))).toBe(true);
  });

  it("not_applicable wird ausgeschlossen – über applicability oder status", () => {
    expect(isCountedInScore(base({ applicability: "not_applicable", status: "not_applicable" }))).toBe(false);
    expect(isCountedInScore(base({ applicability: "applicable", status: "not_applicable" }))).toBe(false);
  });

  it("alte Payloads ohne neue Felder werden weiter gezählt (Rückwärtskompatibilität)", () => {
    const legacy = base({});
    delete legacy.status;
    delete legacy.applicability;
    expect(isCountedInScore(legacy)).toBe(true);
  });
});

describe("calculateScore – Integration der Matrix (produktiv erreichbare Zustände)", () => {
  const FULL_MET: CheckData = {
    mfa_enabled: true,
    backup_tested: true,
    backup_frequency: "daily",
    dmarc_exists: true,
    updates_current: true,
    staff_training: true,
    privacy_documents_current: true,
    responsibilities_defined: true,
    encryption: "WPA3",
    external: { email_security: { dmarc: { policy: "reject" } } },
    externalFindings: [],
    wlanFindings: [],
    wlanSecurityFindings: []
  };

  it("vollständig erfüllt: jede Regel met/applicable/open, kein not_met", () => {
    const report = calculateScore(FULL_MET);
    for (const rule of report.rule_results) {
      expect(rule.applicability).toBe("applicable");
      expect(rule.disposition).toBe("open");
      expect(rule.status).not.toBe("not_met");
      expect(rule.status).not.toBe("unknown");
    }
  });

  it("leerer Eingang: anwendbare Regeln sind unknown, 0 Punkte, bleiben aber im Nenner", () => {
    const report = calculateScore({});
    const mfa = report.rule_results.find((rule) => rule.rule_id === "MFA_ENABLED");
    expect(mfa?.status).toBe("unknown");
    expect(mfa?.points_earned).toBe(0);
    expect(mfa?.points_max).toBeGreaterThan(0); // unknown senkt den konservativen Score, ist kein not_met
    expect(mfa?.passed).toBe(false);
  });

  it("vollständig nicht erfüllt (mit Evidenz): status not_met und Empfehlung vorhanden", () => {
    const report = calculateScore({ ...FULL_MET, mfa_enabled: false });
    const mfa = report.rule_results.find((rule) => rule.rule_id === "MFA_ENABLED");
    expect(mfa?.status).toBe("not_met");
    expect(typeof mfa?.management_recommendation).toBe("string");
  });

  it("management_recommendation spiegelt recommendation rückwärtskompatibel", () => {
    const report = calculateScore({ ...FULL_MET, mfa_enabled: false });
    for (const rule of report.rule_results) {
      expect(rule.management_recommendation).toBe(rule.recommendation);
    }
  });

  it("kein Regelergebnis gibt technical_action aus (intern, in W3 unbefüllt)", () => {
    const report = calculateScore(FULL_MET);
    for (const rule of report.rule_results) {
      expect(rule.technical_action).toBe(undefined);
    }
  });

  it("Score und Ampel sind für gleiche Eingaben reproduzierbar", () => {
    const a = calculateScore(FULL_MET);
    const b = calculateScore(FULL_MET);
    expect(a.score).toBe(b.score);
    expect(a.ampel).toBe(b.ampel);
    expect(a.scores_by_category).toEqual(b.scores_by_category);
  });
});
