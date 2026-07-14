import type { NetworkSecurityFinding } from "@/lib/security/networkProbeTypes";
import { questionnaireAnswersToCheckData, type QuestionnaireAnswerValue } from "@/lib/security/questionnaire";

export const SCORING_VERSION = "2.0.0";

export type FindingSeverity = "critical" | "warning" | "info";
export type AmpelColor = "rot" | "gelb" | "grün";
export type SecurityCategory = "access_control" | "backup" | "email_security" | "network" | "dsgvo" | "updates";
export type EvidenceSource = "measured" | "inferred" | "self_reported" | "not_checked" | "unavailable";
export type EvidenceKind = "technical_evidence" | "derived_signal" | "claim" | "missing";
export type ReviewStatus = "ok" | "review_required";
export type ScoringRuleId =
  | "MFA_ENABLED"
  | "BACKUP_TESTED"
  | "DMARC_POLICY"
  | "PATCHING_CURRENT"
  | "WLAN_ENCRYPTION"
  | "STAFF_TRAINING"
  | "PRIVACY_DOCUMENTATION"
  | "SECURITY_RESPONSIBILITIES"
  | "ACTIVE_FINDINGS"
  | "NETWORK_SECURITY_PROBES";

export type AmpelDecisionReason = {
  code: string;
  severity: "info" | "warning" | "critical";
  message: string;
  category?: SecurityCategory;
  rule_id?: ScoringRuleId;
  threshold?: number;
  actual?: number;
};

export type SecurityFinding = {
  id: string;
  severity: FindingSeverity;
  title: string;
};

export type ScoreInput = {
  questionnaire: Record<string, QuestionnaireAnswerValue>;
  encryption?: CheckData["encryption"];
  externalFindings?: SecurityFinding[];
  wlanFindings?: SecurityFinding[];
  wlanSecurityFindings?: NetworkSecurityFinding[];
};

export type CheckData = {
  mfa_enabled?: boolean;
  backup_tested?: boolean;
  backup_frequency?: "none" | "weekly" | "daily";
  dmarc_exists?: boolean;
  updates_current?: boolean;
  staff_training?: boolean;
  privacy_documents_current?: boolean;
  responsibilities_defined?: boolean;
  encryption?: "WEP" | "WPA" | "WPA2" | "WPA3" | "OPEN" | "UNKNOWN";
  external?: {
    email_security?: {
      dmarc?: {
        policy?: "none" | "quarantine" | "reject" | null;
      };
    };
  };
  externalFindings?: SecurityFinding[];
  wlanFindings?: SecurityFinding[];
  wlanSecurityFindings?: NetworkSecurityFinding[];
  evidence_sources?: Partial<Record<ScoringRuleId, EvidenceSource>>;
};

export interface RuleEvaluation {
  rule_id: ScoringRuleId;
  category: SecurityCategory;
  points_earned: number;
  points_before_evidence_cap: number;
  points_max: number;
  passed: boolean;
  finding: string;
  evidence: string;
  evidence_coverage: EvidenceCoverage;
  evidence_weight_cap_applied: boolean;
  review_status: ReviewStatus;
  review_reasons: string[];
  risk_flags: string[];
  recommendation?: string;
}

export interface EvidenceCoverage {
  source: EvidenceSource;
  kind: EvidenceKind;
  score: number;
  confidence: number;
  label: string;
  detail: string;
}

export interface ScoringRule {
  id: string;
  category: SecurityCategory;
  weight: number;
  max_points: number;
  evaluate: (data: CheckData) => RuleEvaluation;
}

export type ScoreReport = {
  score: number;
  scoring_version: string;
  calculated_at: string;
  ampel: AmpelColor;
  ampel_reasons: AmpelDecisionReason[];
  evidence_confidence: number;
  rule_results: RuleEvaluation[];
  scores_by_category: Record<SecurityCategory, number>;
  evidence_coverage_score: number;
  category_minimums: Partial<Record<SecurityCategory, number>>;
  review_status: ReviewStatus;
  total_points: number;
  max_points: number;
};

