import type { NativeWifiNetwork } from "@/lib/security/nativeWifi";
import type { AccessPoint } from "@/lib/inventory/types";
import type { NetworkSecurityFinding, RogueApAssessment, RogueApCandidate } from "@/lib/security/networkProbeTypes";
import { parseWifiCapabilities } from "@/lib/security/wifiCapabilities";

export function assessRogueAccessPoints(input: {
  currentSsid: string;
  visibleNetworks: NativeWifiNetwork[];
  accessPoints?: AccessPoint[];
}): RogueApAssessment {
  const sameSsid = input.visibleNetworks.filter((network) => stripWifiQuotes(network.ssid ?? "") === input.currentSsid);
  if (sameSsid.length === 0) {
    return { candidates: [], status: "unknown", source: "unavailable", confidence: "low" };
  }

  const protocols = new Set(sameSsid.map((network) => parseWifiCapabilities(network.capabilities ?? "").protocol));
  const officialAccessPoints = (input.accessPoints ?? []).filter((accessPoint) => accessPoint.ssid === input.currentSsid);
  const officialBssids = new Set(officialAccessPoints.map((accessPoint) => normalizeBssid(accessPoint.bssid)).filter(Boolean));
  const candidates: RogueApCandidate[] = sameSsid
    .map((network) => {
      const reasons: string[] = [];
      const parsed = parseWifiCapabilities(network.capabilities ?? "");
      const normalizedBssid = normalizeBssid(network.bssid);
      const officialAccessPoint = normalizedBssid
        ? officialAccessPoints.find((accessPoint) => normalizeBssid(accessPoint.bssid) === normalizedBssid)
        : undefined;

      if (officialBssids.size > 0 && normalizedBssid && !officialBssids.has(normalizedBssid)) {
        reasons.push("BSSID ist nicht im offiziellen Access-Point-Inventar dokumentiert.");
      }
      if (officialAccessPoint && !matchesExpectedEncryption(network.capabilities ?? "", officialAccessPoint.expectedEncryption)) {
        reasons.push("Sichtbare Verschlüsselung weicht vom Access-Point-Inventar ab.");
      }
      if (protocols.size > 1) reasons.push("Gleiche SSID mit abweichender Verschlüsselung sichtbar.");
      if ((network.level ?? -100) > -35) reasons.push("Sehr starkes Signal; Access Point befindet sich wahrscheinlich sehr nah.");
      if (!network.bssid) reasons.push("BSSID konnte nicht ausgelesen werden.");
      return {
        ssid: stripWifiQuotes(network.ssid ?? ""),
        bssid: network.bssid,
        rssi: network.level,
        frequency: network.frequency,
        securityProtocol: parsed.protocol,
        reason: reasons,
        confidence: officialBssids.size > 0 && reasons.length > 0 ? ("high" as const) : reasons.length > 1 ? ("medium" as const) : ("low" as const)
      };
    })
    .filter((candidate) => candidate.reason.length > 0);

  return {
    candidates,
    status: candidates.length > 0 ? "suspicious" : "none",
    source: "measured",
    confidence: candidates.some((candidate) => candidate.confidence === "high")
      ? "high"
      : candidates.some((candidate) => candidate.confidence === "medium")
        ? "medium"
        : "low"
  };
}

export function rogueApFinding(assessment: RogueApAssessment): NetworkSecurityFinding {
  const measuredAt = new Date().toISOString();
  const suspicious = assessment.status === "suspicious";

  return {
    id: suspicious ? "rogue_ap_suspicious" : `rogue_ap_${assessment.status}`,
    checkId: "rogue_access_point",
    title: suspicious ? "Möglicher Rogue Access Point" : "Keine Rogue-AP-Hinweise",
    severity: suspicious ? "medium" : "low",
    status: suspicious ? "warning" : assessment.status === "none" ? "secure" : "unknown",
    detected: suspicious,
    confidence: assessment.confidence,
    details: suspicious
      ? "Ein WLAN mit gleichem Namen zeigt abweichende oder auffällige technische Merkmale. Mobile Geräte können Rogue APs nur heuristisch erkennen."
      : "Keine auffälligen Access-Point-Metadaten sichtbar oder Plattformdaten nicht verfügbar.",
    recommendation: suspicious
      ? "BSSID, Standort, Verschlüsselung und Hersteller der Access Points durch den IT-Dienstleister prüfen lassen."
      : "Access-Point-Inventar dokumentieren und regelmäßig prüfen.",
    scoreImpact: suspicious ? -12 : 0,
    complianceImpact: suspicious ? "technical_measure" : "documentation",
    evidence: {
      source: assessment.source,
      raw: { candidateCount: assessment.candidates.length },
      measuredAt
    }
  };
}

function stripWifiQuotes(value: string) {
  return value.replace(/^"|"$/g, "");
}

function normalizeBssid(value?: string) {
  const cleaned = value?.trim().replace(/[^a-fA-F0-9]/g, "").toUpperCase();
  if (!cleaned || cleaned.length !== 12) return "";
  return cleaned.match(/.{1,2}/g)?.join(":") ?? "";
}

function matchesExpectedEncryption(capabilities: string, expected: AccessPoint["expectedEncryption"]) {
  const parsed = parseWifiCapabilities(capabilities);
  const normalizedCapabilities = capabilities.toUpperCase();
  if (expected === "UNKNOWN") return true;
  if (expected === "OPEN") return parsed.protocol === "OPEN";
  if (expected === "WPA3") return parsed.protocol === "WPA3" && !parsed.isMixedMode;
  if (expected === "WPA2_WPA3_MIXED") return parsed.protocol === "WPA3" && parsed.isMixedMode;
  if (expected === "WPA2_AES") return parsed.protocol === "WPA2" && normalizedCapabilities.includes("CCMP") && !normalizedCapabilities.includes("TKIP");
  return false;
}
