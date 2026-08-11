import type { EvidenceFreshness } from "@/lib/assessment/collection";
import { GREEN_EVIDENCE_CONFIDENCE_MIN, type ScoreReport } from "@/lib/security/scoring";

export type ScoreReportTone = "critical" | "warning" | "safe";

export type ScoreReportPosture = {
  tone: ScoreReportTone;
  coverage: number;
  confidence: number;
  freshness: EvidenceFreshness;
  coverageInsufficient: boolean;
  confidenceInsufficient: boolean;
  reviewRequired: boolean;
  staleEvidence: boolean;
};

export function deriveScoreReportPosture(report: ScoreReport): ScoreReportPosture {
  const coverage = clampPercentage(report.evidence_coverage_score);
  const confidence = clampPercentage(report.evidence_confidence);
  const freshness = aggregateEvidenceFreshness(report);
  const coverageInsufficient = coverage < GREEN_EVIDENCE_CONFIDENCE_MIN;
  const confidenceInsufficient = confidence < GREEN_EVIDENCE_CONFIDENCE_MIN;
  const reviewRequired = report.review_status === "review_required";
  const staleEvidence = freshness === "stale";
  const authoritativeTone = toneFromAmpel(report.ampel);
  const evidenceNeedsReview = coverageInsufficient || confidenceInsufficient || reviewRequired || staleEvidence;

  return {
    tone: authoritativeTone === "safe" && evidenceNeedsReview ? "warning" : authoritativeTone,
    coverage,
    confidence,
    freshness,
    coverageInsufficient,
    confidenceInsufficient,
    reviewRequired,
    staleEvidence
  };
}

export function aggregateEvidenceFreshness(report: ScoreReport): EvidenceFreshness {
  const applicable = report.rule_results.filter((rule) => rule.status !== "not_applicable");
  if (applicable.some((rule) => rule.freshness === "stale")) return "stale";
  if (applicable.length > 0 && applicable.every((rule) => rule.freshness === "fresh")) return "fresh";
  return "unknown";
}

function toneFromAmpel(ampel: ScoreReport["ampel"]): ScoreReportTone {
  if (ampel === "rot") return "critical";
  if (ampel === "grün") return "safe";
  return "warning";
}

function clampPercentage(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}
