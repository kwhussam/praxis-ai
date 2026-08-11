import { buildDashboardPosture } from "@/lib/dashboard/presentation";
import { guidanceFromScoreReport } from "@/lib/security/practiceGuidance";
import { deriveScoreReportPosture } from "@/lib/security/scoreReportPosture";
import type { RuleEvaluation, ScoreReport } from "@/lib/security/scoring";

describe("deriveScoreReportPosture", () => {
  it("ist die gemeinsame Quelle für Dashboard und Praxistext", () => {
    const reports = [
      reportFixture({ ampel: "rot" }),
      reportFixture({ ampel: "gelb", score: 95 }),
      reportFixture({ ampel: "grün" }),
      reportFixture({ ampel: "grün", evidence_coverage_score: 69 }),
      reportFixture({ ampel: "grün", evidence_confidence: 69 }),
      reportFixture({ ampel: "grün", review_status: "review_required" })
    ];
    const stale = reportFixture({ ampel: "grün" });
    stale.rule_results = [ruleFixture("stale")];
    reports.push(stale);

    for (const report of reports) {
      const shared = deriveScoreReportPosture(report);
      expect(buildDashboardPosture(report).tone).toBe(shared.tone);
      expect(guidanceFromScoreReport(report).tone).toBe(shared.tone);
    }
  });

  it("verwendet das zentrale Evidenz-Gate ohne hartkodierte UI-Schwelle", () => {
    expect(deriveScoreReportPosture(reportFixture({ evidence_coverage_score: 70 })).coverageInsufficient).toBe(false);
    expect(deriveScoreReportPosture(reportFixture({ evidence_coverage_score: 69 })).coverageInsufficient).toBe(true);
    expect(deriveScoreReportPosture(reportFixture({ evidence_confidence: 70 })).confidenceInsufficient).toBe(false);
    expect(deriveScoreReportPosture(reportFixture({ evidence_confidence: 69 })).confidenceInsufficient).toBe(true);
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
