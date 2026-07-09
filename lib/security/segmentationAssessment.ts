import type { DeviceClass, DeviceClassification, NetworkSecurityFinding, NetworkSegmentId, SegmentationAssessment } from "@/lib/security/networkProbeTypes";

export const NETWORK_SEGMENTS: Array<{ id: NetworkSegmentId; label: string }> = [
  { id: "practice_wifi", label: "Praxis-WLAN" },
  { id: "guest_wifi", label: "Gäste-WLAN" },
  { id: "server_network", label: "Servernetz" },
  { id: "printer_network", label: "Druckernetz" },
  { id: "medical_device_network", label: "Medizingerätenetz" }
];

export type NetworkSegmentObservation = {
  segment: NetworkSegmentId;
  ssid?: string;
  gatewayIp?: string;
  visibleDeviceCount: number;
  deviceClasses: DeviceClass[];
  exposedServices: string[];
  observedAt: string;
};

export function assessNetworkSegmentation(input: {
  guestNetworkStatus: "present" | "likely_present" | "not_present" | "unknown";
  classifications: DeviceClassification[];
  visibleDeviceCount: number;
  observations?: NetworkSegmentObservation[];
}): SegmentationAssessment {
  const classes = new Set(input.classifications.map((item) => item.deviceClass));
  const riskyCoLocation: string[] = [];
  const sharedSegments: SegmentationAssessment["sharedSegments"] = [];
  const multiSegment = input.observations ? assessMultiSegmentObservations(input.observations) : null;

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

  riskyCoLocation.push(...(multiSegment?.riskyCoLocation ?? []));
  sharedSegments.push(...(multiSegment?.sharedSegments ?? []));

  const penalty = Math.min(100, riskyCoLocation.length * 24 + Math.max(0, Array.from(new Set(sharedSegments)).length - 1) * 8);
  const score = Math.max(0, 100 - penalty);
  const status = score >= 80 ? "good" : score >= 55 ? "partial" : riskyCoLocation.length > 0 ? "weak" : "unknown";
  const observedSegments = multiSegment?.observedSegments ?? [];

  return {
    score,
    status,
    sharedSegments: Array.from(new Set(sharedSegments)),
    riskyCoLocation: Array.from(new Set(riskyCoLocation)),
    observedSegments,
    missingSegments: NETWORK_SEGMENTS.map((segment) => segment.id).filter((segment) => !observedSegments.includes(segment)),
    crossSegmentExposure: multiSegment?.crossSegmentExposure ?? [],
    source: "inferred",
    confidence: observedSegments.length >= 3 ? "high" : input.classifications.length > 0 || observedSegments.length > 0 ? "medium" : "low"
  };
}

export function buildNetworkSegmentObservation(input: {
  segment: NetworkSegmentId;
  ssid?: string;
  gatewayIp?: string;
  visibleDeviceCount: number;
  classifications: DeviceClassification[];
  exposedServices: string[];
  observedAt?: Date;
}): NetworkSegmentObservation {
  return {
    segment: input.segment,
    ssid: input.ssid,
    gatewayIp: input.gatewayIp,
    visibleDeviceCount: input.visibleDeviceCount,
    deviceClasses: Array.from(new Set(input.classifications.map((classification) => classification.deviceClass))),
    exposedServices: Array.from(new Set(input.exposedServices)),
    observedAt: (input.observedAt ?? new Date()).toISOString()
  };
}

function assessMultiSegmentObservations(observations: NetworkSegmentObservation[]) {
  const latestBySegment = new Map<NetworkSegmentId, NetworkSegmentObservation>();
  observations.forEach((observation) => latestBySegment.set(observation.segment, observation));

  const latest = Array.from(latestBySegment.values());
  const riskyCoLocation: string[] = [];
  const sharedSegments: SegmentationAssessment["sharedSegments"] = [];
  const crossSegmentExposure: string[] = [];

  latest.forEach((observation) => {
    const classes = new Set(observation.deviceClasses);
    if (observation.segment === "guest_wifi" && observation.visibleDeviceCount > 1) {
      riskyCoLocation.push("Im Gäste-WLAN sind mehrere Geräte sichtbar; Client-Isolation sollte geprüft werden.");
      sharedSegments.push("guests");
    }
    if (observation.segment === "guest_wifi" && (classes.has("nas") || classes.has("server") || classes.has("database_server") || classes.has("printer") || classes.has("medical_device"))) {
      riskyCoLocation.push("Im Gäste-WLAN sind Praxis-, Server-, Drucker- oder Medizin-Geräte sichtbar.");
      crossSegmentExposure.push("guest_wifi_to_internal_assets");
    }
    if (observation.segment === "printer_network" && (classes.has("nas") || classes.has("database_server") || classes.has("medical_device"))) {
      riskyCoLocation.push("Im Druckernetz sind Server-/NAS- oder Medizin-Geräte sichtbar.");
      crossSegmentExposure.push("printer_network_to_sensitive_assets");
    }
    if (observation.segment === "medical_device_network" && observation.visibleDeviceCount > 3) {
      riskyCoLocation.push("Im Medizingerätenetz sind zusätzliche Geräte sichtbar; Zweck und Segmentgrenzen prüfen.");
      sharedSegments.push("medical");
    }
    if (observation.segment === "server_network" && classes.has("camera_iot")) {
      riskyCoLocation.push("Im Servernetz sind IoT-/Kamera-Geräte sichtbar.");
      crossSegmentExposure.push("server_network_to_iot");
    }
  });

  return {
    observedSegments: latest.map((observation) => observation.segment),
    sharedSegments: Array.from(new Set(sharedSegments)),
    riskyCoLocation: Array.from(new Set(riskyCoLocation)),
    crossSegmentExposure: Array.from(new Set(crossSegmentExposure))
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
        riskyCoLocation: assessment.riskyCoLocation.length,
        observedSegments: assessment.observedSegments?.length ?? 0,
        missingSegments: assessment.missingSegments?.length ?? 0,
        crossSegmentExposure: assessment.crossSegmentExposure?.length ?? 0
      },
      measuredAt
    }
  };
}
