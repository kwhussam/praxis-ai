import type { Ipv6NetworkInfo, Ipv6ReachabilityProbeResult, Ipv6SecurityAnswers, NetworkSecurityFinding } from "@/lib/security/networkProbeTypes";

export function buildIpv6NetworkInfo(rawAddresses: string[], dnsServers: string[]): Ipv6NetworkInfo {
  const ipv6Addresses = rawAddresses.filter((address) => address.includes(":"));
  const ipv6Dns = dnsServers.filter((server) => server.includes(":"));

  return {
    enabled: ipv6Addresses.length > 0 || ipv6Dns.length > 0,
    globalAddresses: ipv6Addresses.filter(isGlobalIpv6),
    uniqueLocalAddresses: ipv6Addresses.filter((address) => address.toLowerCase().startsWith("fc") || address.toLowerCase().startsWith("fd")),
    linkLocalAddresses: ipv6Addresses.filter((address) => address.toLowerCase().startsWith("fe80")),
    dnsServers: ipv6Dns,
    gatewayVisible: null,
    source: ipv6Addresses.length > 0 || ipv6Dns.length > 0 ? "measured" : "unavailable",
    confidence: ipv6Addresses.length > 0 || ipv6Dns.length > 0 ? "medium" : "low"
  };
}

export function assessIpv6(info: Ipv6NetworkInfo, answers: Ipv6SecurityAnswers = {}): NetworkSecurityFinding {
  const measuredAt = new Date().toISOString();
  const hasGlobal = info.globalAddresses.length > 0;
  const intentionallyUsed = answers.usedIntentionally === true;
  const ipv6RulesCovered = answers.firewallRulesCovered === true && answers.dnsRulesCovered === true;
  const unmanagedIpv6 = info.enabled && (!intentionallyUsed || !ipv6RulesCovered);

  return {
    id: hasGlobal ? "ipv6_global_active" : unmanagedIpv6 ? "ipv6_active_unmanaged" : info.enabled ? "ipv6_active_documented" : "ipv6_not_visible",
    checkId: "ipv6_exposure",
    title: hasGlobal ? "Globale IPv6-Adressen aktiv" : unmanagedIpv6 ? "IPv6 aktiv, Abdeckung unklar" : info.enabled ? "IPv6 bewusst genutzt" : "IPv6 nicht sichtbar",
    severity: hasGlobal || unmanagedIpv6 ? "medium" : "low",
    status: hasGlobal || unmanagedIpv6 ? "warning" : info.enabled ? "secure" : "secure",
    detected: hasGlobal || unmanagedIpv6,
    confidence: info.confidence,
    details: hasGlobal
      ? "Mindestens eine globale IPv6-Adresse ist sichtbar. Geräte können über IPv6 anders erreichbar sein als über IPv4."
      : unmanagedIpv6
        ? "IPv6 ist aktiv, aber bewusste Nutzung oder Abdeckung durch Firewall-/DNS-Regeln ist nicht vollständig bestätigt."
        : info.enabled
        ? "IPv6 ist im lokalen Netzwerk aktiv oder DNS nutzt IPv6. Die App führt keine IPv6-Portscans durch."
        : "Es wurden keine IPv6-Adressen oder IPv6-DNS-Server in den lokalen Metadaten erkannt.",
    recommendation: hasGlobal
      ? "Firewall- und DNS-Regeln auch für IPv6 prüfen. IPv6 bewusst konfigurieren oder deaktivieren, wenn es nicht benötigt wird."
      : unmanagedIpv6
        ? "Dokumentieren, ob IPv6 benötigt wird. Firewall-, Segmentierungs- und DNS-Filterregeln explizit für IPv6 prüfen."
        : info.enabled
        ? "IPv6-Konfiguration dokumentieren und sicherstellen, dass Router-Firewall und DNS-Filter auch IPv6 abdecken."
        : "Keine Maßnahme erforderlich, sofern IPv6 nicht genutzt werden soll.",
    scoreImpact: hasGlobal ? -12 : unmanagedIpv6 ? -6 : 0,
    complianceImpact: hasGlobal || unmanagedIpv6 ? "technical_measure" : info.enabled ? "documentation" : "none",
    evidence: {
      source: info.source,
      raw: {
        globalAddressCount: info.globalAddresses.length,
        uniqueLocalAddressCount: info.uniqueLocalAddresses.length,
        linkLocalAddressCount: info.linkLocalAddresses.length,
        ipv6DnsCount: info.dnsServers.length,
        gatewayVisible: info.gatewayVisible,
        usedIntentionally: intentionallyUsed,
        firewallRulesCovered: answers.firewallRulesCovered ?? null,
        dnsRulesCovered: answers.dnsRulesCovered ?? null
      },
      measuredAt
    }
  };
}

export function ipv6ReachabilityFinding(results: Ipv6ReachabilityProbeResult[]): NetworkSecurityFinding {
  const measuredAt = new Date().toISOString();
  const measured = results.filter((result) => result.source === "measured");
  const open = measured.filter((result) => result.state === "open");

  if (results.length === 0 || measured.length === 0) {
    return {
      id: "ipv6_reachability_not_checked",
      checkId: "ipv6_reachability",
      title: "IPv6-Erreichbarkeit nicht geprüft",
      severity: "low",
      status: "unknown",
      detected: false,
      confidence: "low",
      details: "IPv6-Port- und Erreichbarkeitscheck wurde nicht ausgeführt oder ist auf dieser Plattform nicht verfügbar.",
      recommendation: "IPv6-Erreichbarkeit nur mit Einwilligung und Plattformunterstützung prüfen; Firewall-Regeln unabhängig davon dokumentieren.",
      scoreImpact: 0,
      complianceImpact: "documentation",
      evidence: {
        source: "unavailable",
        raw: { checkedTargets: results.length },
        measuredAt
      }
    };
  }

  return {
    id: open.length > 0 ? "ipv6_reachability_open" : "ipv6_reachability_filtered",
    checkId: "ipv6_reachability",
    title: open.length > 0 ? "IPv6-Dienste erreichbar" : "IPv6-Zielports nicht erreichbar",
    severity: open.length > 0 ? "medium" : "low",
    status: open.length > 0 ? "warning" : "secure",
    detected: open.length > 0,
    confidence: measured.some((result) => result.confidence === "high") ? "high" : "medium",
    details:
      open.length > 0
        ? `Über IPv6 waren lokale Dienste erreichbar: ${open.map((result) => `[${result.host}]:${result.port}`).join(", ")}.`
        : "Die geprüften lokalen IPv6-Zielports waren nicht erreichbar.",
    recommendation:
      open.length > 0
        ? "IPv6-Firewallregeln prüfen und Dienste nur für notwendige Quellsegmente erlauben."
        : "IPv6-Firewallregeln beibehalten und bei Änderungen erneut prüfen.",
    scoreImpact: open.length > 0 ? -8 : 0,
    complianceImpact: open.length > 0 ? "technical_measure" : "none",
    evidence: {
      source: "measured",
      ports: Array.from(new Set(measured.map((result) => result.port))),
      raw: {
        checkedTargets: measured.length,
        openTargets: open.length
      },
      measuredAt
    }
  };
}

function isGlobalIpv6(address: string) {
  const normalized = address.toLowerCase();
  return /^[23][0-9a-f]{3}:/.test(normalized);
}
