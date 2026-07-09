import type { DnsFilterTestResult, DnsResolverAssessment, NetworkSecurityFinding } from "@/lib/security/networkProbeTypes";

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

export function assessDnsFilterTests(results: DnsFilterTestResult[]): NetworkSecurityFinding {
  const measuredAt = new Date().toISOString();
  const measured = results.filter((result) => result.source === "measured");
  const allowed = measured.filter((result) => result.blocked === false);
  const blocked = measured.filter((result) => result.blocked === true);

  if (measured.length === 0) {
    return {
      id: "dns_filter_test_unavailable",
      checkId: "dns_filter_test",
      title: "DNS-Filtertest nicht verfügbar",
      severity: "low",
      status: "unknown",
      detected: false,
      confidence: "low",
      details: "Malware-/Phishing-Testdomains konnten nicht per DNS geprüft werden. Es wurden keine Webseiten oder Inhalte abgerufen.",
      recommendation: "DNS-Filterung über Router, Schutz-DNS oder Security-Gateway dokumentieren und bei Gelegenheit technisch testen.",
      scoreImpact: 0,
      complianceImpact: "documentation",
      evidence: {
        source: "unavailable",
        raw: { testCount: results.length, privacyBoundary: "dns_lookup_only_no_content_fetch" },
        measuredAt
      }
    };
  }

  return {
    id: allowed.length > 0 ? "dns_filter_test_allowed" : "dns_filter_test_blocked",
    checkId: "dns_filter_test",
    title: allowed.length > 0 ? "DNS-Filter blockiert Testdomains nicht vollständig" : "DNS-Filter blockiert Testdomains",
    severity: allowed.length > 0 ? "medium" : "low",
    status: allowed.length > 0 ? "warning" : "secure",
    detected: allowed.length > 0,
    confidence: measured.some((result) => result.confidence === "high") ? "high" : "medium",
    details:
      allowed.length > 0
        ? `Folgende harmlosen Testdomains wurden per DNS aufgelöst statt blockiert: ${allowed.map((result) => result.domain).join(", ")}. Es wurden keine Inhalte abgerufen.`
        : `Alle gemessenen Malware-/Phishing-Testdomains wurden per DNS blockiert: ${blocked.map((result) => result.domain).join(", ")}.`,
    recommendation:
      allowed.length > 0
        ? "Malware-/Phishing-Filter im DNS-Resolver, Router oder Security-Gateway aktivieren und dokumentieren."
        : "DNS-Filterung beibehalten und Ausnahmen regelmäßig prüfen.",
    scoreImpact: allowed.length > 0 ? -6 : 0,
    complianceImpact: allowed.length > 0 ? "technical_measure" : "none",
    evidence: {
      source: "measured",
      raw: {
        testCount: results.length,
        blockedCount: blocked.length,
        allowedCount: allowed.length,
        privacyBoundary: "dns_lookup_only_no_content_fetch"
      },
      measuredAt
    }
  };
}

export function assessDnsOperation(answers: {
  resolverDocumented?: boolean;
  filterEnabled?: boolean;
  privacyReviewed?: boolean;
  providerDocumented?: boolean;
  configurationDocumented?: boolean;
}): NetworkSecurityFinding {
  const measuredAt = new Date().toISOString();
  const complete =
    answers.resolverDocumented === true &&
    answers.filterEnabled === true &&
    answers.privacyReviewed === true &&
    answers.providerDocumented === true &&
    answers.configurationDocumented === true;

  return {
    id: complete ? "dns_operation_documented" : "dns_operation_incomplete",
    checkId: "dns_security",
    title: complete ? "DNS-Betrieb dokumentiert" : "DNS-Betrieb unvollständig dokumentiert",
    severity: "low",
    status: complete ? "secure" : "warning",
    detected: !complete,
    confidence: "medium",
    details: complete
      ? "Resolver, DNS-Filter, Datenschutzbewertung, Dienstleister und Konfiguration wurden per Fragebogen bestätigt."
      : "Resolver, DNS-Filter, Datenschutzbewertung, Dienstleister oder DNS-Konfiguration sind nicht vollständig dokumentiert.",
    recommendation: "DNS-Resolver, Filterfunktion, Datenschutzbewertung, Dienstleister und Konfigurationsausnahmen zentral dokumentieren.",
    scoreImpact: complete ? 0 : -3,
    complianceImpact: complete ? "none" : "documentation",
    evidence: {
      source: "questionnaire",
      raw: {
        resolverDocumented: answers.resolverDocumented ?? null,
        filterEnabled: answers.filterEnabled ?? null,
        privacyReviewed: answers.privacyReviewed ?? null,
        providerDocumented: answers.providerDocumented ?? null,
        configurationDocumented: answers.configurationDocumented ?? null
      },
      measuredAt
    }
  };
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
