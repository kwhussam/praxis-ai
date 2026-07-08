import type { WifiSecurityDetails, WifiSecurityProtocol } from "@/lib/security/networkProbeTypes";
import type { NativeWifiNetwork } from "@/lib/security/nativeWifi";

export function resolveWifiSecurityDetails(
  ssid: string,
  visibleNetworks: NativeWifiNetwork[],
  nativeDetails?: Partial<WifiSecurityDetails> | null,
  platform: string = "unknown"
): WifiSecurityDetails {
  if (nativeDetails?.protocol) {
    return normalizeWifiSecurityDetails(nativeDetails);
  }

  const currentNetwork = visibleNetworks.find((network) => stripWifiQuotes(network.ssid ?? "") === ssid);
  if (currentNetwork?.capabilities) {
    return parseWifiCapabilities(currentNetwork.capabilities, "measured");
  }

  if (platform === "ios") {
    return {
      protocol: "UNKNOWN",
      authMode: "unknown",
      isEnterprise: false,
      isPersonal: false,
      isMixedMode: false,
      supportsWpa3: false,
      source: "unavailable",
      confidence: "low",
      platformLimitations: [
        "iOS stellt WPA/WPA2/WPA3-Details über öffentliche APIs nicht zuverlässig bereit.",
        "Die App bewertet die Verschlüsselung auf iOS nur, wenn ein natives Modul mit passenden Entitlements Daten liefert."
      ]
    };
  }

  return {
    protocol: inferSecurityProtocolFromSsid(ssid),
    authMode: "unknown",
    isEnterprise: false,
    isPersonal: false,
    isMixedMode: false,
    supportsWpa3: false,
    source: "inferred",
    confidence: "low",
    platformLimitations: ["Keine auswertbaren WLAN-Capabilities verfügbar; Ergebnis basiert auf schwacher Heuristik."]
  };
}

export function parseWifiCapabilities(
  capabilities: string,
  source: WifiSecurityDetails["source"] = "measured"
): WifiSecurityDetails {
  const normalized = capabilities.toUpperCase();
  const hasWep = normalized.includes("WEP");
  const hasSae = normalized.includes("SAE") || normalized.includes("WPA3");
  const hasSuiteB = normalized.includes("EAP_SUITE_B_192") || normalized.includes("SUITE-B");
  const hasEap = normalized.includes("EAP");
  const hasPsk = normalized.includes("PSK");
  const hasWpa2 = normalized.includes("WPA2") || normalized.includes("RSN");
  const hasWpa = /\bWPA[-_\]]/.test(normalized) || normalized.includes("[WPA-");
  const hasOwe = normalized.includes("OWE");
  const hasSecurity = hasWep || hasSae || hasSuiteB || hasEap || hasPsk || hasWpa2 || hasWpa || hasOwe;
  const protocolFamilies = [hasWep, hasWpa && !hasWpa2, hasWpa2, hasSae || hasSuiteB || hasOwe].filter(Boolean).length;
  const isMixedMode = protocolFamilies > 1 || (hasPsk && hasSae) || (hasWpa2 && hasSae);

  if (!hasSecurity || (normalized.includes("ESS") && !hasSecurity)) {
    return details("OPEN", "open", false, false, false, false, capabilities, source);
  }

  if (hasWep) {
    return details("WEP", "wep", false, false, isMixedMode, false, capabilities, source);
  }

  if (hasSae || hasSuiteB || hasOwe) {
    if (isMixedMode) {
      return details("WPA3", "mixed", hasEap || hasSuiteB, hasPsk || hasSae, true, true, capabilities, source);
    }

    return details(
      "WPA3",
      hasEap || hasSuiteB ? "wpa3_enterprise" : "wpa3_personal",
      hasEap || hasSuiteB,
      !(hasEap || hasSuiteB),
      false,
      true,
      capabilities,
      source
    );
  }

  if (hasWpa2) {
    return details(
      "WPA2",
      isMixedMode ? "mixed" : hasEap ? "wpa2_enterprise" : "wpa2_personal",
      hasEap,
      !hasEap,
      isMixedMode,
      false,
      capabilities,
      source
    );
  }

  if (hasWpa) {
    return details(
      "WPA",
      isMixedMode ? "mixed" : hasEap ? "wpa_enterprise" : "wpa_personal",
      hasEap,
      !hasEap,
      isMixedMode,
      false,
      capabilities,
      source
    );
  }

  return details("UNKNOWN", "unknown", false, false, false, false, capabilities, source, "low");
}

function normalizeWifiSecurityDetails(detailsInput: Partial<WifiSecurityDetails>): WifiSecurityDetails {
  const protocol = normalizeProtocol(detailsInput.protocol);
  return {
    protocol,
    authMode: detailsInput.authMode ?? authModeForProtocol(protocol),
    isEnterprise: detailsInput.isEnterprise ?? false,
    isPersonal: detailsInput.isPersonal ?? false,
    isMixedMode: detailsInput.isMixedMode ?? false,
    supportsWpa3: detailsInput.supportsWpa3 ?? protocol === "WPA3",
    capabilities: detailsInput.capabilities,
    source: detailsInput.source ?? "measured",
    confidence: detailsInput.confidence ?? "medium",
    platformLimitations: detailsInput.platformLimitations ?? []
  };
}

function details(
  protocol: WifiSecurityProtocol,
  authMode: WifiSecurityDetails["authMode"],
  isEnterprise: boolean,
  isPersonal: boolean,
  isMixedMode: boolean,
  supportsWpa3: boolean,
  capabilities: string,
  source: WifiSecurityDetails["source"],
  confidence: WifiSecurityDetails["confidence"] = "high"
): WifiSecurityDetails {
  return {
    protocol,
    authMode,
    isEnterprise,
    isPersonal,
    isMixedMode,
    supportsWpa3,
    capabilities,
    source,
    confidence,
    platformLimitations: []
  };
}

function inferSecurityProtocolFromSsid(ssid: string): WifiSecurityProtocol {
  const normalizedSsid = ssid.toLowerCase();
  if (normalizedSsid.includes("open") || normalizedSsid.includes("freewifi") || normalizedSsid.includes("gast")) {
    return "OPEN";
  }
  return "UNKNOWN";
}

function authModeForProtocol(protocol: WifiSecurityProtocol): WifiSecurityDetails["authMode"] {
  if (protocol === "OPEN") return "open";
  if (protocol === "WEP") return "wep";
  if (protocol === "WPA") return "wpa_personal";
  if (protocol === "WPA2") return "wpa2_personal";
  if (protocol === "WPA3") return "wpa3_personal";
  return "unknown";
}

function normalizeProtocol(protocol?: string): WifiSecurityProtocol {
  if (protocol === "OPEN" || protocol === "WEP" || protocol === "WPA" || protocol === "WPA2" || protocol === "WPA3") {
    return protocol;
  }
  return "UNKNOWN";
}

function stripWifiQuotes(value: string) {
  return value.replace(/^"|"$/g, "");
}