export const EVIDENCE_SOURCE_LABELS: Record<EvidenceSource, string> = {
  measured: "Gemessen",
  inferred: "Abgeleitet",
  self_reported: "Selbstauskunft",
  not_checked: "Nicht geprüft",
  unavailable: "Nicht verfügbar"
};

export const EVIDENCE_SOURCE_SCORES: Record<EvidenceSource, number> = {
  measured: 100,
  inferred: 70,
  self_reported: 45,
  not_checked: 0,
  unavailable: 0
};

export const SELF_REPORTED_POINT_CAP_RATIO = 0.5;
export const GREEN_EVIDENCE_CONFIDENCE_MIN = 70;
export const CATEGORY_MINIMUM_SCORES: Partial<Record<SecurityCategory, number>> = {
  access_control: 70,
  backup: 70,
  updates: 70,
  email_security: 70
};

const GREEN_HARD_REQUIREMENTS: Array<{
  ruleId: ScoringRuleId;
  category: SecurityCategory;
  message: string;
}> = [
  {
    ruleId: "BACKUP_TESTED",
    category: "backup",
    message: "Backup und Restore-Test müssen belastbar nachgewiesen sein."
  },
  {
    ruleId: "MFA_ENABLED",
    category: "access_control",
    message: "MFA muss technisch gemessen oder belastbar abgeleitet bestätigt sein."
  },
  {
    ruleId: "PATCHING_CURRENT",
    category: "updates",
    message: "Patchstand muss geprüft und nicht nur behauptet sein."
  },
  {
    ruleId: "DMARC_POLICY",
    category: "email_security",
    message: "E-Mail-Schutz muss technisch geprüft sein, mindestens DMARC quarantine/reject."
  }
];

