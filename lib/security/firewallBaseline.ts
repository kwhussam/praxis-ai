import type { FirewallBaselineAssessment, GatewaySecurityProbeResult, NetworkSecurityFinding } from "@/lib/security/networkProbeTypes";

const CRITICAL_PORTS = new Set([23, 3389, 3306, 5432]);
const MANAGEMENT_PORTS = new Set([80, 8080, 8443, 5000, 5001, 139, 445, 2049, 9100]);

export function assessFirewallBaseline(probe: GatewaySecurityProbeResult): FirewallBaselineAssessment {
  const openTcp = probe.tcp.filter((item) => item.state === "open").map((item) => item.port);
  const openHttp = probe.http.filter((item) => item.state === "open").map((item) => item.port);
  const exposedCriticalPorts = openTcp.filter((port) => CRITICAL_PORTS.has(port));
  const exposedManagementPorts = [...openTcp, ...openHttp].filter((port) => MANAGEMENT_PORTS.has(port));
  const ipv6Risk = probe.ipv6.globalAddresses.length > 0;

  return {
    status: exposedCriticalPorts.length > 0 || ipv6Risk ? "critical" : exposedManagementPorts.length > 1 ? "partial" : "good",
    exposedCriticalPorts,
    exposedManagementPorts: Array.from(new Set(exposedManagementPorts)),
    ipv6Risk,
    source: "measured",
    confidence: "medium"
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
      ? "Kritische Dienste oder globale IPv6-Erreichbarkeit sind sichtbar. Die App prüft nur wenige sicherheitsrelevante Ports."
      : partial
        ? "Mehrere Management- oder Dateidienste sind lokal erreichbar."
        : "Keine kritischen Basisdienste im lokalen Metadatencheck sichtbar.",
    recommendation:
      "Firewall-Regeln prüfen: Telnet, RDP, Datenbanken und Dateidienste nur gezielt erlauben; IPv6-Firewall mitprüfen.",
    scoreImpact: critical ? -30 : partial ? -10 : 0,
    complianceImpact: critical || partial ? "technical_measure" : "none",
    evidence: {
      source: assessment.source,
      ports: [...assessment.exposedCriticalPorts, ...assessment.exposedManagementPorts],
      raw: { ipv6Risk: assessment.ipv6Risk },
      measuredAt
    }
  };
}
