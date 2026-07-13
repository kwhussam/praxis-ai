import type { RouterFirewallRule } from "@/lib/inventory/types";
import type { FirewallBaselineAssessment, GatewaySecurityProbeResult, NetworkSecurityFinding } from "@/lib/security/networkProbeTypes";

const CRITICAL_PORTS = new Set([23, 3389, 3306, 5432]);
const MANAGEMENT_PORTS = new Set([80, 8080, 8443, 5000, 5001, 139, 445, 2049, 9100]);

export type RouterFirewallSecurityAnswers = {
  remoteAccessDisabled?: boolean;
  upnpDisabled?: boolean;
  portForwardsDocumented?: boolean;
};

export function assessFirewallBaseline(
  probe: GatewaySecurityProbeResult,
  context: {
    firewallRules?: RouterFirewallRule[];
    routerSecurity?: RouterFirewallSecurityAnswers;
  } = {}
): FirewallBaselineAssessment {
  const openTcp = probe.tcp.filter((item) => item.state === "open").map((item) => item.port);
  const openHttp = probe.http.filter((item) => item.state === "open").map((item) => item.port);
  const internalOpenCriticalPorts = openTcp.filter((port) => CRITICAL_PORTS.has(port));
  const internalOpenManagementPorts = [...openTcp, ...openHttp].filter((port) => MANAGEMENT_PORTS.has(port));
  const externalAllowRules = (context.firewallRules ?? []).filter((rule) => {
    return rule.enabled && rule.action === "allow" && (rule.sourceView === "external" || rule.direction === "wan_to_lan");
  });
  const documentedExternalRules = externalAllowRules.filter(isDocumentedRule);
  const undocumentedExternalRules = externalAllowRules.filter((rule) => !isDocumentedRule(rule));
  const externalAllowedPorts = uniquePorts(externalAllowRules.flatMap(rulePorts));
  const documentedExternalAllowedPorts = uniquePorts(documentedExternalRules.flatMap(rulePorts));
  const undocumentedExternalAllowedPorts = uniquePorts(undocumentedExternalRules.flatMap(rulePorts));
  const riskyExternalPorts = externalAllowedPorts.filter((port) => CRITICAL_PORTS.has(port) || MANAGEMENT_PORTS.has(port));
  const remoteAccessEnabled = context.routerSecurity?.remoteAccessDisabled === undefined ? null : !context.routerSecurity.remoteAccessDisabled;
  const upnpEnabledByQuestionnaire = context.routerSecurity?.upnpDisabled === undefined ? null : !context.routerSecurity.upnpDisabled;
  const documentedPortForwards = context.routerSecurity?.portForwardsDocumented ?? null;
  const ipv6Risk = probe.ipv6.globalAddresses.length > 0;
  const externalCritical =
    riskyExternalPorts.length > 0 ||
    undocumentedExternalAllowedPorts.length > 0 ||
    remoteAccessEnabled === true;
  const internalNeedsContext = internalOpenCriticalPorts.length > 0 || internalOpenManagementPorts.length > 1;
  const questionnaireNeedsContext = upnpEnabledByQuestionnaire === true || documentedPortForwards === false;

  return {
    status: externalCritical || ipv6Risk ? "critical" : internalNeedsContext || questionnaireNeedsContext ? "partial" : "good",
    exposedCriticalPorts: riskyExternalPorts,
    exposedManagementPorts: Array.from(new Set([...internalOpenManagementPorts, ...externalAllowedPorts.filter((port) => MANAGEMENT_PORTS.has(port))])),
    internalOpenCriticalPorts,
    internalOpenManagementPorts: Array.from(new Set(internalOpenManagementPorts)),
    externalAllowedPorts,
    undocumentedExternalAllowedPorts,
    documentedExternalAllowedPorts,
    remoteAccessEnabled,
    upnpEnabledByQuestionnaire,
    documentedPortForwards,
    ipv6Risk,
    source: externalAllowRules.length > 0 || context.routerSecurity ? "questionnaire" : "measured",
    confidence: externalAllowRules.length > 0 || context.routerSecurity ? "medium" : "medium"
  };
}