export const SCORING_RULES: ScoringRule[] = [
  {
    id: "MFA_ENABLED",
    category: "access_control",
    weight: 15,
    max_points: 15,
    evaluate: (data) => buildResult({
      data,
      ruleId: "MFA_ENABLED",
      category: "access_control",
      earned: data.mfa_enabled ? 15 : 0,
      max: 15,
      passed: data.mfa_enabled === true,
      finding: data.mfa_enabled ? "MFA ist aktiviert." : "MFA ist nicht aktiv.",
      evidence: `questionnaire.mfa_enabled=${String(data.mfa_enabled)}`,
      evidenceCoverage: booleanCoverage(data, "MFA_ENABLED", data.mfa_enabled, "MFA-Status wurde im Fragebogen erfasst."),
      recommendation: "Microsoft Authenticator oder FIDO2-Schlüssel für alle Praxiszugänge aktivieren."
    })
  },
  {
    id: "BACKUP_TESTED",
    category: "backup",
    weight: 20,
    max_points: 20,
    evaluate: (data) => {
      const frequency = data.backup_frequency ?? "none";
      const earned = frequency === "daily" && data.backup_tested ? 20 : frequency === "daily" ? 12 : frequency === "weekly" ? 8 : 0;
      return buildResult({
        data,
        ruleId: "BACKUP_TESTED",
        category: "backup",
        earned,
        max: 20,
        passed: frequency === "daily" && data.backup_tested === true,
        finding: `Backup-Frequenz: ${frequency}, Restore-Test: ${String(data.backup_tested)}.`,
        evidence: `questionnaire.backup_frequency=${frequency}; questionnaire.backup_tested=${String(data.backup_tested)}`,
        evidenceCoverage: data.backup_frequency !== undefined || data.backup_tested !== undefined
          ? coverage(evidenceSourceFor(data, "BACKUP_TESTED", "self_reported"), "Backup-Frequenz und Restore-Test wurden per Fragebogen erfasst.")
          : coverage("not_checked", "Es liegen keine Backup-Angaben vor."),
        recommendation: "Tägliche Backups mit quartalsweisem Restore-Test dokumentieren."
      });
    }
  },
  {
    id: "DMARC_POLICY",
    category: "email_security",
    weight: 15,
    max_points: 15,
    evaluate: (data) => {
      const policy = data.external?.email_security?.dmarc?.policy ?? (data.dmarc_exists ? "none" : null);
      const hasExternalEvidence = data.external?.email_security?.dmarc !== undefined;
      const earned = policy === "reject" ? 15 : policy === "quarantine" ? 11 : policy === "none" ? 4 : 0;
      return buildResult({
        data,
        ruleId: "DMARC_POLICY",
        category: "email_security",
        earned,
        max: 15,
        passed: policy === "reject" || policy === "quarantine",
        finding: `DMARC Policy: ${policy ?? "fehlt"}.`,
        evidence: `external.email_security.dmarc.policy=${policy ?? "null"}`,
        evidenceCoverage: hasExternalEvidence
          ? coverage("measured", "DMARC wurde über den externen Domain-Check geprüft.")
          : booleanCoverage(data, "DMARC_POLICY", data.dmarc_exists, "DMARC wurde per Fragebogen erfasst."),
        recommendation: "DMARC mit Reporting veröffentlichen und auf quarantine oder reject härten."
      });
    }
  },
  {
    id: "PATCHING_CURRENT",
    category: "updates",
    weight: 15,
    max_points: 15,
    evaluate: (data) => buildResult({
      data,
      ruleId: "PATCHING_CURRENT",
      category: "updates",
      earned: data.updates_current ? 15 : 0,
      max: 15,
      passed: data.updates_current === true,
      finding: data.updates_current ? "Updates sind aktuell." : "Updates sind nicht nachweislich aktuell.",
      evidence: `questionnaire.updates_current=${String(data.updates_current)}`,
      evidenceCoverage: booleanCoverage(data, "PATCHING_CURRENT", data.updates_current, "Update-Prozess wurde im Fragebogen erfasst."),
      recommendation: "Patch-Fenster und Verantwortliche dokumentieren."
    })
  },
  {
    id: "WLAN_ENCRYPTION",
    category: "network",
    weight: 15,
    max_points: 15,
    evaluate: (data) => {
      const protocol = data.encryption ?? "UNKNOWN";
      const earned = protocol === "WPA3" ? 15 : protocol === "WPA2" ? 12 : protocol === "WPA" ? 5 : 0;
      return buildResult({
        data,
        ruleId: "WLAN_ENCRYPTION",
        category: "network",
        earned,
        max: 15,
        passed: protocol === "WPA2" || protocol === "WPA3",
        finding: `WLAN-Verschlüsselung: ${protocol}.`,
        evidence: `wlan.security_protocol=${protocol}`,
        evidenceCoverage:
          data.encryption === undefined
            ? coverage("not_checked", "WLAN-Verschlüsselung wurde nicht geprüft.")
            : data.encryption !== "UNKNOWN"
              ? coverage(evidenceSourceFor(data, "WLAN_ENCRYPTION", "measured"), "WLAN-Verschlüsselung wurde technisch aus dem Scan übernommen.")
              : coverage("unavailable", "WLAN-Verschlüsselung konnte nicht zuverlässig ausgelesen werden."),
        riskFlags: protocol === "WEP" || protocol === "OPEN" ? ["core_critical_finding"] : [],
        recommendation: "WPA3 oder mindestens WPA2-AES aktivieren; WEP und offene WLANs sofort ersetzen."
      });
    }
  },
  {
    id: "STAFF_TRAINING",
    category: "dsgvo",
    weight: 7,
    max_points: 7,
    evaluate: (data) => buildResult({
      data,
      ruleId: "STAFF_TRAINING",
      category: "dsgvo",
      earned: data.staff_training ? 7 : 0,
      max: 7,
      passed: data.staff_training === true,
      finding: data.staff_training ? "Schulung ist dokumentiert." : "Keine aktuelle Schulungsdokumentation.",
      evidence: `questionnaire.staff_training=${String(data.staff_training)}`,
      evidenceCoverage: booleanCoverage(data, "STAFF_TRAINING", data.staff_training, "Schulungsstatus wurde im Fragebogen erfasst."),
      recommendation: "Jährliche Datenschutz- und Phishing-Schulung mit Teilnehmerliste dokumentieren."
    })
  },
  {
    id: "PRIVACY_DOCUMENTATION",
    category: "dsgvo",
    weight: 8,
    max_points: 8,
    evaluate: (data) => buildResult({
      data,
      ruleId: "PRIVACY_DOCUMENTATION",
      category: "dsgvo",
      earned: data.privacy_documents_current ? 8 : 0,
      max: 8,
      passed: data.privacy_documents_current === true,
      finding: data.privacy_documents_current ? "DSGVO-Dokumente sind aktuell." : "DSGVO-Dokumente sind nicht vollständig aktuell.",
      evidence: `questionnaire.privacy_documents_current=${String(data.privacy_documents_current)}`,
      evidenceCoverage: booleanCoverage(data, "PRIVACY_DOCUMENTATION", data.privacy_documents_current, "DSGVO-Dokumentationsstatus wurde im Fragebogen erfasst."),
      recommendation: "AVV, TOMs, Löschkonzept und Verarbeitungsverzeichnis prüfen."
    })
  },
  {
    id: "SECURITY_RESPONSIBILITIES",
    category: "dsgvo",
    weight: 5,
    max_points: 5,
    evaluate: (data) => buildResult({
      data,
      ruleId: "SECURITY_RESPONSIBILITIES",
      category: "dsgvo",
      earned: data.responsibilities_defined ? 5 : 0,
      max: 5,
      passed: data.responsibilities_defined === true,
      finding: data.responsibilities_defined
        ? "IT-/Datenschutz-Verantwortlichkeiten sind dokumentiert."
        : "IT-/Datenschutz-Verantwortlichkeiten sind nicht vollständig dokumentiert.",
      evidence: `questionnaire.responsibilities_defined=${String(data.responsibilities_defined)}`,
      evidenceCoverage: booleanCoverage(data, "SECURITY_RESPONSIBILITIES", data.responsibilities_defined, "Verantwortlichkeiten wurden per Fragebogen mit Dokumentationsnachweis erfasst."),
      recommendation: "Verantwortliche, Vertretung und Eskalationswege schriftlich festlegen."
    })
  },
  {
    id: "ACTIVE_FINDINGS",
    category: "network",
    weight: 5,
    max_points: 5,
    evaluate: (data) => {
      const findings = [...(data.externalFindings ?? []), ...(data.wlanFindings ?? [])];
      const hasFindingInputs = Array.isArray(data.externalFindings) || Array.isArray(data.wlanFindings);
      const critical = findings.filter((finding) => finding.severity === "critical").length;
      const warning = findings.filter((finding) => finding.severity === "warning").length;
      const earned = hasFindingInputs ? Math.max(0, 5 - critical * 3 - warning) : 0;
      return buildResult({
        data,
        ruleId: "ACTIVE_FINDINGS",
        category: "network",
        earned,
        max: 5,
        passed: hasFindingInputs && critical === 0 && warning === 0,
        finding: hasFindingInputs
          ? `${critical} kritische und ${warning} mittlere aktive Findings.`
          : "Aktive Findings wurden nicht bewertet, weil keine Finding-Quellen vorliegen.",
        evidence: `findings.critical=${critical}; findings.warning=${warning}`,
        evidenceCoverage: hasFindingInputs
          ? coverage("inferred", "Aktive Findings wurden aus technischen Prüf- und Scanbefunden abgeleitet.")
          : coverage("not_checked", "Es liegen keine Finding-Quellen für diese Aggregation vor."),
        riskFlags: critical > 0 ? ["core_critical_finding"] : [],
        recommendation: "Aktive Findings nach Kritikalität abarbeiten und erneut prüfen."
      });
    }
  },
  {
    id: "NETWORK_SECURITY_PROBES",
    category: "network",
    weight: 10,
    max_points: 10,
    evaluate: (data) => {
      const findings = data.wlanSecurityFindings ?? [];
      const hasProbeInput = Array.isArray(data.wlanSecurityFindings);
      const detected = findings.filter((finding) => finding.detected);
      const penalty = Math.min(
        10,
        detected.reduce((sum, finding) => {
          if (finding.severity === "critical") return sum + 5;
          if (finding.severity === "high") return sum + 4;
          if (finding.severity === "medium") return sum + 2;
          return sum + 1;
        }, 0)
      );
      const earned = hasProbeInput ? Math.max(0, 10 - penalty) : 0;
      const critical = detected.filter((finding) => finding.severity === "critical").length;
      const warning = detected.length - critical;

      return buildResult({
        data,
        ruleId: "NETWORK_SECURITY_PROBES",
        category: "network",
        earned,
        max: 10,
        passed: hasProbeInput && critical === 0 && warning === 0,
        finding:
          !hasProbeInput
            ? "Erweiterte lokale Netzwerkprüfungen wurden nicht ausgeführt."
            : findings.length === 0
              ? "Erweiterte lokale Netzwerkprüfungen wurden ohne Befund ausgeführt."
            : `${critical} kritische und ${warning} weitere lokale Netzwerkbefunde.`,
        evidence: `wlanSecurityFindings.detected=${detected.length}; wlanSecurityFindings.critical=${critical}`,
        evidenceCoverage: hasProbeInput
          ? coverage("measured", "Erweiterte lokale Netzwerkprüfungen wurden technisch ausgeführt.")
          : coverage("not_checked", "Erweiterte lokale Netzwerkprüfungen wurden nicht ausgeführt oder nicht übergeben."),
        riskFlags: critical > 0 ? ["core_critical_finding"] : [],
        recommendation: "Telnet/RDP deaktivieren, Router-HTTP auf HTTPS umstellen, SMB absichern und UPnP nur bei zwingendem Bedarf erlauben."
      });
    }
  }
];

