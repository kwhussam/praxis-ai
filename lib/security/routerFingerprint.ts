import type { DeviceClassification, HttpAdminProbeResult, NetworkSecurityFinding, RouterFingerprint } from "@/lib/security/networkProbeTypes";

const ROUTER_HINTS = ["fritz", "avm", "speedport", "telekom", "ubiquiti", "unifi", "tp-link", "netgear", "asus", "mikrotik", "draytek", "lancom"];

export function fingerprintRouter(input: {
  http: HttpAdminProbeResult[];
  classification?: DeviceClassification;
}): RouterFingerprint {
  const evidence = [
    ...(input.classification?.signals ?? []),
    ...input.http.flatMap((probe) => [probe.serverHeader, probe.statusCode ? `status:${probe.statusCode}` : undefined]).filter((value): value is string => Boolean(value))
  ];
  const text = evidence.join(" ").toLowerCase();
  const vendor = ROUTER_HINTS.find((hint) => text.includes(hint));
  const httpOpen = input.http.some((probe) => probe.port !== 443 && probe.state === "open");
  const httpsOpen = input.http.some((probe) => probe.port === 443 && probe.state === "open");

  return {
    vendor: vendor ? normalizeVendor(vendor) : input.classification?.vendor,
    model: extractModel(evidence),
    firmwareHint: evidence.find((item) => /firmware|version|os|routeros/i.test(item)),
    managementInterface: httpOpen && httpsOpen ? "both" : httpsOpen ? "https" : httpOpen ? "http" : "unknown",
    evidence,
    source: evidence.length > 0 ? "inferred" : "unavailable",
    confidence: vendor || input.classification?.vendor ? "medium" : "low"
  };
}

export function routerFirmwareFinding(fingerprint: RouterFingerprint): NetworkSecurityFinding {
  const measuredAt = new Date().toISOString();
  const risky = fingerprint.managementInterface === "http" || fingerprint.managementInterface === "both";

  return {
    id: risky ? "router_firmware_review_recommended" : "router_firmware_hint",
    checkId: "router_firmware",
    title: fingerprint.vendor ? `Router-Hinweis: ${fingerprint.vendor}` : "Router-Firmware nicht eindeutig erkennbar",
    severity: risky ? "medium" : "low",
    status: risky ? "warning" : "unknown",
    detected: risky,
    confidence: fingerprint.confidence,
    details:
      "Die App leitet Hersteller-/Firmware-Hinweise nur aus HTTP-Headern, BSSID/OUI, mDNS/SSDP oder Bannern ab. Es wird keine Firmware heruntergeladen oder installiert.",
    recommendation:
      "Routermodell im Administrationsmenü prüfen und Firmware-Updates durch den IT-Dienstleister installieren lassen.",
    scoreImpact: risky ? -5 : 0,
    complianceImpact: "documentation",
    evidence: {
      source: fingerprint.source,
      raw: {
        vendor: fingerprint.vendor ?? null,
        model: fingerprint.model ?? null,
        managementInterface: fingerprint.managementInterface
      },
      measuredAt
    }
  };
}

function normalizeVendor(value: string) {
  if (value === "fritz") return "AVM FRITZ!Box";
  if (value === "unifi") return "Ubiquiti UniFi";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function extractModel(evidence: string[]) {
  const candidate = evidence.find((item) => /fritz!box|speedport|routerboard|unifi/i.test(item));
  return candidate?.slice(0, 80);
}
