import type { DnsResolverAssessment, NetworkSecurityFinding } from "@/lib/security/networkProbeTypes";

const PUBLIC_DNS: Record<string, { name: string; security?: string }> = {
  "1.1.1.1": { name: "Cloudflare" },
  "1.0.0.1": { name: "Cloudflare" },
  "8.8.8.8": { name: "Google Public DNS" },
  "8.8.4.4": { name: "Google Public DNS" },
  "9.9.9.9": { name: "Quad9", security: "Malware-/Phishing-Schutz wahrscheinlich aktiv" },
  "149.112.112.112": { name: "Quad9", security: "Malware-/Phishing-Schutz wahrscheinlich aktiv" },
  "208.67.222.222": { name: "Cisco OpenDNS", security: "DNS-Filterung je nach Konto/Konfiguration möglich" },
  "208.67.220.220": { name: "Cisco OpenDNS", security: "DNS-Filterung je nach Konto/Konfiguration möglich" },
  "94.140.14.14": { name: "AdGuard DNS", security: "Filter-DNS wahrscheinlich aktiv" },
  "94.140.15.15": { name: "AdGuard DNS", security: "Filter-DNS wahrscheinlich aktiv" }
};

export function classifyDnsResolvers(dnsServers: string[], gatewayIp: string): DnsResolverAssessment[] {
  return dnsServers.map((server) => {
    if (server === gatewayIp) {
      return resolver(server, "router_dns", "high", "DNS-Anfragen laufen über den Router. Prüfen Sie dort Filterung und Weiterleitung.");
    }

    if (isPrivateIp(server)) {
      return resolver(
        server,
        "provider_dns",
        "medium",
        "Der DNS-Server liegt im privaten Netz. Prüfen Sie, ob er zum Router, Server oder IT-Dienstleister gehört."
      );
    }

    const publicResolver = PUBLIC_DNS[server];
    if (publicResolver?.security) {
      return resolver(
        server,
        "security_dns",
        "high",
        "Schutz-DNS beibehalten und dokumentieren, sofern Datenschutz und Praxisvorgaben passen.",
        publicResolver.security,
        server === "9.9.9.9" || server === "149.112.112.112"
      );
    }

    if (publicResolver) {
      return resolver(
        server,
        "public_dns",
        "high",
        "Öffentliche DNS-Resolver bewusst dokumentieren; für Praxen ist ein Schutz-DNS oder zentraler Router-DNS oft sinnvoller."
      );
    }

    return resolver(
      server,
      "unknown",
      "low",
      "Unbekannten DNS-Server durch den IT-Dienstleister prüfen lassen."
    );
  });
}

export function assessDnsResolvers(resolvers: DnsResolverAssessment[]): NetworkSecurityFinding[] {
  const suspicious = resolvers.filter((resolverItem) => resolverItem.resolverClass === "suspicious" || resolverItem.resolverClass === "unknown");
  const publicWithoutFiltering = resolvers.filter((resolverItem) => resolverItem.resolverClass === "public_dns");
  const securityDns = resolvers.filter((resolverItem) => resolverItem.resolverClass === "security_dns");
  const measuredAt = new Date().toISOString();

  return [
    {
      id: suspicious.length > 0 ? "dns_resolver_unknown" : "dns_resolver_classified",
      checkId: "dns_resolver",
      title: suspicious.length > 0 ? "Unbekannte DNS-Server konfiguriert" : "DNS-Resolver klassifiziert",
      severity: suspicious.length > 0 ? "medium" : "low",
      status: suspicious.length > 0 ? "warning" : "secure",
      detected: suspicious.length > 0,
      confidence: suspicious.length > 0 ? "medium" : "high",
      details:
        suspicious.length > 0
          ? `DNS-Server ${suspicious.map((item) => item.server).join(", ")} konnten nicht eindeutig zugeordnet werden.`
          : "Die sichtbaren DNS-Server konnten einer erwartbaren Klasse zugeordnet werden.",
      recommendation:
        suspicious.length > 0
          ? "DNS-Konfiguration im Router prüfen und unbekannte Resolver entfernen."
          : "DNS-Konfiguration dokumentieren und regelmäßig prüfen.",
      scoreImpact: suspicious.length > 0 ? -6 : 0,
      complianceImpact: suspicious.length > 0 ? "technical_measure" : "none",
      evidence: {
        source: resolvers.length > 0 ? "measured" : "unavailable",
        raw: { resolverCount: resolvers.length, unknownCount: suspicious.length },
        measuredAt
      }
    },
    {
      id: securityDns.length > 0 ? "dns_security_filter_hint" : "dns_security_filter_missing_hint",
      checkId: "dns_security",
      title: securityDns.length > 0 ? "Schutz-DNS erkannt" : "DNS-Schutz nicht erkennbar",
      severity: "low",
      status: publicWithoutFiltering.length > 0 && securityDns.length === 0 ? "warning" : securityDns.length > 0 ? "secure" : "unknown",
      detected: publicWithoutFiltering.length > 0 && securityDns.length === 0,
      confidence: securityDns.length > 0 ? "medium" : "low",
      details:
        securityDns.length > 0
          ? securityDns.map((item) => `${item.server}: ${item.filteringHint}`).join("; ")
          : "Aus der lokalen Resolver-Konfiguration ist keine Malware- oder Phishing-Filterung ableitbar.",
      recommendation:
        "Für Arztpraxen ist ein zentral dokumentierter Router-DNS oder Schutz-DNS mit Malware-/Phishing-Filter sinnvoll.",
      scoreImpact: publicWithoutFiltering.length > 0 && securityDns.length === 0 ? -3 : 0,
      complianceImpact: "documentation",
      evidence: {
        source: resolvers.length > 0 ? "inferred" : "unavailable",
        raw: { securityDnsCount: securityDns.length, publicDnsCount: publicWithoutFiltering.length },
        measuredAt
      }
    }
  ];
}

function resolver(
  server: string,
  resolverClass: DnsResolverAssessment["resolverClass"],
  confidence: DnsResolverAssessment["confidence"],
  recommendation: string,
  filteringHint?: string,
  supportsDotLikely = false
): DnsResolverAssessment {
  return {
    server,
    resolverClass,
    source: "measured",
    confidence,
    filteringHint,
    supportsDotLikely,
    recommendation
  };
}

function isPrivateIp(ipAddress: string) {
  const parts = ipAddress.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return false;
  const [first, second] = parts;
  return first === 10 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168);
}