export function calculateScore(data: CheckData): ScoreReport {
  const ruleResults = SCORING_RULES.map((rule) => rule.evaluate(data));
  const totalPoints = ruleResults.reduce((sum, result) => sum + result.points_earned, 0);
  const maxPoints = ruleResults.reduce((sum, result) => sum + result.points_max, 0);
  const score = maxPoints === 0 ? 0 : Math.round((totalPoints / maxPoints) * 100);
  const scoresByCategory = groupByCategory(ruleResults);
  const evidenceConfidence = groupEvidenceCoverage(ruleResults);
  const reviewReasons = detectReviewReasons(data, ruleResults);
  const reviewStatus: ReviewStatus =
    reviewReasons.some((reason) => reason.code.startsWith("evidence_conflict_")) ||
    ruleResults.some((result) => result.review_status === "review_required")
      ? "review_required"
      : "ok";
  const ampelDecision = decideAmpel({
    score,
    scoresByCategory,
    evidenceConfidence,
    reviewStatus,
    reviewReasons,
    ruleResults
  });

  return {
    score,
    scoring_version: SCORING_VERSION,
    calculated_at: new Date().toISOString(),
    ampel: ampelDecision.ampel,
    ampel_reasons: ampelDecision.reasons,
    evidence_confidence: evidenceConfidence,
    rule_results: ruleResults,
    scores_by_category: scoresByCategory,
    evidence_coverage_score: evidenceConfidence,
    category_minimums: CATEGORY_MINIMUM_SCORES,
    review_status: reviewStatus,
    total_points: totalPoints,
    max_points: maxPoints
  };
}

