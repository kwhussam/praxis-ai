import type { Ipv6NetworkInfo, NetworkSecurityFinding } from "@/lib/security/networkProbeTypes";

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

export function assessIpv6(info: Ipv6NetworkInfo): NetworkSecurityFinding {
  const measuredAt = new Date().toISOString();
  const hasGlobal = info.globalAddresses.length > 0;
  const hasDns = info.dnsServers.length > 0;

  return {
    id: hasGlobal ? "ipv6_global_active" : info.enabled ? "ipv6_active_local" : "ipv6_not_visible",
    checkId: "ipv6_exposure",
    title: hasGlobal ? "Globale IPv6-Adressen aktiv" : info.enabled ? "IPv6 ist aktiv" : "IPv6 nicht sichtbar",
    severity: hasGlobal ? "medium" : "low",
    status: hasGlobal ? "warning" : info.enabled && hasDns ? "warning" : info.enabled ? "unknown" : "secure",
    detected: hasGlobal || (info.enabled && hasDns),
    confidence: info.confidence,
    details: hasGlobal
      ? "Mindestens eine globale IPv6-Adresse ist sichtbar. Geräte können über IPv6 anders erreichbar sein als über IPv4."
      : info.enabled
        ? "IPv6 ist im lokalen Netzwerk aktiv oder DNS nutzt IPv6. Die App führt keine IPv6-Portscans durch."
        : "Es wurden keine IPv6-Adressen oder IPv6-DNS-Server in den lokalen Metadaten erkannt.",
    recommendation: hasGlobal
      ? "Firewall- und DNS-Regeln auch für IPv6 prüfen. IPv6 bewusst konfigurieren oder deaktivieren, wenn es nicht benötigt wird."
      : info.enabled
        ? "IPv6-Konfiguration dokumentieren und sicherstellen, dass Router-Firewall und DNS-Filter auch IPv6 abdecken."
        : "Keine Maßnahme erforderlich, sofern IPv6 nicht genutzt werden soll.",
    scoreImpact: hasGlobal ? -12 : info.enabled && hasDns ? -6 : 0,
    complianceImpact: hasGlobal ? "technical_measure" : info.enabled ? "documentation" : "none",
    evidence: {
      source: info.source,
      raw: {
        globalAddressCount: info.globalAddresses.length,
        uniqueLocalAddressCount: info.uniqueLocalAddresses.length,
        linkLocalAddressCount: info.linkLocalAddresses.length,
        ipv6DnsCount: info.dnsServers.length,
        gatewayVisible: info.gatewayVisible
      },
      measuredAt
    }
  };
}

function isGlobalIpv6(address: string) {
  const normalized = address.toLowerCase();
  return /^[23][0-9a-f]{3}:/.test(normalized);
}
