import type { CheckData as ReportSource } from "@/lib/ai/report";
import { calculateScore, type CheckData as SecurityCheckData, type ScoreReport } from "@/lib/security/scoring";
import { mapWlanVulnerabilitiesToFindings } from "@/lib/security/wlan";

export function buildReportScore(source: ReportSource): ScoreReport {
  return calculateScore(reportSourceToCheckData(source));
}

function reportSourceToCheckData(source: ReportSource): SecurityCheckData {
  const questionnaire = source.questionnaire ?? {};
  const dmarcPolicy = source.external?.checks?.email_security?.dmarc?.policy ?? null;

  return {
    mfa_enabled: questionnaire.mfa,
    backup_tested: questionnaire.backups,
    backup_frequency: questionnaire.backups === undefined ? undefined : questionnaire.backups ? "daily" : "none",
    dmarc_exists: questionnaire.dmarc,
    updates_current: questionnaire.patching,
    staff_training: questionnaire.staffTraining,
    privacy_documents_current: questionnaire.privacyDocuments,
    encryption: source.wlan?.securityProtocol,
    external:
      source.external?.checks?.email_security !== undefined
        ? {
            email_security: {
              dmarc: {
                policy: dmarcPolicy
              }
            }
          }
        : undefined,
    externalFindings: source.external?.findings,
    wlanFindings: source.wlan ? mapWlanVulnerabilitiesToFindings(source.wlan.vulnerabilities) : undefined,
    wlanSecurityFindings: source.wlan?.securityFindings
  };
}