export function firewallBaselineFinding(assessment: FirewallBaselineAssessment): NetworkSecurityFinding {
  const measuredAt = new Date().toISOString();
  const critical = assessment.status === "critical";
  const partial = assessment.status === "partial";

  return {
    id: `firewall_baseline_${assessment.status}`,
    checkId: "firewall_baseline",
    title: critical ? "Firewall-Basischeck kritisch" : partial ? "Firewall teilweise abgesichert" : "Firewall-Basischeck unauffällig",
    severity: critical ? "critical" : partial ? "medium" : "low",
    status: critical ? "critical" : partial ? "warning" : "secure",
    detected: critical || partial,
    confidence: assessment.confidence,
    details: critical
      ? "Externe Router-Freigaben, Fernzugriff oder globale IPv6-Erreichbarkeit benötigen Prüfung. Interne und externe Sicht werden getrennt bewertet."
      : partial
        ? "Interne Dienste oder Router-Sicherheitsangaben benötigen Kontext. Offene interne Dienste werden nicht automatisch als externe Exposition gewertet."
        : "Keine kritischen externen Freigaben oder internen Basisdienste ohne Kontext im lokalen Metadatencheck sichtbar.",
    recommendation:
      "Schutzregeln mit Sicht, Quelle, Ziel, Zweck und Verantwortlichem dokumentieren. Externe Freigaben, Fernzugriff, automatische Router-Freigaben und IPv6-Schutz gesondert prüfen.",
    scoreImpact: critical ? -30 : partial ? -10 : 0,
    complianceImpact: critical || partial ? "technical_measure" : "none",
    evidence: {
      source: assessment.source,
      ports: [...assessment.externalAllowedPorts, ...assessment.internalOpenCriticalPorts, ...assessment.internalOpenManagementPorts],
      raw: {
        internalOpenCriticalPorts: assessment.internalOpenCriticalPorts.length,
        internalOpenManagementPorts: assessment.internalOpenManagementPorts.length,
        externalAllowedPorts: assessment.externalAllowedPorts.length,
        undocumentedExternalAllowedPorts: assessment.undocumentedExternalAllowedPorts.length,
        documentedExternalAllowedPorts: assessment.documentedExternalAllowedPorts.length,
        remoteAccessEnabled: assessment.remoteAccessEnabled,
        upnpEnabledByQuestionnaire: assessment.upnpEnabledByQuestionnaire,
        documentedPortForwards: assessment.documentedPortForwards,
        ipv6Risk: assessment.ipv6Risk
      },
      measuredAt
    }
  };
}

function isDocumentedRule(rule: RouterFirewallRule) {
  return rule.purpose.trim().length > 0 && rule.owner.trim().length > 0 && Boolean(rule.lastReviewedAt);
}

function rulePorts(rule: RouterFirewallRule) {
  if (rule.protocol === "icmp") return [];
  return parsePortList(rule.ports);
}

function parsePortList(value: string) {
  return value
    .split(",")
    .flatMap((part) => {
      const trimmed = part.trim();
      if (!trimmed || trimmed === "*" || trimmed.toLowerCase() === "any") return [];
      const [startRaw, endRaw] = trimmed.split("-");
      const start = Number(startRaw);
      const end = Number(endRaw);
      if (!Number.isInteger(start) || start < 1 || start > 65535) return [];
      if (!Number.isInteger(end)) return [start];
      if (end < start || end > 65535 || end - start > 128) return [start];
      return Array.from({ length: end - start + 1 }, (_, index) => start + index);
    });
}

function uniquePorts(ports: number[]) {
  return Array.from(new Set(ports)).sort((a, b) => a - b);
}
