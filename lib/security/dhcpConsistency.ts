import type { DhcpConsistencyAssessment, NetworkSecurityFinding } from "@/lib/security/networkProbeTypes";

export function assessDhcpConsistencyInput(input: {
  ipAddress: string;
  subnetMask: string;
  gatewayIp: string;
  dnsServers: string[];
}): DhcpConsistencyAssessment {
  const issues: string[] = [];

  if (!isPrivateIp(input.ipAddress)) {
    issues.push("Die lokale IPv4-Adresse ist keine private Praxisnetz-Adresse.");
  }

  if (input.gatewayIp && !isSameSubnet(input.ipAddress, input.gatewayIp, input.subnetMask)) {
    issues.push("Gateway liegt nicht im erwarteten Subnetz der lokalen IP-Adresse.");
  }

  const outsideDns = input.dnsServers.filter((server) => !server.includes(":") && !isPrivateIp(server) && server !== input.gatewayIp);
  if (outsideDns.length > 0) {
    issues.push(`DNS-Server außerhalb des Praxisnetzes erkannt: ${outsideDns.join(", ")}.`);
  }

  const unexpectedPrivateDns = input.dnsServers.filter((server) => {
    return !server.includes(":") && isPrivateIp(server) && input.gatewayIp && !isSameSubnet(input.ipAddress, server, input.subnetMask);
  });
  if (unexpectedPrivateDns.length > 0) {
    issues.push(`Private DNS-Server außerhalb des lokalen Subnetzes erkannt: ${unexpectedPrivateDns.join(", ")}.`);
  }

  return {
    status: issues.length === 0 ? "consistent" : issues.some((issue) => issue.includes("Gateway")) ? "critical" : "warning",
    issues,
    source: "inferred",
    confidence: input.gatewayIp && input.ipAddress !== "0.0.0.0" ? "medium" : "low"
  };
}

export function dhcpConsistencyFinding(assessment: DhcpConsistencyAssessment): NetworkSecurityFinding {
  const measuredAt = new Date().toISOString();
  const isProblem = assessment.status === "warning" || assessment.status === "critical";

  return {
    id: isProblem ? "dhcp_consistency_warning" : "dhcp_consistency_ok",
    checkId: "dhcp_consistency",
    title: isProblem ? "Ungewöhnliche Netzwerkzuweisung" : "Gateway/DNS wirken konsistent",
    severity: assessment.status === "critical" ? "high" : "low",
    status: assessment.status === "critical" ? "critical" : assessment.status === "warning" ? "warning" : "secure",
    detected: isProblem,
    confidence: assessment.confidence,
    details: isProblem
      ? assessment.issues.join(" ")
      : "IP-Adresse, Gateway und DNS-Server passen logisch zur lokalen Netzkonfiguration.",
    recommendation: isProblem
      ? "Router- und DHCP-Konfiguration prüfen. Bei unerwartetem Gateway oder DNS an möglichen Rogue-DHCP denken."
      : "DHCP-Konfiguration dokumentieren und Router-Zugang schützen.",
    scoreImpact: assessment.status === "critical" ? -10 : assessment.status === "warning" ? -6 : 0,
    complianceImpact: isProblem ? "technical_measure" : "none",
    evidence: {
      source: assessment.source,
      raw: { issueCount: assessment.issues.length },
      measuredAt
    }
  };
}

export function dhcpDocumentationFinding(answers: {
  authorizedServerDocumented?: boolean;
  routerIpDocumented?: boolean;
  dnsServersDocumented?: boolean;
  exceptionsDocumented?: boolean;
}): NetworkSecurityFinding {
  const measuredAt = new Date().toISOString();
  const complete =
    answers.authorizedServerDocumented === true &&
    answers.routerIpDocumented === true &&
    answers.dnsServersDocumented === true &&
    answers.exceptionsDocumented === true;

  return {
    id: complete ? "dhcp_documentation_complete" : "dhcp_documentation_incomplete",
    checkId: "dhcp_consistency",
    title: complete ? "DHCP-Konfiguration dokumentiert" : "DHCP-Sicherheitsangaben fehlen",
    severity: "low",
    status: complete ? "secure" : "warning",
    detected: !complete,
    confidence: "medium",
    details: complete
      ? "Autorisierter DHCP-Server, Router-IP, DNS-Server und bekannte Ausnahmen wurden per Fragebogen bestätigt."
      : "Autorisierter DHCP-Server, Router-IP, DNS-Server oder bekannte Ausnahmen sind nicht vollständig dokumentiert.",
    recommendation:
      "Autorisierter DHCP-Server, erwartete Router-IP, erlaubte DNS-Server und bekannte DHCP-Ausnahmen dokumentieren, um Rogue-DHCP-Abweichungen schneller zu erkennen.",
    scoreImpact: complete ? 0 : -4,
    complianceImpact: complete ? "none" : "documentation",
    evidence: {
      source: "questionnaire",
      raw: {
        authorizedServerDocumented: answers.authorizedServerDocumented ?? null,
        routerIpDocumented: answers.routerIpDocumented ?? null,
        dnsServersDocumented: answers.dnsServersDocumented ?? null,
        exceptionsDocumented: answers.exceptionsDocumented ?? null
      },
      measuredAt
    }
  };
}

function isSameSubnet(ipAddress: string, candidate: string, subnetMask: string) {
  const ip = ipv4ToInt(ipAddress);
  const other = ipv4ToInt(candidate);
  const mask = ipv4ToInt(subnetMask);
  if (ip === null || other === null || mask === null) return false;
  return (ip & mask) === (other & mask);
}

function ipv4ToInt(ipAddress: string) {
  const parts = ipAddress.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

function isPrivateIp(ipAddress: string) {
  const parts = ipAddress.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return false;
  const [first, second] = parts;
  return first === 10 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168);
}
