export type DeletionState = "requested" | "anonymized" | "pending" | "completed";

export type DeletionReport = {
  deletion_id: string;
  practice_id: string;
  requested_at: string;
  state: DeletionState;
  immediate_deletions: string[];
  anonymizations: string[];
  retained_for_legal: string[];
  retention_until: string;
  monitoring_retention_until: string;
  completed_by: "system";
};

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(date.getDate() + days);
  return next;
}
