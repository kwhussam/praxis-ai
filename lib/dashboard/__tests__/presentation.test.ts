import { aggregateEvidenceFreshness, buildDashboardPosture } from "@/lib/dashboard/presentation";
import type { RuleEvaluation, ScoreReport } from "@/lib/security/scoring";

describe("dashboard presentation", () => {
  it("respektiert die autoritative gelbe Ampel trotz hohem Teilscore", () => {
    const posture = buildDashboardPosture(reportFixture({ score: 95, ampel: "gelb", evidence_coverage_score: 50 }));

    expect(posture.tone).toBe("warning");
    expect(posture.statusLabel).toBe("Handlungsbedarf");
    expect(posture.coverageMessage).toContain("keine vollständige Entwarnung");
  });

  it("stuft grün bei unzureichender Evidenz fail-safe auf Handlungsbedarf zurück", () => {
    const posture = buildDashboardPosture(
      reportFixture({ ampel: "grün", evidence_confidence: 60, evidence_coverage_score: 60 })
    );

    expect(posture.tone).toBe("warning");
    expect(posture.coverage).toBe(60);
  });

  it("meldet veraltete Evidenz, sobald ein anwendbarer Nachweis veraltet ist", () => {
    const report = reportFixture({ ampel: "grün" });
    report.rule_results = [ruleFixture("fresh"), ruleFixture("stale")];

    expect(aggregateEvidenceFreshness(report)).toBe("stale");
    expect(buildDashboardPosture(report).freshnessLabel).toBe("Veraltet");
    expect(buildDashboardPosture(report).tone).toBe("warning");
  });
});

function reportFixture(overrides: Partial<ScoreReport> = {}): ScoreReport {
  return {
    score: 90,
    ampel: "grün",
    scoring_version: "test",
    calculated_at: "2026-08-11T08:00:00.000Z",
    ampel_reasons: [],
    evidence_confidence: 90,
    evidence_coverage_score: 90,
    scores_by_category: {
      access_control: 90,
      backup: 90,
      email_security: 90,
      network: 90,
      dsgvo: 90,
      updates: 90
    },
    rule_results: [],
    category_minimums: {},
    review_status: "ok",
    total_points: 90,
    max_points: 100,
    ...overrides
  };
}

function ruleFixture(freshness: RuleEvaluation["freshness"]): RuleEvaluation {
  return {
    rule_id: "MFA_ENABLED",
    category: "access_control",
    points_earned: 10,
    points_before_evidence_cap: 10,
    points_max: 10,
    passed: true,
    finding: "ok",
    evidence: "test",
    evidence_coverage: {
      source: "measured",
      kind: "technical_evidence",
      score: 100,
      confidence: 100,
      label: "Gemessen",
      detail: "Test"
    },
    evidence_weight_cap_applied: false,
    review_status: "ok",
    review_reasons: [],
    risk_flags: [],
    freshness
  };
}
