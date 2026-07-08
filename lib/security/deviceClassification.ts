import type {
  DeviceClassification,
  HttpAdminProbeResult,
  MdnsServiceResult,
  SnmpProbeResult,
  SsdpProbeResult,
  TcpProbeResult
} from "@/lib/security/networkProbeTypes";

type ClassificationInput = {
  host: string;
  hostname?: string;
  macAddress?: string;
  http: HttpAdminProbeResult[];
  tcp: TcpProbeResult[];
  ssdp?: SsdpProbeResult;
  mdns?: MdnsServiceResult[];
  snmp?: SnmpProbeResult[];
};

const MEDICAL_HINTS = ["dicom", "hl7", "med", "siemens", "philips", "ge", "mindray", "drager", "draeger", "ultrasound", "xray"];
const PRINTER_HINTS = ["printer", "druck", "ipp", "jetdirect", "hp", "brother", "canon", "epson", "kyocera", "xerox"];
const NAS_HINTS = ["nas", "synology", "qnap", "truenas", "freenas", "smb", "nfs", "afp"];
const CAMERA_IOT_HINTS = ["camera", "cam", "rtsp", "onvif", "hikvision", "dahua", "axis", "iot"];

export function classifyDevice(input: ClassificationInput): DeviceClassification {
  const signals = collectSignals(input);
  const text = signals.join(" ").toLowerCase();
  const openPorts = input.tcp.filter((probe) => probe.state === "open").map((probe) => probe.port);

  if (matches(text, MEDICAL_HINTS)) {
    return classification(input.host, "medical_device", "low", signals, undefined, medicalBoundary());
  }

  if (openPorts.includes(3306) || openPorts.includes(5432)) {
    return classification(input.host, "database_server", "high", signals);
  }

  if (openPorts.includes(9100) || openPorts.includes(631) || matches(text, PRINTER_HINTS)) {
    return classification(input.host, "printer", openPorts.includes(9100) || openPorts.includes(631) ? "high" : "medium", signals);
  }

  if (openPorts.includes(445) || openPorts.includes(139) || openPorts.includes(2049) || openPorts.includes(548) || matches(text, NAS_HINTS)) {
    return classification(input.host, "nas", openPorts.includes(2049) || openPorts.includes(445) ? "high" : "medium", signals);
  }

  if (input.ssdp?.active || openPorts.includes(554) || matches(text, CAMERA_IOT_HINTS)) {
    return classification(input.host, "camera_iot", "medium", signals);
  }

  return classification(input.host, "unknown", "low", signals);
}

export function vendorFromMetadata(input: { macAddress?: string; signals: string[] }) {
  const oui = input.macAddress?.slice(0, 8).toUpperCase();
  const signalText = input.signals.join(" ").toLowerCase();
  if (oui && LOCAL_OUI_HINTS[oui]) return LOCAL_OUI_HINTS[oui];
  if (signalText.includes("synology")) return "Synology";
  if (signalText.includes("qnap")) return "QNAP";
  if (signalText.includes("brother")) return "Brother";
  if (signalText.includes("kyocera")) return "Kyocera";
  if (signalText.includes("hikvision")) return "Hikvision";
  if (signalText.includes("axis")) return "Axis";
  if (signalText.includes("philips")) return "Philips";
  if (signalText.includes("siemens")) return "Siemens";
  return undefined;
}

function collectSignals(input: ClassificationInput) {
  const signals = new Set<string>();
  if (input.hostname) signals.add(input.hostname);
  input.http.forEach((probe) => {
    if (probe.state === "open") signals.add(`http:${probe.port}`);
    if (probe.serverHeader) signals.add(probe.serverHeader);
  });
  input.tcp.filter((probe) => probe.state === "open").forEach((probe) => signals.add(`tcp:${probe.port}`));
  input.ssdp?.devices.forEach((device) => {
    if (device.server) signals.add(device.server);
    if (device.st) signals.add(device.st);
    if (device.usn) signals.add(device.usn);
  });
  input.mdns?.forEach((service) => {
    signals.add(service.type);
    if (service.name) signals.add(service.name);
    if (service.host) signals.add(service.host);
    Object.values(service.txt ?? {}).forEach((value) => signals.add(value));
  });
  input.snmp?.forEach((probe) => {
    if (probe.sysDescr) signals.add(probe.sysDescr);
    if (probe.sysObjectId) signals.add(probe.sysObjectId);
  });
  return Array.from(signals);
}

function classification(
  host: string,
  deviceClass: DeviceClassification["deviceClass"],
  confidence: DeviceClassification["confidence"],
  signals: string[],
  vendor?: string,
  privacyBoundary = "Die App nutzt nur technische Netzwerk-Metadaten und öffnet keine Freigaben, Logins oder Inhalte."
): DeviceClassification {
  return {
    host,
    deviceClass,
    confidence,
    signals,
    privacyBoundary,
    vendor: vendor ?? vendorFromMetadata({ signals })
  };
}

function matches(text: string, hints: string[]) {
  return hints.some((hint) => text.includes(hint));
}

function medicalBoundary() {
  return "Geräteklasse nur vorsichtig aus technischen Metadaten abgeleitet. Die App liest keine Patientendaten und analysiert keine medizinischen Protokollinhalte.";
}

const LOCAL_OUI_HINTS: Record<string, string> = {
  "00:11:32": "Synology",
  "00:08:9B": "ICP/QNAP",
  "00:1B:A9": "Brother",
  "00:17:C8": "Kyocera",
  "00:40:8C": "Axis",
  "00:18:8B": "Dahua"
};
