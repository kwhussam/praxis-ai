import type { DeviceClassification, NetworkSecurityFinding, SegmentationAssessment } from "@/lib/security/networkProbeTypes";

export function assessNetworkSegmentation(input: {
  guestNetworkStatus: "present" | "likely_present" | "not_present" | "unknown";
  classifications: DeviceClassification[];
  visibleDeviceCount: number;
}): SegmentationAssessment {
  const classes = new Set(input.classifications.map((item) => item.deviceClass));
  const riskyCoLocation: string[] = [];
  const sharedSegments: SegmentationAssessment["sharedSegments"] = [];

  if (input.guestNetworkStatus === "not_present") {
    sharedSegments.push("guests");
    riskyCoLocation.push("Gäste scheinen nicht sauber vom Praxisnetz getrennt zu sein.");
  }

  if (classes.has("printer")) sharedSegments.push("printers");
  if (classes.has("nas") || classes.has("database_server") || classes.has("server")) sharedSegments.push("servers");
  if (classes.has("camera_iot")) sharedSegments.push("iot");
  if (classes.has("medical_device")) sharedSegments.push("medical");

  if ((classes.has("nas") || classes.has("database_server")) && (classes.has("printer") || classes.has("camera_iot"))) {
    riskyCoLocation.push("Server-/Speichergeräte und Drucker/IoT sind im gleichen sichtbaren Segment.");
  }

  if (classes.has("medical_device") && input.visibleDeviceCount > 2) {
    riskyCoLocation.push("Medizinische Geräte-Metadaten sind zusammen mit weiteren Geräten sichtbar.");
  }

  const penalty = Math.min(100, riskyCoLocation.length * 24 + Math.max(0, sharedSegments.length - 1) * 8);
  const score = Math.max(0, 100 - penalty);
  const status = score >= 80 ? "good" : score >= 55 ? "partial" : riskyCoLocation.length > 0 ? "weak" : "unknown";

  return {
    score,
    status,
    sharedSegments: Array.from(new Set(sharedSegments)),
    riskyCoLocation,
    source: "inferred",
    confidence: input.classifications.length > 0 ? "medium" : "low"
  };
}

export function segmentationFinding(assessment: SegmentationAssessment): NetworkSecurityFinding {
  const measuredAt = new Date().toISOString();
  const weak = assessment.status === "weak";
  const partial = assessment.status === "partial";

  return {
    id: `network_segmentation_${assessment.status}`,
    checkId: "network_segmentation",
    title: weak ? "Netzwerksegmentierung wirkt schwach" : partial ? "Netzwerksegmentierung teilweise erkennbar" : "Netzwerksegmentierung unauffällig",
    severity: weak ? "high" : partial ? "medium" : "low",
    status: weak ? "critical" : partial ? "warning" : assessment.status === "good" ? "secure" : "unknown",
    detected: weak || partial,
    confidence: assessment.confidence,
    details:
      assessment.riskyCoLocation.length > 0
        ? assessment.riskyCoLocation.join(" ")
        : "Aus den sichtbaren Geräten ergibt sich kein klarer Hinweis auf gemeinsam betriebene Risiko-Segmente.",
    recommendation:
      "Praxisgeräte, Gäste, Server/NAS, Drucker, IoT/Kameras und medizinische Geräte in getrennte VLANs oder getrennte WLANs aufteilen.",
    scoreImpact: weak ? -25 : partial ? -10 : 0,
    complianceImpact: weak || partial ? "technical_measure" : "none",
    evidence: {
      source: assessment.source,
      raw: {
        score: assessment.score,
        sharedSegments: assessment.sharedSegments.length,
        riskyCoLocation: assessment.riskyCoLocation.length
      },
      measuredAt
    }
  };
}
