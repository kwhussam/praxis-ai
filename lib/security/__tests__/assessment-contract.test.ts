import { toCanonicalAssessmentFacts, toDeterministicReportFacts } from "@/lib/security/assessment-contract";
import {
  GOLDEN_ASSESSMENT_EXPECTED,
  GOLDEN_ASSESSMENT_INPUT,
  GOLDEN_ASSESSMENT_OBSERVED_AT
} from "@/lib/security/__fixtures__/goldenAssessment";
import {
  calculateScore,
  collectionStatusForEvidence,
  deriveControlStatus,
  type CollectionStatus,
  type EvidenceSource
} from "@/lib/security/scoring";

describe("canonical assessment contract", () => {
  it("projects the Golden practice to stable authoritative facts", () => {
    const report = calculateScore(GOLDEN_ASSESSMENT_INPUT);
    const facts = toCanonicalAssessmentFacts(report);

    expect(facts).toMatchObject(GOLDEN_ASSESSMENT_EXPECTED);
    expect(facts.controls).toHaveLength(report.rule_results.length);
    expect(report.rule_results.every((result) => result.observed_at === GOLDEN_ASSESSMENT_OBSERVED_AT)).toBe(true);
    expect(
      facts.controls
        .filter((control) => control.applicability === "applicable")
        .every((control) => control.collection_status === "collected")
    ).toBe(true);
  });

  const evidenceMappings: Array<[EvidenceSource, CollectionStatus]> = [
    ["measured", "collected"],
    ["inferred", "collected"],
    ["self_reported", "collected"],
    ["not_checked", "not_checked"],
    ["unavailable", "unavailable"]
  ];

  evidenceMappings.forEach(([source, expected]) => {
    it(`maps evidence ${source} to collection state ${expected}`, () => {
      expect(collectionStatusForEvidence(source)).toBe(expected);
    });
  });

  const unsuccessfulCollectionStates: CollectionStatus[] = [
    "not_checked",
    "unsupported",
    "permission_denied",
    "timeout",
    "error",
    "unavailable"
  ];

  unsuccessfulCollectionStates.forEach((collectionStatus) => {
    it(`never treats collection state ${collectionStatus} as passed`, () => {
      expect(
        deriveControlStatus({
          passed: true,
          source: "measured",
          applicability: "applicable",
          collectionStatus
        })
      ).toBe("unknown");
    });
  });

  it("carries fact and scoring versions into deterministic reports", () => {
    const scoreReport = calculateScore(GOLDEN_ASSESSMENT_INPUT);
    const facts = toDeterministicReportFacts(scoreReport);

    expect(facts).toMatchObject({
      facts_version: "1.0.0",
      scoring_version: scoreReport.scoring_version,
      assessment_profile: "general",
      overall_risk: "low"
    });
  });

  it("distinguishes high risk from a confirmed critical finding", () => {
    expect(toDeterministicReportFacts(calculateScore({})).overall_risk).toBe("high");
    expect(toDeterministicReportFacts(calculateScore({ encryption: "WEP" })).overall_risk).toBe("critical");
  });
});