export function calculateShieldScore(input: ScoreInput) {
  return calculateScore(scoreInputToCheckData(input)).score;
}

export function scoreTone(score: number) {
  if (score >= 80) return "safe";
  if (score >= 55) return "warning";
  return "critical";
}

function scoreInputToCheckData(input: ScoreInput): CheckData {
  return {
    ...questionnaireAnswersToCheckData(input.questionnaire),
    encryption: input.encryption,
    externalFindings: input.externalFindings,
    wlanFindings: input.wlanFindings,
    wlanSecurityFindings: input.wlanSecurityFindings
  };
}

function groupByCategory(results: RuleEvaluation[]): Record<SecurityCategory, number> {
  const categories: SecurityCategory[] = ["access_control", "backup", "email_security", "network", "dsgvo", "updates"];

  return Object.fromEntries(
    categories.map((category) => {
      const categoryResults = results.filter((result) => result.category === category);
      const earned = categoryResults.reduce((sum, result) => sum + result.points_earned, 0);
      const max = categoryResults.reduce((sum, result) => sum + result.points_max, 0);
      return [category, max === 0 ? 0 : Math.round((earned / max) * 100)];
    })
  ) as Record<SecurityCategory, number>;
}

function groupEvidenceCoverage(results: RuleEvaluation[]) {
  const maxPoints = results.reduce((sum, result) => sum + result.points_max, 0);
  if (maxPoints === 0) return 0;

  const weightedCoverage = results.reduce(
    (sum, result) => sum + result.evidence_coverage.score * result.points_max,
    0
  );
  return Math.round(weightedCoverage / maxPoints);
}

