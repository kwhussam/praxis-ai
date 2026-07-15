import type { ScoreReport } from "@/lib/security/scoring";

export type DashboardSecurityCheck = {
  id: string;
  type: string;
  score: number;
  checkedAt: string;
  scoreReport: ScoreReport | null;
  summary: Record<string, unknown>;
};

export type DashboardWlanScan = {
  id: string;
  checkedAt: string;
  riskScore: number | null;
  riskLevel: string | null;
  devicesFound: number;
  networkName: string | null;
  securityProtocol: string | null;
};

export type DashboardMonitoringSnapshot = {
  id: string;
  score: number;
  checkedAt: string;
  source: string;
  categoryScores: Record<string, unknown>;
};

export type DashboardHistoryPoint = {
  id: string;
  source: "security_check" | "monitoring_snapshot";
  type: string;
  score: number;
  checkedAt: string;
};

export type DashboardData = {
  practiceId: string;
  hasData: boolean;
  latest: {
    questionnaire: DashboardSecurityCheck | null;
    external: DashboardSecurityCheck | null;
    wlanScan: DashboardWlanScan | null;
    monitoringSnapshot: DashboardMonitoringSnapshot | null;
  };
  history: DashboardHistoryPoint[];
};
