import type { RiskTone } from "@/constants/colors";
import type { EvidenceFreshness } from "@/lib/assessment/collection";
import { GREEN_EVIDENCE_CONFIDENCE_MIN, type ScoreReport } from "@/lib/security/scoring";

export type DashboardViewMode = "practice" | "technical";

export type DashboardPosture = {
  tone: Exclude<RiskTone, "info">;
  statusLabel: string;
  coverage: number;
  confidence: number;
  freshness: EvidenceFreshness;
  freshnessLabel: string;
  coverageMessage: string;
};

export function buildDashboardPosture(report: ScoreReport): DashboardPosture {
  const coverage = clampPercentage(report.evidence_coverage_score);
  const confidence = clampPercentage(report.evidence_confidence);
  const freshness = aggregateEvidenceFreshness(report);
  const evidenceNeedsReview =
    report.review_status === "review_required" ||
    coverage < GREEN_EVIDENCE_CONFIDENCE_MIN ||
    confidence < GREEN_EVIDENCE_CONFIDENCE_MIN ||
    freshness === "stale";
  const authoritativeTone = toneFromAmpel(report.ampel);
  const tone = authoritativeTone === "safe" && evidenceNeedsReview ? "warning" : authoritativeTone;

  return {
    tone,
    statusLabel: tone === "critical" ? "Dringender Handlungsbedarf" : tone === "warning" ? "Handlungsbedarf" : "Kein dringender Handlungsbedarf",
    coverage,
    confidence,
    freshness,
    freshnessLabel: freshness === "fresh" ? "Aktuell" : freshness === "stale" ? "Veraltet" : "Nicht vollständig belegt",
    coverageMessage:
      coverage < GREEN_EVIDENCE_CONFIDENCE_MIN
        ? `Nur ${coverage} % der vorgesehenen Evidenz sind abgedeckt. Das Ergebnis ist keine vollständige Entwarnung.`
        : freshness === "stale"
          ? "Mindestens ein Nachweis ist veraltet. Aktualisieren Sie die Prüfung, bevor Sie das Ergebnis als aktuellen Stand verwenden."
          : freshness === "unknown"
            ? `Die Prüfung deckt ${coverage} % der vorgesehenen Evidenz ab. Die Aktualität ist nicht für alle Nachweise belegt.`
            : `Die Prüfung deckt ${coverage} % der vorgesehenen Evidenz ab.`
  };
}

export function aggregateEvidenceFreshness(report: ScoreReport): EvidenceFreshness {
  const applicable = report.rule_results.filter((rule) => rule.status !== "not_applicable");
  if (applicable.some((rule) => rule.freshness === "stale")) return "stale";
  if (applicable.length > 0 && applicable.every((rule) => rule.freshness === "fresh")) return "fresh";
  return "unknown";
}

function toneFromAmpel(ampel: ScoreReport["ampel"]): Exclude<RiskTone, "info"> {
  if (ampel === "rot") return "critical";
  if (ampel === "grün") return "safe";
  return "warning";
}

function clampPercentage(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}