function buildResult(input: {
  data: CheckData;
  ruleId: ScoringRuleId;
  category: SecurityCategory;
  earned: number;
  max: number;
  passed: boolean;
  finding: string;
  evidence: string;
  evidenceCoverage: EvidenceCoverage;
  recommendation: string;
  riskFlags?: string[];
}): RuleEvaluation {
  const missingEvidence = input.evidenceCoverage.source === "not_checked" || input.evidenceCoverage.source === "unavailable";
  const rawPoints = missingEvidence ? 0 : Math.max(0, Math.min(input.max, input.earned));
  const cappedPoints =
    input.evidenceCoverage.source === "self_reported"
      ? Math.min(rawPoints, input.max * SELF_REPORTED_POINT_CAP_RATIO)
      : rawPoints;
  const capApplied = cappedPoints < rawPoints;
  const reviewReasons = capApplied
    ? [`Selbstauskunft wird als Claim behandelt und auf ${SELF_REPORTED_POINT_CAP_RATIO * 100}% der Regelpunkte begrenzt.`]
    : [];

  return {
    rule_id: input.ruleId,
    category: input.category,
    points_earned: cappedPoints,
    points_before_evidence_cap: rawPoints,
    points_max: input.max,
    passed: missingEvidence ? false : input.passed,
    finding: input.finding,
    evidence: input.evidence,
    evidence_coverage: input.evidenceCoverage,
    evidence_weight_cap_applied: capApplied,
    review_status: "ok",
    review_reasons: reviewReasons,
    risk_flags: input.riskFlags ?? [],
    recommendation: missingEvidence || !input.passed || capApplied ? input.recommendation : undefined
  };
}

function booleanCoverage(data: CheckData, ruleId: ScoringRuleId, value: boolean | undefined, detail: string) {
  return value === undefined
    ? coverage("not_checked", "Für dieses Prüfmodul liegt keine Angabe vor.")
    : coverage(evidenceSourceFor(data, ruleId, "self_reported"), detail);
}

function coverage(source: EvidenceSource, detail: string): EvidenceCoverage {
  const score = EVIDENCE_SOURCE_SCORES[source];
  return {
    source,
    kind: evidenceKind(source),
    score,
    confidence: score,
    label: EVIDENCE_SOURCE_LABELS[source],
    detail
  };
}

function evidenceSourceFor(data: CheckData, ruleId: ScoringRuleId, fallback: EvidenceSource) {
  return data.evidence_sources?.[ruleId] ?? fallback;
}

function evidenceKind(source: EvidenceSource): EvidenceKind {
  if (source === "measured") return "technical_evidence";
  if (source === "inferred") return "derived_signal";
  if (source === "self_reported") return "claim";
  return "missing";
}

function detectReviewReasons(data: CheckData, results: RuleEvaluation[]): AmpelDecisionReason[] {
  const reasons: AmpelDecisionReason[] = [];
  const dmarc = data.external?.email_security?.dmarc;

  if (data.dmarc_exists !== undefined && dmarc !== undefined) {
    const measuredExists = dmarc.policy !== undefined && dmarc.policy !== null;
    if (data.dmarc_exists !== measuredExists) {
      reasons.push({
        code: "evidence_conflict_dmarc",
        severity: "warning",
        category: "email_security",
        rule_id: "DMARC_POLICY",
        message: `Widerspruch zwischen Selbstauskunft DMARC=${String(data.dmarc_exists)} und technischem DMARC-Befund=${String(measuredExists)}.`
      });
    }
  }

  results
    .filter((result) => result.evidence_weight_cap_applied)
    .forEach((result) => {
      reasons.push({
        code: "self_reported_claim_capped",
        severity: "info",
        category: result.category,
        rule_id: result.rule_id,
        threshold: Math.round(result.points_max * SELF_REPORTED_POINT_CAP_RATIO),
        actual: result.points_earned,
        message: `${result.rule_id}: Selbstauskunft ist ein Claim und wurde auf maximal ${SELF_REPORTED_POINT_CAP_RATIO * 100}% der Regelpunkte begrenzt.`
      });
    });

  return reasons;
}

