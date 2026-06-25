import { riskColors, type RiskTone } from "@/constants/colors";

export const MONITORING_SCHEDULE = {
  ssl_check: "0 */6 * * *",
  dns_check: "0 */4 * * *",
  port_scan: "0 */12 * * *",
  leak_check: "0 2 * * *",
  reputation_check: "0 3 * * *"
} as const;

export const CRITICAL_ALERTS = [
  "SSL-Zertifikat läuft in 14 Tagen ab",
  "Neuer Datenleck mit Praxis-E-Mail gefunden",
  "DMARC-Eintrag wurde entfernt",
  "Neuer offener kritischer Port erkannt",
  "Domain auf Blacklist eingetragen"
] as const;

export type MonitoringEventType =
  | "ssl_expiry"
  | "dmarc_missing"
  | "leak_detected"
  | "port_open"
  | "domain_blacklisted"
  | "dns_changed"
  | "monitoring_run";

export type MonitoringSeverity = "critical" | "warning" | "info";

export type MonitoringEvent = {
  id: string;
  practice_id: string;
  type: MonitoringEventType;
  severity: MonitoringSeverity;
  title: string;
  message: string;
  details: Record<string, unknown>;
  resolved_at: string | null;
  created_at: string;
};

export type EmailSecurityStatus = {
  spf: boolean;
  dkim: boolean;
  dmarc: boolean;
};

export type MonitoringSnapshot = {
  id: string;
  practice_id: string;
  source: "scheduled" | "manual" | "demo";
  score: number;
  category_scores: Record<string, number>;
  ssl: {
    valid: boolean;
    expires_at: string | null;
    days_remaining: number | null;
    issuer?: string;
    grade?: string;
  };
  email_security: EmailSecurityStatus;
  devices: {
    known: number;
    unknown: number;
  };
  checks: Record<string, unknown>;
  checked_at: string;
};

export type DashboardData = {
  snapshot: MonitoringSnapshot;
  events: MonitoringEvent[];
  history: Array<{ day: string; score: number }>;
};

export const categoryLabels: Record<string, string> = {
  ssl: "SSL/TLS",
  dns: "DNS",
  email: "E-Mail",
  ports: "Ports",
  reputation: "Reputation",
  leaks: "Leaks"
};

export function toneForScore(score: number): RiskTone {
  if (score >= 80) return "safe";
  if (score >= 55) return "warning";
  return "critical";
}

export function colorForScore(score: number) {
  return riskColors[toneForScore(score)];
}
