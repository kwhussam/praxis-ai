import type { NativeWifiNetwork } from "@/lib/security/nativeWifi";
import type { NetworkSecurityFinding, RogueApAssessment, RogueApCandidate } from "@/lib/security/networkProbeTypes";
import { parseWifiCapabilities } from "@/lib/security/wifiCapabilities";

export function assessRogueAccessPoints(input: {
  currentSsid: string;
  visibleNetworks: NativeWifiNetwork[];
}): RogueApAssessment {
  const sameSsid = input.visibleNetworks.filter((network) => stripWifiQuotes(network.ssid ?? "") === input.currentSsid);
  if (sameSsid.length === 0) {
    return { candidates: [], status: "unknown", source: "unavailable", confidence: "low" };
  }

  const protocols = new Set(sameSsid.map((network) => parseWifiCapabilities(network.capabilities ?? "").protocol));
  const candidates: RogueApCandidate[] = sameSsid
    .map((network) => {
      const reasons: string[] = [];
      const parsed = parseWifiCapabilities(network.capabilities ?? "");
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
        confidence: reasons.length > 1 ? ("medium" as const) : ("low" as const)
      };
    })
    .filter((candidate) => candidate.reason.length > 0);

  return {
    candidates,
    status: candidates.length > 0 ? "suspicious" : "none",
    source: "measured",
    confidence: candidates.some((candidate) => candidate.confidence === "medium") ? "medium" : "low"
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
