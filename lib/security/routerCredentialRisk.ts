import type { NetworkSecurityFinding, RouterCredentialRiskAssessment, RouterFingerprint } from "@/lib/security/networkProbeTypes";

export type RouterCredentialAnswers = {
  adminPasswordChanged?: boolean;
  passwordManagerUsed?: boolean;
  routerMfaAvailable?: boolean;
  managedByItProvider?: boolean;
};

export function assessRouterCredentialRisk(input: {
  fingerprint: RouterFingerprint;
  answers?: RouterCredentialAnswers;
}): RouterCredentialRiskAssessment {
  const reasons: string[] = [];
  const answers = input.answers ?? {};

  if (input.fingerprint.managementInterface === "http" || input.fingerprint.managementInterface === "both") {
    reasons.push("Routerverwaltung ist zumindest teilweise über HTTP sichtbar.");
  }
  if (answers.adminPasswordChanged === false) reasons.push("Router-Adminpasswort wurde laut Angabe nicht geändert.");
  if (answers.adminPasswordChanged === undefined) reasons.push("Änderung des Router-Adminpassworts ist nicht dokumentiert.");
  if (answers.passwordManagerUsed === false) reasons.push("Kein Passwortmanager für Routerzugang dokumentiert.");
  if (answers.managedByItProvider === false) reasons.push("Keine klare Zuständigkeit eines IT-Dienstleisters dokumentiert.");

  const high = answers.adminPasswordChanged === false || reasons.length >= 3;
  const medium = reasons.length > 0;

  return {
    risk: high ? "high" : medium ? "medium" : "low",
    reasons,
    questionnaireRecommended: Object.keys(answers).length === 0,
    source: Object.keys(answers).length > 0 ? "questionnaire" : "inferred",
    confidence: Object.keys(answers).length > 0 ? "medium" : "low"
  };
}

export function defaultPasswordRiskFinding(assessment: RouterCredentialRiskAssessment): NetworkSecurityFinding {
  const measuredAt = new Date().toISOString();

  return {
    id: `default_password_risk_${assessment.risk}`,
    checkId: "default_password_risk",
    title: assessment.risk === "high" ? "Hohes Default-Passwort-Risiko" : assessment.risk === "medium" ? "Router-Passwort prüfen" : "Router-Passwort-Risiko unauffällig",
    severity: assessment.risk === "high" ? "high" : assessment.risk === "medium" ? "medium" : "low",
    status: assessment.risk === "high" ? "critical" : assessment.risk === "medium" ? "warning" : "secure",
    detected: assessment.risk === "high" || assessment.risk === "medium",
    confidence: assessment.confidence,
    details:
      assessment.reasons.length > 0
        ? assessment.reasons.join(" ")
        : "Es liegen keine Hinweise auf ein unverändertes Router-Adminpasswort vor.",
    recommendation:
      "Router-Adminpasswort ändern, in einem Passwortmanager dokumentieren und Verantwortlichkeit des IT-Dienstleisters festlegen. Die App führt keine Loginversuche durch.",
    scoreImpact: assessment.risk === "high" ? -20 : assessment.risk === "medium" ? -8 : 0,
    complianceImpact: assessment.risk === "low" ? "none" : "documentation",
    evidence: {
      source: assessment.source,
      raw: { reasons: assessment.reasons.length, questionnaireRecommended: assessment.questionnaireRecommended },
      measuredAt
    }
  };
}
