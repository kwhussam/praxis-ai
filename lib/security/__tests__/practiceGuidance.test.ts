import { guidanceFromMonitoring, guidanceFromScore, guidanceFromScoreReport } from "@/lib/security/practiceGuidance";
import type { ScoreReport } from "@/lib/security/scoring";

describe("guidanceFromScoreReport", () => {
  it("leitet die Aussage aus der autoritativen Ampel statt nur aus dem Zahlenwert ab", () => {
    const report = scoreReportFixture();
    const guidance = guidanceFromScoreReport(report);

    expect(guidance.tone).toBe("warning");
    expect(guidance.headline).toContain("Handlungsbedarf");
    expect(guidance.summary).toContain("keine vollständige Entwarnung");
    expect(guidance.actions).toHaveLength(3);
  });

  it("formuliert auch bei einem grünen Teilwert keine pauschale Schutzbehauptung", () => {
    const guidance = guidanceFromScore(95);

    expect(guidance.headline).toContain("geprüften Kontrollen");
    expect(guidance.headline).not.toContain("Praxis wirkt");
  });
});

describe("guidanceFromMonitoring", () => {
  it("erteilt bei geringer Messabdeckung keine Entwarnung trotz gutem Teilwert", () => {
    const guidance = guidanceFromMonitoring(100, 0, 33);

    expect(guidance.tone).toBe("warning");
    expect(guidance.headline).toContain("nicht vollständig");
    expect(guidance.summary).toContain("33 %");
    expect(guidance.actions[0]).toContain("Prüfquellen");
  });

  it("nutzt bei ausreichender Abdeckung weiterhin den gemessenen Risikowert", () => {
    const guidance = guidanceFromMonitoring(92, 0, 100);

    expect(guidance.tone).toBe("safe");
  });

  it("priorisiert kritische Alerts auch bei unvollständiger Messabdeckung", () => {
    const guidance = guidanceFromMonitoring(90, 2, 33);

    expect(guidance.tone).toBe("critical");
    expect(guidance.headline).toContain("kritische Warnungen");
    expect(guidance.summary).toContain("33 %");
    expect(guidance.actions[0]).toContain("kritischen Warnungen");
    expect(guidance.actions[1]).toContain("Prüfquellen");
  });
});

function scoreReportFixture(): ScoreReport {
  return {
    score: 95,
    ampel: "gelb",
    scoring_version: "test",
    calculated_at: "2026-08-11T08:00:00.000Z",
    ampel_reasons: [],
    evidence_confidence: 50,
    evidence_coverage_score: 50,
    scores_by_category: {
      access_control: 95,
      backup: 95,
      email_security: 95,
      network: 95,
      dsgvo: 95,
      updates: 95
    },
    rule_results: [],
    category_minimums: {},
    review_status: "ok",
    total_points: 95,
    max_points: 100
  };
}