function decideAmpel(input: {
  score: number;
  scoresByCategory: Record<SecurityCategory, number>;
  evidenceConfidence: number;
  reviewStatus: ReviewStatus;
  reviewReasons: AmpelDecisionReason[];
  ruleResults: RuleEvaluation[];
}): { ampel: AmpelColor; reasons: AmpelDecisionReason[] } {
  const reasons: AmpelDecisionReason[] = [];

  if (input.score < 50) {
    reasons.push({
      code: "score_below_yellow_threshold",
      severity: "critical",
      threshold: 50,
      actual: input.score,
      message: "Security Score liegt unter 50."
    });
    return { ampel: "rot", reasons: reasons.concat(input.reviewReasons) };
  }

  reasons.push({
    code: "score_threshold",
    severity: "info",
    threshold: input.score >= 75 ? 75 : 50,
    actual: input.score,
    message: input.score >= 75 ? "Security Score erfüllt die Score-Schwelle für Grün." : "Security Score erfüllt nur die Schwelle für Gelb."
  });

  if (input.evidenceConfidence < GREEN_EVIDENCE_CONFIDENCE_MIN) {
    reasons.push({
      code: "evidence_confidence_too_low_for_green",
      severity: "warning",
      threshold: GREEN_EVIDENCE_CONFIDENCE_MIN,
      actual: input.evidenceConfidence,
      message: "Evidence Confidence reicht nicht für Grün."
    });
  }

  Object.entries(CATEGORY_MINIMUM_SCORES).forEach(([category, minimum]) => {
    const typedCategory = category as SecurityCategory;
    const actual = input.scoresByCategory[typedCategory];
    if (minimum !== undefined && actual < minimum) {
      reasons.push({
        code: "category_minimum_failed",
        severity: "warning",
        category: typedCategory,
        threshold: minimum,
        actual,
        message: `${typedCategory} liegt unter dem Mindestwert für Grün.`
      });
    }
  });

  GREEN_HARD_REQUIREMENTS.forEach((requirement) => {
    const result = input.ruleResults.find((item) => item.rule_id === requirement.ruleId);
    const robustEvidence = result?.evidence_coverage.source === "measured" || result?.evidence_coverage.source === "inferred";
    if (!result?.passed || !robustEvidence) {
      reasons.push({
        code: "green_hard_requirement_failed",
        severity: "warning",
        category: requirement.category,
        rule_id: requirement.ruleId,
        message: requirement.message
      });
    }
  });

  input.ruleResults
    .filter((result) => result.risk_flags.includes("core_critical_finding"))
    .forEach((result) => {
      reasons.push({
        code: "core_critical_finding_blocks_green",
        severity: "critical",
        category: result.category,
        rule_id: result.rule_id,
        message: `${result.rule_id}: Kritischer Rot-Befund in einem Kernbereich blockiert Grün.`
      });
    });

  if (input.reviewStatus === "review_required") {
    reasons.push({
      code: "review_required_blocks_green",
      severity: "warning",
      message: "Mindestens ein Widerspruch oder Review-Hinweis verhindert eine grüne Einstufung."
    });
  }

  const blockers = reasons.filter((reason) => reason.code !== "score_threshold" && reason.severity !== "info");
  const greenAllowed = input.score >= 75 && blockers.length === 0;

  return {
    ampel: greenAllowed ? "grün" : "gelb",
    reasons: reasons.concat(input.reviewReasons)
  };
}
