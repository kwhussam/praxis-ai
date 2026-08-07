export type MonitoringProviderState = "active" | "not_configured" | "unavailable" | "timeout";
export type MonitoringCoverageStatus = "sufficient" | "insufficient";

export type MonitoringCoverage = {
  score: number;
  status: MonitoringCoverageStatus;
  active: number;
  total: number;
  missing: string[];
};

export const MINIMUM_MONITORING_COVERAGE = 80;

export function calculateMonitoringCoverage(
  statuses: Record<string, MonitoringProviderState>
): MonitoringCoverage {
  const entries = Object.entries(statuses);
  const active = entries.filter(([, status]) => status === "active").length;
  const total = entries.length;
  const score = total === 0 ? 0 : Math.round((active / total) * 100);

  return {
    score,
    status: score >= MINIMUM_MONITORING_COVERAGE ? "sufficient" : "insufficient",
    active,
    total,
    missing: entries.filter(([, status]) => status !== "active").map(([provider]) => provider)
  };
}
