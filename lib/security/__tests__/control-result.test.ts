import {
  aggregateRuleResults,
  calculateScore,
  controlApplicabilityReviewReasons,
  coreControlReviewReasons,
  deriveControlStatus,
  deriveReportReviewStatus,
  isCountedInScore,
  type Applicability,
  type CheckData,
  type EvidenceCoverage,
  type EvidenceSource,
  type RuleEvaluation,
  type SecurityCategory
} from "@/lib/security/scoring";

// Gemeinsame Fabrik für synthetische RuleEvaluations (für Ebenen, die W3 noch nicht produktiv erreicht).
function makeRule(over: Partial<RuleEvaluation>): RuleEvaluation {
  return {
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
  };
}

function cov(source: EvidenceSource, score: number): EvidenceCoverage {
  return { source, kind: "technical_evidence", score, confidence: score, label: "", detail: "" };
}

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
  it("applicable, unknown und conditional bleiben im Score", () => {
    expect(isCountedInScore(makeRule({ applicability: "applicable", status: "met" }))).toBe(true);
    expect(isCountedInScore(makeRule({ applicability: "applicable", status: "unknown" }))).toBe(true);
    expect(isCountedInScore(makeRule({ applicability: "conditional", status: "unknown" }))).toBe(true);
  });

  it("not_applicable wird ausgeschlossen – über applicability oder status", () => {
    expect(isCountedInScore(makeRule({ applicability: "not_applicable", status: "not_applicable" }))).toBe(false);
    expect(isCountedInScore(makeRule({ applicability: "applicable", status: "not_applicable" }))).toBe(false);
  });

  it("alte Payloads ohne neue Felder werden weiter gezählt (Rückwärtskompatibilität)", () => {
    const legacy = makeRule({});
    delete legacy.status;
    delete legacy.applicability;
    expect(isCountedInScore(legacy)).toBe(true);
  });
});

describe("coreControlReviewReasons – §5.1 P1: Kernkontrolle ohne verfügbare Evidenz", () => {
  it("Kernkontrolle + unavailable ⇒ Review-Grund (Regel-Ebene)", () => {
    expect(
      coreControlReviewReasons({ ruleId: "MFA_ENABLED", status: "unknown", source: "unavailable" })
    ).toHaveLength(1);
    expect(
      coreControlReviewReasons({ ruleId: "BACKUP_TESTED", status: "unknown", source: "unavailable" })
    ).toHaveLength(1);
  });

  it("Kernkontrolle + not_checked ⇒ kein Review (bereits über Green-Hard-Requirement blockiert)", () => {
    expect(
      coreControlReviewReasons({ ruleId: "MFA_ENABLED", status: "unknown", source: "not_checked" })
    ).toHaveLength(0);
  });

  it("Nicht-Kernkontrolle + unavailable ⇒ kein Review", () => {
    expect(
      coreControlReviewReasons({ ruleId: "WLAN_ENCRYPTION", status: "unknown", source: "unavailable" })
    ).toHaveLength(0);
  });

  it("Kernkontrolle mit vorhandener Evidenz ⇒ kein Review", () => {
    expect(coreControlReviewReasons({ ruleId: "MFA_ENABLED", status: "met", source: "measured" })).toHaveLength(0);
  });
});

describe("deriveReportReviewStatus – §5.1 P1: Report-Ebene propagiert Regel-Review", () => {
  it("eine Regel mit review_required ⇒ Report review_required", () => {
    expect(deriveReportReviewStatus([], [makeRule({ review_status: "review_required" })])).toBe("review_required");
  });

  it("Evidenzwiderspruch ⇒ Report review_required", () => {
    expect(
      deriveReportReviewStatus(
        [{ code: "evidence_conflict_dmarc", severity: "warning", message: "" }],
        [makeRule({ review_status: "ok" })]
      )
    ).toBe("review_required");
  });

  it("alles ok ⇒ Report ok", () => {
    expect(deriveReportReviewStatus([], [makeRule({ review_status: "ok" })])).toBe("ok");
  });
});

describe("aggregateRuleResults – §5.1 P2: not_applicable auf allen Aggregationsebenen", () => {
  it("entfernt dieselbe Kontrolle aus total_points, max_points, Kategorie-Max UND Coverage", () => {
    const applicable = makeRule({
      rule_id: "MFA_ENABLED",
      category: "access_control",
      points_earned: 10,
      points_max: 15,
      status: "met",
      applicability: "applicable",
      evidence_coverage: cov("measured", 100)
    });
    const notApplicable = makeRule({
      rule_id: "STAFF_TRAINING",
      category: "access_control",
      points_earned: 7,
      points_max: 7,
      status: "not_applicable",
      applicability: "not_applicable",
      // Ein hoher Coverage-Wert hier würde die Coverage verfälschen, WENN not_applicable fälschlich zählt.
      evidence_coverage: cov("self_reported", 45)
    });

    const withNa = aggregateRuleResults([applicable, notApplicable]);
    const withoutNa = aggregateRuleResults([applicable]);

    expect(withNa.total_points).toBe(withoutNa.total_points);
    expect(withNa.max_points).toBe(withoutNa.max_points);
    expect(withNa.total_points).toBe(10);
    expect(withNa.max_points).toBe(15);
    expect(withNa.scores_by_category.access_control).toBe(withoutNa.scores_by_category.access_control);
    expect(withNa.evidence_coverage_score).toBe(withoutNa.evidence_coverage_score);
    expect(withNa.evidence_coverage_score).toBe(100); // nur die anwendbare, gemessene Kontrolle zählt
  });

  it("Kategorie, in der alle Kontrollen not_applicable sind, ergibt 0 – Consumer müssen den Status prüfen, nicht als 0% lesen", () => {
    const allNa: SecurityCategory = "dsgvo";
    const na = makeRule({
      rule_id: "STAFF_TRAINING",
      category: allNa,
      points_earned: 0,
      points_max: 8,
      status: "not_applicable",
      applicability: "not_applicable"
    });

    const aggregate = aggregateRuleResults([na]);
    expect(aggregate.scores_by_category[allNa]).toBe(0);
    expect(aggregate.max_points).toBe(0);
    expect(aggregate.score).toBe(0);
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
    for (const rule of report.rule_results.filter((result) => result.status !== "not_applicable")) {
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
