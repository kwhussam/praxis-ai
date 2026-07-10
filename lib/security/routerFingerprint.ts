import type { DeviceClassification, HttpAdminProbeResult, NetworkSecurityFinding, RouterFingerprint } from "@/lib/security/networkProbeTypes";

const ROUTER_HINTS = ["fritz", "avm", "speedport", "telekom", "ubiquiti", "unifi", "tp-link", "netgear", "asus", "mikrotik", "draytek", "lancom"];

export type RouterDocumentationAnswers = {
  manufacturerDocumented?: boolean;
  modelDocumented?: boolean;
  firmwareVersionDocumented?: boolean;
  updateStatusDocumented?: boolean;
  firmwareCurrent?: boolean;
  itProviderDocumented?: boolean;
};

export function fingerprintRouter(input: {
  http: HttpAdminProbeResult[];
  classification?: DeviceClassification;
  structured?: RouterDocumentationAnswers;
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
    structured: input.structured,
    managementInterface: httpOpen && httpsOpen ? "both" : httpsOpen ? "https" : httpOpen ? "http" : "unknown",
    evidence,
    source: input.structured ? "questionnaire" : evidence.length > 0 ? "inferred" : "unavailable",
    confidence: input.structured ? "medium" : vendor || input.classification?.vendor ? "medium" : "low"
  };
}

export function routerFirmwareFinding(fingerprint: RouterFingerprint): NetworkSecurityFinding {
  const measuredAt = new Date().toISOString();
  const risky = fingerprint.managementInterface === "http" || fingerprint.managementInterface === "both";
  const structured = fingerprint.structured;
  const documentationComplete =
    structured?.manufacturerDocumented === true &&
    structured.modelDocumented === true &&
    structured.firmwareVersionDocumented === true &&
    structured.updateStatusDocumented === true &&
    structured.firmwareCurrent === true &&
    structured.itProviderDocumented === true;
  const documentationIncomplete = Boolean(structured) && !documentationComplete;

  return {
    id: risky ? "router_firmware_review_recommended" : documentationComplete ? "router_firmware_documented" : "router_firmware_hint",
    checkId: "router_firmware",
    title: documentationComplete
      ? "Router-Angaben vollständig dokumentiert"
      : fingerprint.vendor
        ? `Router-Hinweis: ${fingerprint.vendor}`
        : "Router-Firmware nicht eindeutig dokumentiert",
    severity: risky || documentationIncomplete ? "medium" : "low",
    status: risky || documentationIncomplete ? "warning" : documentationComplete ? "secure" : "unknown",
    detected: risky || documentationIncomplete,
    confidence: fingerprint.confidence,
    details:
      documentationComplete
        ? "Hersteller, Modell, Firmware-Version, Update-Status und zuständiger IT-Dienstleister wurden per Fragebogen dokumentiert."
        : "Die App leitet technische Hersteller-/Firmware-Hinweise nur aus HTTP-Headern, BSSID/OUI, mDNS/SSDP oder Bannern ab. Strukturierte Routerangaben sollten per Nachweis dokumentiert werden.",
    recommendation:
      documentationComplete
        ? "Routerdokumentation aktuell halten und Firmware-Update-Status regelmäßig prüfen."
        : "Hersteller, Modell, Firmware-Version, Update-Status und zuständigen IT-Dienstleister dokumentieren.",
    scoreImpact: risky ? -5 : documentationIncomplete ? -4 : 0,
    complianceImpact: documentationComplete ? "none" : "documentation",
    evidence: {
      source: fingerprint.source,
      raw: {
        vendor: fingerprint.vendor ?? null,
        model: fingerprint.model ?? null,
        managementInterface: fingerprint.managementInterface,
        manufacturerDocumented: structured?.manufacturerDocumented ?? null,
        modelDocumented: structured?.modelDocumented ?? null,
        firmwareVersionDocumented: structured?.firmwareVersionDocumented ?? null,
        updateStatusDocumented: structured?.updateStatusDocumented ?? null,
        firmwareCurrent: structured?.firmwareCurrent ?? null,
        itProviderDocumented: structured?.itProviderDocumented ?? null
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
