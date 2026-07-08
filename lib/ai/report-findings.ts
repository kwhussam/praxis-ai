import type { CheckData as ReportSource } from "@/lib/ai/report";
import { questionnaireAnswersToCheckData } from "@/lib/security/questionnaire";
import { calculateScore, type CheckData as SecurityCheckData, type ScoreReport } from "@/lib/security/scoring";
import { mapWlanVulnerabilitiesToFindings } from "@/lib/security/wlan";

export function buildReportScore(source: ReportSource): ScoreReport {
  return calculateScore(reportSourceToCheckData(source));
}

function reportSourceToCheckData(source: ReportSource): SecurityCheckData {
  const dmarcPolicy = source.external?.checks?.email_security?.dmarc?.policy ?? null;

  return {
    ...questionnaireAnswersToCheckData(source.questionnaire ?? {}),
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
