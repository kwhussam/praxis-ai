import type { RiskTone } from "@/constants/colors";
import type { EvidenceFreshness } from "@/lib/assessment/collection";
import { deriveScoreReportPosture } from "@/lib/security/scoreReportPosture";
import type { ScoreReport } from "@/lib/security/scoring";

export { aggregateEvidenceFreshness } from "@/lib/security/scoreReportPosture";

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
  const reportPosture = deriveScoreReportPosture(report);
  const { tone, coverage, confidence, freshness } = reportPosture;

  return {
    tone,
    statusLabel: tone === "critical" ? "Dringender Handlungsbedarf" : tone === "warning" ? "Handlungsbedarf" : "Kein dringender Handlungsbedarf",
    coverage,
    confidence,
    freshness,
    freshnessLabel: freshness === "fresh" ? "Aktuell" : freshness === "stale" ? "Veraltet" : "Nicht vollständig belegt",
    coverageMessage:
      reportPosture.coverageInsufficient
        ? `Nur ${coverage} % der vorgesehenen Evidenz sind abgedeckt. Das Ergebnis ist keine vollständige Entwarnung.`
        : freshness === "stale"
          ? "Mindestens ein Nachweis ist veraltet. Aktualisieren Sie die Prüfung, bevor Sie das Ergebnis als aktuellen Stand verwenden."
          : freshness === "unknown"
            ? `Die Prüfung deckt ${coverage} % der vorgesehenen Evidenz ab. Die Aktualität ist nicht für alle Nachweise belegt.`
            : `Die Prüfung deckt ${coverage} % der vorgesehenen Evidenz ab.`
  };
}
