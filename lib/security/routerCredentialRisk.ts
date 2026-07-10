import type { NetworkSecurityFinding, RouterCredentialRiskAssessment, RouterFingerprint } from "@/lib/security/networkProbeTypes";

export type RouterCredentialAnswers = {
  adminPasswordChanged?: boolean;
  passwordManagerUsed?: boolean;
  routerMfaAvailable?: boolean;
  managedByItProvider?: boolean;
  remoteAccessDisabled?: boolean;
  upnpDisabled?: boolean;
  portForwardsDocumented?: boolean;
};

export function assessRouterCredentialRisk(input: {
  fingerprint: RouterFingerprint;
  answers?: RouterCredentialAnswers;
}): RouterCredentialRiskAssessment {
  const reasons: string[] = [];
  const answers = input.answers ?? {};
  const hasAnswers = Object.keys(answers).length > 0;

  if (!hasAnswers) {
    return {
      risk: "unknown",
      reasons: ["Router-Default-Passwort-Risiko wurde nicht sicher technisch geprüft; Nachweis per Fragebogen erforderlich."],
      questionnaireRecommended: true,
      source: "unavailable",
      confidence: "low"
    };
  }

  if (answers.adminPasswordChanged === false) reasons.push("Kein Nachweis vorliegend, dass das Router-Adminpasswort vom Standard geändert wurde.");
  if (answers.adminPasswordChanged === undefined) reasons.push("Änderung des Router-Adminpassworts ist nicht dokumentiert.");
  if (answers.passwordManagerUsed === false) reasons.push("Kein Passwortmanager für Routerzugang dokumentiert.");
  if (answers.managedByItProvider === false) reasons.push("Keine klare Zuständigkeit eines IT-Dienstleisters dokumentiert.");
  if (answers.routerMfaAvailable === false) reasons.push("MFA oder gleichwertiger Schutz für Router-/Provider-Zugänge ist nicht dokumentiert.");
  if (answers.remoteAccessDisabled === false) reasons.push("Router-Fernzugriff ist nicht deaktiviert oder nicht auf definierte Quellen beschränkt.");
  if (answers.upnpDisabled === false) reasons.push("UPnP ist nicht deaktiviert oder Ausnahmen sind nicht dokumentiert.");
  if (answers.portForwardsDocumented === false) reasons.push("Portfreigaben sind nicht vollständig mit Zweck, Zielsystem und Verantwortlichem dokumentiert.");

  const high = answers.adminPasswordChanged === false || reasons.length >= 3;
  const medium = reasons.length > 0;

  return {
    risk: high ? "high" : medium ? "medium" : "low",
    reasons,
    questionnaireRecommended: false,
    source: "questionnaire",
    confidence: "medium"
  };
}

export function defaultPasswordRiskFinding(assessment: RouterCredentialRiskAssessment): NetworkSecurityFinding {
  const measuredAt = new Date().toISOString();

  return {
    id: `default_password_risk_${assessment.risk}`,
    checkId: "default_password_risk",
    title: assessment.risk === "high" ? "Router-Default-Passwort-Nachweis fehlt" : assessment.risk === "medium" ? "Router-Passwortnachweis prüfen" : assessment.risk === "unknown" ? "Router-Passwortnachweis nicht geprüft" : "Router-Passwortnachweis unauffällig",
    severity: assessment.risk === "high" ? "high" : assessment.risk === "medium" ? "medium" : "low",
    status: assessment.risk === "high" ? "critical" : assessment.risk === "medium" ? "warning" : assessment.risk === "unknown" ? "unknown" : "secure",
    detected: assessment.risk === "high" || assessment.risk === "medium",
    confidence: assessment.confidence,
    details:
      assessment.reasons.length > 0
        ? assessment.reasons.join(" ")
        : "Per Fragebogen wurde bestätigt, dass der Router-Zugang nicht auf Default-Nachweisen beruht.",
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
