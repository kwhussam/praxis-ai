import {
  collectionStatusForProvider,
  type CollectionStatus,
  type MonitoringProviderState
} from "@/lib/assessment/collection";

export type { MonitoringProviderState } from "@/lib/assessment/collection";
export type MonitoringCoverageStatus = "sufficient" | "insufficient";

export type CollectionCoverage = {
  score: number;
  status: MonitoringCoverageStatus;
  active: number;
  total: number;
  missing: string[];
};

export type MonitoringCoverage = CollectionCoverage;

export const MINIMUM_MONITORING_COVERAGE = 80;

export function calculateCollectionCoverage(statuses: Record<string, CollectionStatus>): CollectionCoverage {
  const entries = Object.entries(statuses);
  const active = entries.filter(([, status]) => status === "collected").length;
  const total = entries.length;
  const score = total === 0 ? 0 : Math.round((active / total) * 100);

  return {
    score,
    status: score >= MINIMUM_MONITORING_COVERAGE ? "sufficient" : "insufficient",
    active,
    total,
    missing: entries.filter(([, status]) => status !== "collected").map(([provider]) => provider)
  };
}

export function calculateMonitoringCoverage(
  statuses: Record<string, MonitoringProviderState>
): MonitoringCoverage {
  return calculateCollectionCoverage(
    Object.fromEntries(
      Object.entries(statuses).map(([provider, status]) => [provider, collectionStatusForProvider(status)])
    )
  );
}
