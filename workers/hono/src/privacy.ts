export type DeletionState = "requested" | "anonymized" | "pending" | "completed";

export const RETENTION_PERIODS = {
  audit_logs: 365 * 6,
  security_reports: 365 * 2,
  monitoring_events: 365,
  personal_data: 0
} as const;

export type DeletionReport = {
  deletion_id: string;
  practice_id: string;
  requested_at: string;
  state: DeletionState;
  immediate_deletions: string[];
  anonymizations: string[];
  retained_for_legal: string[];
  retention_until: string;
  completed_by: "system";
};

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(date.getDate() + days);
  return next;
}
