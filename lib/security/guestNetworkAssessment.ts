import type { DeviceClassification, GuestNetworkAssessment, NetworkSecurityFinding } from "@/lib/security/networkProbeTypes";

export function assessGuestNetwork(input: {
  ssid: string;
  gatewayReachable: boolean;
  visibleDeviceCount: number;
  classifications: DeviceClassification[];
  captivePortalLikely?: boolean | null;
}): GuestNetworkAssessment {
  const ssidSignals = guestSsidSignals(input.ssid);
  const visibleInfrastructure = input.classifications.filter((item) => item.deviceClass !== "phone" && item.deviceClass !== "unknown").length;
  const clientIsolationLikely = input.gatewayReachable && input.visibleDeviceCount <= 2 && visibleInfrastructure === 0;

  if (ssidSignals.length > 0 && clientIsolationLikely) {
    return result("present", true, input.captivePortalLikely ?? null, ssidSignals, 92, "high");
  }

  if (ssidSignals.length > 0 || clientIsolationLikely || input.captivePortalLikely) {
    return result("likely_present", clientIsolationLikely, input.captivePortalLikely ?? null, ssidSignals, 72, "medium");
  }

  if (visibleInfrastructure > 0 || input.visibleDeviceCount > 3) {
    return result("not_present", false, input.captivePortalLikely ?? null, ssidSignals, 38, "medium");
  }

  return result("unknown", null, input.captivePortalLikely ?? null, ssidSignals, 50, "low");
}

export function guestNetworkFinding(assessment: GuestNetworkAssessment): NetworkSecurityFinding {
  const measuredAt = new Date().toISOString();
  const good = assessment.status === "present" || assessment.status === "likely_present";
  const bad = assessment.status === "not_present";

  return {
    id: `guest_network_${assessment.status}`,
    checkId: "guest_network",
    title: good ? "Gastnetz wahrscheinlich vorhanden" : bad ? "Kein Gastnetz erkennbar" : "Gastnetz nicht sicher bewertbar",
    severity: bad ? "medium" : "low",
    status: good ? "secure" : bad ? "warning" : "unknown",
    detected: bad,
    confidence: assessment.confidence,
    details: good
      ? "SSID, Geräte-Sichtbarkeit und Client-Isolation sprechen für ein getrenntes Gastnetz."
      : bad
        ? "Es sind mehrere Praxis-/Infrastrukturgeräte sichtbar; ein separates Gastnetz ist nicht erkennbar."
        : "Mobile Plattformen erlauben keine eindeutige VLAN-Prüfung. Das Ergebnis bleibt eine Heuristik.",
    recommendation: good
      ? "Gastnetz beibehalten und vom Praxisnetz isoliert lassen."
      : "Gäste-WLAN im Router oder Access-Point einrichten und vom Praxisnetz per VLAN/Client-Isolation trennen.",
    scoreImpact: bad ? -15 : assessment.status === "unknown" ? -3 : 0,
    complianceImpact: bad ? "technical_measure" : "documentation",
    evidence: {
      source: assessment.source,
      raw: {
        score: assessment.score,
        clientIsolationLikely: assessment.clientIsolationLikely,
        captivePortalLikely: assessment.captivePortalLikely,
        ssidSignals: assessment.ssidSignals.length
      },
      measuredAt
    }
  };
}

function result(
  status: GuestNetworkAssessment["status"],
  clientIsolationLikely: boolean | null,
  captivePortalLikely: boolean | null,
  ssidSignals: string[],
  score: number,
  confidence: GuestNetworkAssessment["confidence"]
): GuestNetworkAssessment {
  return {
    status,
    clientIsolationLikely,
    captivePortalLikely,
    ssidSignals,
    score,
    source: "inferred",
    confidence
  };
}

function guestSsidSignals(ssid: string) {
  const normalized = ssid.toLowerCase();
  return ["guest", "gast", "besucher", "visitor", "public"].filter((token) => normalized.includes(token));
}
