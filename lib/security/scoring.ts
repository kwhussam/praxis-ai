export type FindingSeverity = "critical" | "warning" | "info";

export type SecurityFinding = {
  id: string;
  severity: FindingSeverity;
  title: string;
};

export type ScoreInput = {
  questionnaire: Record<string, boolean>;
  externalFindings: SecurityFinding[];
  wlanFindings: SecurityFinding[];
};

const weights: Record<string, number> = {
  backups: 14,
  mfa: 18,
  staffTraining: 12,
  patching: 16,
  dmarc: 14
};

export function calculateShieldScore(input: ScoreInput) {
  const questionnaireScore = Object.entries(input.questionnaire).reduce((sum, [key, enabled]) => {
    return sum + (enabled ? weights[key] ?? 8 : 0);
  }, 18);

  const penalty = [...input.externalFindings, ...input.wlanFindings].reduce((sum, finding) => {
    if (finding.severity === "critical") return sum + 18;
    if (finding.severity === "warning") return sum + 9;
    return sum + 3;
  }, 0);

  return Math.max(0, Math.min(100, Math.round(questionnaireScore - penalty)));
}

export function scoreTone(score: number) {
  if (score >= 80) return "safe";
  if (score >= 55) return "warning";
  return "critical";
}
