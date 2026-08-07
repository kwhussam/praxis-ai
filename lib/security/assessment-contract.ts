import {
  collectionStatusForEvidence,
  type AmpelColor,
  type Applicability,
  type AssessmentProfile,
  type CollectionStatus,
  type ControlStatus,
  type ReviewStatus,
  type ScoreReport,
  type ScoringRuleId,
  type SecurityCategory
} from "@/lib/security/scoring";

export const ASSESSMENT_FACTS_VERSION = "1.0.0";

export type CanonicalControlFact = {
  rule_id: ScoringRuleId;
  applicability: Applicability;
  status: ControlStatus;
  collection_status: CollectionStatus;
  points_earned: number;
  points_max: number;
};

export type CanonicalAssessmentFacts = {
  facts_version: string;
  scoring_version: string;
  assessment_profile: AssessmentProfile;
  score: number;
  ampel: AmpelColor;
  evidence_coverage_score: number;
  evidence_confidence: number;
  review_status: ReviewStatus;
  scores_by_category: Record<SecurityCategory, number>;
  total_points: number;
  max_points: number;
  controls: CanonicalControlFact[];
};

export type DeterministicReportFacts = {
  facts_version: string;
  scoring_version: string;
  assessment_profile: AssessmentProfile;
  security_score: number;
  ampel: AmpelColor;
  overall_risk: "critical" | "high" | "medium" | "low";
  scores_by_category: Record<SecurityCategory, number>;
  dsgvo_compliance: {
    status: "nicht_konform" | "teilweise" | "konform";
    missing_documents: string[];
    liability_risk: string;
  };
};

/**
 * Stable projection used by App, Worker, reports and Golden fixtures.
 * Narrative text and timestamps are intentionally excluded: they are not
 * authoritative security facts and must not change the assessment identity.
 */
export function toCanonicalAssessmentFacts(report: ScoreReport): CanonicalAssessmentFacts {
  return {
    facts_version: ASSESSMENT_FACTS_VERSION,
    scoring_version: report.scoring_version,
    assessment_profile: report.assessment_profile ?? "general",
    score: report.score,
    ampel: report.ampel,
    evidence_coverage_score: report.evidence_coverage_score,
    evidence_confidence: report.evidence_confidence,
    review_status: report.review_status,
    scores_by_category: report.scores_by_category,
    total_points: report.total_points,
    max_points: report.max_points,
    controls: report.rule_results.map((result) => ({
      rule_id: result.rule_id,
      applicability: result.applicability ?? "applicable",
      status: result.status ?? (result.passed ? "met" : "not_met"),
      collection_status:
        result.evidence_coverage.collection_status ?? collectionStatusForEvidence(result.evidence_coverage.source),
      points_earned: result.points_earned,
      points_max: result.points_max
    }))
  };
}

/** Compatibility projection for the current report schema. These fields are
 * computed from the scoring engine and must never be accepted from an LLM.
 * `konform` is intentionally never emitted: the assessment is technical
 * evidence, not a legal conformity decision.
 */
export function toDeterministicReportFacts(report: ScoreReport): DeterministicReportFacts {
  const privacyControl = report.rule_results.find((result) => result.rule_id === "PRIVACY_DOCUMENTATION");
  const privacyMissing = privacyControl?.status !== "met";

  return {
    facts_version: ASSESSMENT_FACTS_VERSION,
    scoring_version: report.scoring_version,
    assessment_profile: report.assessment_profile ?? "general",
    security_score: report.score,
    ampel: report.ampel,
    overall_risk: overallRiskFromReport(report),
    scores_by_category: report.scores_by_category,
    dsgvo_compliance: {
      status: report.scores_by_category.dsgvo < 50 ? "nicht_konform" : "teilweise",
      missing_documents: privacyMissing ? ["Datenschutz- und TOM-Nachweise sind nicht vollständig belegt."] : [],
      liability_risk:
        "Technischer Nachweisstand zum Bewertungszeitpunkt; keine Rechtsberatung und keine Feststellung vollständiger DSGVO-Konformität."
    }
  };
}

function overallRiskFromReport(report: ScoreReport): DeterministicReportFacts["overall_risk"] {
  if (report.rule_results.some((result) => result.risk_flags.includes("core_critical_finding"))) return "critical";
  if (report.ampel === "rot") return "high";
  if (report.ampel === "gelb") return "medium";
  return "low";
}
