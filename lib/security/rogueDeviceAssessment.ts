import type { NetworkSecurityFinding, RogueDeviceAssessment } from "@/lib/security/networkProbeTypes";
import type { KnownDevice } from "@/lib/inventory/types";

type DeviceSnapshot = {
  ipAddress: string;
  hostname?: string;
  macAddress?: string;
  deviceType?: string;
  isKnown?: boolean;
  openPorts?: Array<{ port: number; state: string; risk?: string }>;
};

const SUSPICIOUS_PORTS = new Set([23, 3389, 3306, 5432, 2049]);

export function assessRogueDevices(
  currentDevices: DeviceSnapshot[],
  previousDevices: DeviceSnapshot[],
  knownDevices: KnownDevice[] = []
): RogueDeviceAssessment {
  const previousKeys = new Set(previousDevices.map(deviceKey));
  const knownMacs = new Set(knownDevices.map((device) => normalizeMac(device.macAddress)).filter(Boolean));
  const knownHostnames = new Set(knownDevices.map((device) => device.hostname.trim().toLowerCase()).filter(Boolean));
  const unknownDevices = currentDevices.filter((device) => !isKnownDevice(device, knownMacs, knownHostnames));
  const newDevices = currentDevices.filter((device) => !previousKeys.has(deviceKey(device)) && !isKnownDevice(device, knownMacs, knownHostnames));
  const suspiciousDevices = currentDevices.filter((device) => {
    return (
      !isKnownDevice(device, knownMacs, knownHostnames) &&
      (device.openPorts ?? []).some((port) => port.state === "open" && (SUSPICIOUS_PORTS.has(port.port) || port.risk === "critical"))
    );
  });

  return {
    knownDevices: currentDevices.length - unknownDevices.length,
    unknownDevices: unknownDevices.map((device) => device.ipAddress),
    suspiciousDevices: suspiciousDevices.map((device) => device.ipAddress),
    newDevices: newDevices.map((device) => device.ipAddress),
    status: suspiciousDevices.length > 0 ? "suspicious" : unknownDevices.length > 0 || newDevices.length > 0 ? "unknown_devices" : "clean",
    source: "inferred",
    confidence: knownDevices.length > 0 ? "high" : previousDevices.length > 0 ? "medium" : "low"
  };
}

export function rogueDeviceFinding(assessment: RogueDeviceAssessment): NetworkSecurityFinding {
  const measuredAt = new Date().toISOString();
  const suspicious = assessment.status === "suspicious";
  const unknown = assessment.status === "unknown_devices";

  return {
    id: suspicious ? "rogue_device_suspicious" : unknown ? "rogue_device_unknown" : "rogue_device_clean",
    checkId: "rogue_device",
    title: suspicious ? "Verdächtige Geräte sichtbar" : unknown ? "Unbekannte oder neue Geräte sichtbar" : "Keine Rogue-Device-Hinweise",
    severity: suspicious ? "high" : unknown ? "medium" : "low",
    status: suspicious ? "critical" : unknown ? "warning" : "secure",
    detected: suspicious || unknown,
    confidence: assessment.confidence,
    details: suspicious
      ? "Mindestens ein unbekanntes Gerät bietet ungewöhnliche oder kritische Dienste an."
      : unknown
        ? "Es wurden unbekannte oder seit dem letzten Scan neue Geräte erkannt."
        : "Keine neuen oder verdächtigen Geräte gegenüber der lokalen Bewertung sichtbar.",
    recommendation: suspicious
      ? "Geräte sofort identifizieren, dokumentieren oder vom Netz trennen. Kritische Dienste prüfen."
      : unknown
        ? "Geräteliste mit dem IT-Dienstleister abgleichen und neue Geräte dokumentieren."
        : "Geräteinventar weiter pflegen.",
    scoreImpact: suspicious ? -25 : unknown ? -8 : 0,
    complianceImpact: suspicious || unknown ? "technical_measure" : "none",
    evidence: {
      source: assessment.source,
      raw: {
        unknownDevices: assessment.unknownDevices.length,
        suspiciousDevices: assessment.suspiciousDevices.length,
        newDevices: assessment.newDevices.length
      },
      measuredAt
    }
  };
}

function deviceKey(device: DeviceSnapshot) {
  return device.macAddress || `${device.hostname ?? "unknown"}@${device.ipAddress}`;
}

function isKnownDevice(device: DeviceSnapshot, knownMacs: Set<string>, knownHostnames: Set<string>) {
  if (device.isKnown) return true;
  const mac = normalizeMac(device.macAddress);
  if (mac && knownMacs.has(mac)) return true;
  const hostname = device.hostname?.trim().toLowerCase();
  return Boolean(hostname && knownHostnames.has(hostname));
}

function normalizeMac(value?: string) {
  const cleaned = value?.trim().replace(/[^a-fA-F0-9]/g, "").toUpperCase();
  if (!cleaned || cleaned.length !== 12) return "";
  return cleaned.match(/.{1,2}/g)?.join(":") ?? "";
}
