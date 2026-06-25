import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";
import * as Device from "expo-device";
import * as Network from "expo-network";
import { MMKV } from "react-native-mmkv";

import {
  getCurrentWifiSsid,
  scanLocalDevices,
  scanVisibleWifiNetworks,
  type NativeWifiNetwork
} from "@/lib/security/nativeWifi";
import { supabase } from "@/lib/api/supabase";

export type SecurityProtocol = "WEP" | "WPA" | "WPA2" | "WPA3" | "OPEN" | "UNKNOWN";

export type WlanVulnCategory =
  | "encryption"
  | "default_credentials"
  | "open_ports"
  | "unencrypted_traffic"
  | "rogue_devices"
  | "dns_hijacking"
  | "guest_network"
  | "firmware_outdated"
  | "upnp_enabled"
  | "wps_enabled";

export interface Vulnerability {
  id: string;
  title: string;
  description: string;
  severity: "critical" | "high" | "medium" | "low";
  remediation: string;
  cvss?: number;
  category: WlanVulnCategory;
}

export interface PortProbe {
  port: number;
  service: string;
  state: "open" | "closed" | "filtered" | "unknown";
  risk: "critical" | "high" | "medium" | "low" | "info";
}

export interface DeviceInfo {
  id: string;
  ipAddress: string;
  hostname: string;
  macAddress?: string;
  vendor?: string;
  deviceType: "gateway" | "phone" | "workstation" | "printer" | "server" | "iot" | "unknown";
  isKnown: boolean;
  isGateway?: boolean;
  openPorts: PortProbe[];
  riskTags: string[];
  lastSeen: Date;
}

export interface WlanScanResult {
  networkName: string;
  securityProtocol: SecurityProtocol;
  ipAddress: string;
  subnetMask: string;
  gatewayIp: string;
  dnsServers: string[];
  connectedDevices: DeviceInfo[];
  vulnerabilities: Vulnerability[];
  riskScore: number;
  timestamp: Date;
}

export type WlanScanProgress = {
  phaseId: string;
  phaseIndex: number;
  phaseCount: number;
  check: string;
  progress: number;
  discoveredDevices: DeviceInfo[];
  vulnerabilities: Vulnerability[];
};

export const SCAN_PHASES = [
  {
    id: "network_info",
    label: "Netzwerkinfo wird gelesen",
    icon: "wifi",
    checks: [
      "SSID und BSSID ermitteln",
      "IP-Adressbereich analysieren",
      "Gateway und DNS-Server prüfen",
      "WLAN-Sicherheitsprotokoll erkennen (WEP/WPA/WPA2/WPA3)"
    ]
  },
  {
    id: "encryption_check",
    label: "Verschlüsselung wird geprüft",
    icon: "lock",
    checks: [
      "WLAN-Protokoll auf Schwachstellen prüfen",
      "WPS-Status ermitteln (Brute-Force-Risiko)",
      "Offenes WLAN ohne Passwort erkennen"
    ]
  },
  {
    id: "port_scan",
    label: "Gateway wird analysiert",
    icon: "server",
    checks: [
      "Router-Webinterface erkennen (Port 80/443/8080)",
      "Telnet-Zugang prüfen (Port 23 - kritisch)",
      "SSH-Zugang ermitteln (Port 22)",
      "UPnP-Service erkennen (Port 1900)",
      "Praxissoftware-Ports prüfen (Port 3306, 5432)",
      "SMB/Windows-Freigaben prüfen (Port 445 - kritisch)"
    ]
  },
  {
    id: "device_discovery",
    label: "Geräte im Netzwerk werden erkannt",
    icon: "devices",
    checks: [
      "ARP-Scan des lokalen Subnetzes",
      "Geräteklassen identifizieren (PC, Drucker, IoT, Handy)",
      "Unbekannte/verdächtige Geräte markieren",
      "Netzwerksegmentierung prüfen (Gäste-WLAN vorhanden?)"
    ]
  },
  {
    id: "dns_check",
    label: "DNS-Sicherheit wird analysiert",
    icon: "globe",
    checks: [
      "DNS-Server gegen bekannte unsichere Server prüfen",
      "DNS-over-HTTPS/TLS-Unterstützung prüfen",
      "DNS-Hijacking-Indikatoren erkennen"
    ]
  },
  {
    id: "traffic_analysis",
    label: "Datenverkehr wird bewertet",
    icon: "activity",
    checks: [
      "Unverschlüsselte HTTP-Kommunikation erkennen",
      "Prüfung ob Praxissoftware verschlüsselt kommuniziert",
      "Dateifreigaben ohne Authentifizierung erkennen"
    ]
  }
] as const;

type VulnerabilityDefinition = Omit<Vulnerability, "id">;

export const WLAN_VULNERABILITIES = {
  WEP_ENCRYPTION: {
    title: "WEP-Verschlüsselung aktiv",
    severity: "critical",
    description:
      "WEP gilt seit 2004 als gebrochen und kann in Minuten geknackt werden. Patientendaten sind ungeschützt.",
    remediation: "Wechseln Sie sofort zu WPA3 oder mindestens WPA2. Kontaktieren Sie Ihren IT-Dienstleister.",
    cvss: 9.8,
    category: "encryption"
  },
  WPA_TKIP: {
    title: "WPA mit TKIP-Verschlüsselung",
    severity: "high",
    description: "WPA/TKIP ist veraltet und anfällig für KRACK-Angriffe. Aktuellere Verschlüsselung empfohlen.",
    remediation: "Upgrade auf WPA2-AES oder WPA3 im Router-Webinterface.",
    cvss: 7.4,
    category: "encryption"
  },
  WPS_ENABLED: {
    title: "WPS ist aktiviert",
    severity: "high",
    description: "WPS (Wi-Fi Protected Setup) ermöglicht Brute-Force-Angriffe auf das WLAN-Passwort.",
    remediation: "WPS im Router-Menü deaktivieren. Pfad: Router-IP -> Wireless -> WPS -> Disable.",
    cvss: 7.0,
    category: "wps_enabled"
  },
  OPEN_TELNET: {
    title: "Telnet-Port offen (Port 23)",
    severity: "critical",
    description: "Telnet überträgt alle Daten unverschlüsselt. Angreifer im Netz können Passwörter mitlesen.",
    remediation: "Telnet auf dem Router/Gerät sofort deaktivieren. SSH als Alternative nutzen.",
    cvss: 9.1,
    category: "open_ports"
  },
  OPEN_SMB: {
    title: "Windows-Dateifreigabe offen (Port 445)",
    severity: "critical",
    description:
      "SMB Port 445 ist das Hauptangriffsziel von Ransomware (z. B. WannaCry, NotPetya). Kritisch in Praxisumgebungen.",
    remediation:
      "SMB-Freigaben absichern: Authentifizierung erzwingen, SMBv1 deaktivieren, Firewall konfigurieren.",
    cvss: 9.3,
    category: "open_ports"
  },
  UPNP_ENABLED: {
    title: "UPnP am Router aktiviert",
    severity: "medium",
    description: "UPnP erlaubt Geräten, automatisch Ports im Router zu öffnen - ohne Wissen des Administrators.",
    remediation: "UPnP im Router-Menü deaktivieren.",
    cvss: 6.5,
    category: "upnp_enabled"
  },
  NO_GUEST_NETWORK: {
    title: "Kein separates Gäste-WLAN",
    severity: "medium",
    description: "Patienten oder Besucher im selben Netz wie Praxissoftware erhöht das Angriffsrisiko erheblich.",
    remediation: "Gäste-WLAN im Router einrichten - getrennt vom Praxis-Netzwerk (VLAN/Isolation).",
    cvss: 5.8,
    category: "guest_network"
  },
  UNKNOWN_DEVICES: {
    title: "Unbekannte Geräte im Netzwerk",
    severity: "high",
    description: "{count} Geräte im Netzwerk konnten keiner bekannten Praxisausstattung zugeordnet werden.",
    remediation: "Netzwerkliste mit IT-Dienstleister prüfen. MAC-Adressen-Filterung aktivieren.",
    cvss: 7.2,
    category: "rogue_devices"
  },
  DNS_UNENCRYPTED: {
    title: "DNS-Anfragen unverschlüsselt",
    severity: "medium",
    description: "Alle DNS-Anfragen (Webseitenaufrufe) sind für Netzwerkteilnehmer sichtbar.",
    remediation: "DNS-over-HTTPS aktivieren oder verschlüsselte DNS-Server nutzen (z.B. 1.1.1.1, 9.9.9.9).",
    cvss: 5.3,
    category: "dns_hijacking"
  },
  HTTP_SERVICES: {
    title: "Unverschlüsselte HTTP-Dienste erkannt",
    severity: "medium",
    description:
      "Dienste auf Port 80 übertragen Daten unverschlüsselt - Patientendaten könnten mitgelesen werden.",
    remediation: "Alle internen Dienste auf HTTPS umstellen.",
    cvss: 6.1,
    category: "unencrypted_traffic"
  },
  ROUTER_DEFAULT_PORT: {
    title: "Router-Webinterface erreichbar",
    severity: "low",
    description:
      "Das Router-Adminpanel ist aus dem internen Netz erreichbar. Standard-Passwörter müssen geändert sein.",
    remediation: "Router-Admin-Passwort ändern falls noch Standard. Webinterface ggf. deaktivieren.",
    cvss: 4.3,
    category: "default_credentials"
  }
} as const satisfies Record<string, VulnerabilityDefinition>;

const HTTP_PORTS = [
  { port: 80, service: "HTTP / Router-Webinterface", risk: "medium" },
  { port: 443, service: "HTTPS / Router-Webinterface", risk: "info" },
  { port: 8080, service: "HTTP-Admininterface", risk: "medium" }
] as const;

const HIGH_RISK_PORTS = [
  { port: 22, service: "SSH", risk: "low" },
  { port: 23, service: "Telnet", risk: "critical" },
  { port: 445, service: "SMB / Windows-Dateifreigabe", risk: "critical" },
  { port: 1900, service: "UPnP / SSDP", risk: "medium" },
  { port: 3306, service: "MySQL / Praxissoftware-Datenbank", risk: "high" },
  { port: 5432, service: "PostgreSQL / Praxissoftware-Datenbank", risk: "high" }
] as const;

const wlanScanStorage = new MMKV({
  id: "praxisshield-wlan-scans",
  encryptionKey: "praxisshield-local-wlan-v1"
});

type ScanContext = {
  state: NetInfoState;
  ssid: string;
  ipAddress: string;
  subnetMask: string;
  gatewayIp: string;
  dnsServers: string[];
  securityProtocol: SecurityProtocol;
  visibleNetworks: NativeWifiNetwork[];
  devices: DeviceInfo[];
  vulnerabilities: Vulnerability[];
};

export async function runWlanSecurityScan(options?: {
  onProgress?: (progress: WlanScanProgress) => void;
  phaseDelayMs?: number;
}): Promise<WlanScanResult> {
  const delayMs = options?.phaseDelayMs ?? 420;
  let context: ScanContext | null = null;

  for (let phaseIndex = 0; phaseIndex < SCAN_PHASES.length; phaseIndex += 1) {
    const phase = SCAN_PHASES[phaseIndex];

    for (let checkIndex = 0; checkIndex < phase.checks.length; checkIndex += 1) {
      emitProgress(options?.onProgress, phaseIndex, checkIndex, context);
      await sleep(delayMs);
    }

    if (phase.id === "network_info") {
      context = await readNetworkContext();
    }

    if (phase.id === "encryption_check" && context) {
      context.vulnerabilities.push(...assessEncryption(context.securityProtocol));
    }

    if (phase.id === "port_scan" && context) {
      const gatewayPorts = await scanGatewayPorts(context.gatewayIp);
      context.devices = upsertGatewayPorts(context.devices, context.gatewayIp, gatewayPorts);
      context.vulnerabilities.push(...assessPorts(gatewayPorts));
    }

    if (phase.id === "device_discovery" && context) {
      const discoveredDevices = await discoverNetworkDevices(context);
      context.devices = mergeDevices(context.devices, discoveredDevices);
      context.vulnerabilities.push(...assessDevices(context.devices));
    }

    if (phase.id === "dns_check" && context) {
      context.vulnerabilities.push(...assessDns(context.dnsServers));
    }

    if (phase.id === "traffic_analysis" && context) {
      context.vulnerabilities.push(...assessTraffic(context.devices));
    }
  }

  if (!context) {
    context = await readNetworkContext();
  }

  const result = {
    networkName: context.ssid,
    securityProtocol: context.securityProtocol,
    ipAddress: context.ipAddress,
    subnetMask: context.subnetMask,
    gatewayIp: context.gatewayIp,
    dnsServers: context.dnsServers,
    connectedDevices: context.devices,
    vulnerabilities: dedupeVulnerabilities(context.vulnerabilities),
    riskScore: calculateWlanRiskScore(context.vulnerabilities),
    timestamp: new Date()
  };

  persistWlanScanResultLocally(result);
  return result;
}

export function persistWlanScanResultLocally(result: WlanScanResult) {
  const payload = JSON.stringify({
    ...result,
    timestamp: result.timestamp.toISOString(),
    connectedDevices: result.connectedDevices.map((device) => ({
      ...device,
      lastSeen: device.lastSeen.toISOString()
    }))
  });

  wlanScanStorage.set("latest", payload);
  wlanScanStorage.set(`scan:${result.timestamp.toISOString()}`, payload);
}

export function getLatestWlanScanResult(): WlanScanResult | null {
  const payload = wlanScanStorage.getString("latest");
  if (!payload) return null;

  try {
    return reviveScanResult(JSON.parse(payload) as StoredWlanScanResult);
  } catch {
    return null;
  }
}

export async function syncWlanScanResultToSupabase(practiceId: string, result: WlanScanResult) {
  if (!isUuid(practiceId)) {
    return { ok: false, reason: "invalid_practice_id" as const };
  }

  const { error } = await supabase.from("wlan_scans").insert({
    practice_id: practiceId,
    network_info: {
      networkName: result.networkName,
      securityProtocol: result.securityProtocol,
      ipAddress: result.ipAddress,
      subnetMask: result.subnetMask,
      gatewayIp: result.gatewayIp,
      dnsServers: result.dnsServers,
      riskScore: result.riskScore,
      timestamp: result.timestamp.toISOString()
    },
    vulnerabilities: result.vulnerabilities,
    devices_found: result.connectedDevices.length,
    risk_level: riskLevelFromScore(result.riskScore)
  });

  if (error) return { ok: false, reason: error.message };
  return { ok: true as const };
}

export function calculateWlanRiskScore(vulnerabilities: Vulnerability[]) {
  const uniqueVulnerabilities = dedupeVulnerabilities(vulnerabilities);
  const penalty = uniqueVulnerabilities.reduce((sum, vulnerability) => {
    if (vulnerability.severity === "critical") return sum + 26;
    if (vulnerability.severity === "high") return sum + 18;
    if (vulnerability.severity === "medium") return sum + 10;
    return sum + 4;
  }, 0);

  return Math.max(0, Math.min(100, 100 - penalty));
}

export function mapWlanVulnerabilitiesToFindings(vulnerabilities: Vulnerability[]) {
  return vulnerabilities.map((vulnerability) => ({
    id: vulnerability.id,
    title: vulnerability.title,
    severity:
      vulnerability.severity === "critical" || vulnerability.severity === "high"
        ? ("critical" as const)
        : vulnerability.severity === "medium"
          ? ("warning" as const)
          : ("info" as const)
  }));
}

function emitProgress(
  onProgress: ((progress: WlanScanProgress) => void) | undefined,
  phaseIndex: number,
  checkIndex: number,
  context: ScanContext | null
) {
  if (!onProgress) return;
  const phase = SCAN_PHASES[phaseIndex];
  const completedChecks = SCAN_PHASES.slice(0, phaseIndex).reduce((sum, item) => sum + item.checks.length, 0);
  const totalChecks = SCAN_PHASES.reduce((sum, item) => sum + item.checks.length, 0);

  onProgress({
    phaseId: phase.id,
    phaseIndex,
    phaseCount: SCAN_PHASES.length,
    check: phase.checks[checkIndex],
    progress: Math.min(0.98, (completedChecks + checkIndex + 1) / totalChecks),
    discoveredDevices: context?.devices ?? [],
    vulnerabilities: dedupeVulnerabilities(context?.vulnerabilities ?? [])
  });
}

async function readNetworkContext(): Promise<ScanContext> {
  const state = await NetInfo.fetch();
  const details = (state.details && typeof state.details === "object" ? state.details : {}) as Record<string, unknown>;
  const detailIp = getStringProperty(details, "ipAddress");
  const fallbackIp = await Network.getIpAddressAsync().catch(() => "");
  const ipAddress = detailIp || fallbackIp || "0.0.0.0";
  const subnetMask = getStringProperty(details, "subnet") || inferSubnetMask(ipAddress);
  const gatewayIp = getStringProperty(details, "gateway") || inferGatewayIp(ipAddress);
  const ssid = await getCurrentSsid(state);
  const visibleNetworks = await scanVisibleWifiNetworks();
  const securityProtocol = inferSecurityProtocol(state, ssid, visibleNetworks);
  const dnsServers = getStringArrayProperty(details, "dns") || getStringArrayProperty(details, "dnsServers") || [];
  const devices = buildBaseDevices(ipAddress, gatewayIp);

  return {
    state,
    ssid,
    ipAddress,
    subnetMask,
    gatewayIp,
    dnsServers,
    securityProtocol,
    visibleNetworks,
    devices,
    vulnerabilities: []
  };
}

async function getCurrentSsid(state: NetInfoState) {
  const details = (state.details && typeof state.details === "object" ? state.details : {}) as Record<string, unknown>;
  const netInfoSsid = getStringProperty(details, "ssid");
  if (netInfoSsid) return stripWifiQuotes(netInfoSsid);

  const nativeSsid = await getCurrentWifiSsid();
  if (nativeSsid) return stripWifiQuotes(nativeSsid);

  return state.type === "wifi" ? "Praxis-WLAN" : "Kein WLAN verbunden";
}

function inferSecurityProtocol(state: NetInfoState, ssid: string, visibleNetworks: NativeWifiNetwork[]): SecurityProtocol {
  if (state.type !== "wifi") return "UNKNOWN";
  const currentNetwork = visibleNetworks.find((network) => stripWifiQuotes(network.ssid ?? "") === ssid);
  const capabilities = currentNetwork?.capabilities?.toUpperCase() ?? "";
  if (capabilities.includes("WPA3")) return "WPA3";
  if (capabilities.includes("WPA2")) return "WPA2";
  if (capabilities.includes("WPA")) return "WPA";
  if (capabilities.includes("WEP")) return "WEP";
  if (capabilities.includes("ESS") && !capabilities.includes("WPA") && !capabilities.includes("WEP")) return "OPEN";
  const normalizedSsid = ssid.toLowerCase();
  if (normalizedSsid.includes("open") || normalizedSsid.includes("freewifi")) return "OPEN";
  return "UNKNOWN";
}

function assessEncryption(protocol: SecurityProtocol): Vulnerability[] {
  if (protocol === "WEP") return [makeVulnerability("WEP_ENCRYPTION")];
  if (protocol === "WPA") return [makeVulnerability("WPA_TKIP")];
  if (protocol === "OPEN") {
    return [
      makeVulnerability("WEP_ENCRYPTION", {
        title: "Offenes WLAN ohne Passwort",
        description:
          "Das WLAN ist ohne Passwort erreichbar. Geräte im Empfangsbereich können dem Praxisnetz beitreten.",
        remediation: "Aktivieren Sie WPA3 oder mindestens WPA2-AES und vergeben Sie ein starkes WLAN-Passwort."
      })
    ];
  }
  return [];
}

async function scanGatewayPorts(gatewayIp: string): Promise<PortProbe[]> {
  if (!isPrivateIp(gatewayIp)) return [];

  const httpPorts = await Promise.all(
    HTTP_PORTS.map(async (item) => ({
      port: item.port,
      service: item.service,
      risk: item.risk,
      state: await probeHttpPort(gatewayIp, item.port)
    }))
  );

  const nativeOnlyPorts = HIGH_RISK_PORTS.map((item) => ({
    port: item.port,
    service: item.service,
    risk: item.risk,
    state: "unknown" as const
  }));

  return [...httpPorts, ...nativeOnlyPorts];
}

async function probeHttpPort(ipAddress: string, port: number): Promise<PortProbe["state"]> {
  const protocol = port === 443 ? "https" : "http";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1600);

  try {
    await fetch(`${protocol}://${ipAddress}:${port}`, {
      method: "GET",
      signal: controller.signal
    });
    return "open";
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") return "filtered";
    return "closed";
  } finally {
    clearTimeout(timeout);
  }
}

function assessPorts(ports: PortProbe[]): Vulnerability[] {
  const vulnerabilities: Vulnerability[] = [];
  if (ports.some((port) => port.port === 23 && port.state === "open")) vulnerabilities.push(makeVulnerability("OPEN_TELNET"));
  if (ports.some((port) => port.port === 445 && port.state === "open")) vulnerabilities.push(makeVulnerability("OPEN_SMB"));
  if (ports.some((port) => port.port === 1900 && port.state === "open")) vulnerabilities.push(makeVulnerability("UPNP_ENABLED"));
  if (ports.some((port) => port.port === 80 && port.state === "open")) {
    vulnerabilities.push(makeVulnerability("ROUTER_DEFAULT_PORT"));
    vulnerabilities.push(makeVulnerability("HTTP_SERVICES"));
  }

  return vulnerabilities;
}

async function discoverNetworkDevices(context: ScanContext): Promise<DeviceInfo[]> {
  const nativeDevices = await scanLocalDevices();
  const candidates = candidateIps(context.ipAddress, context.gatewayIp);
  const probes = await Promise.all(
    candidates.map(async (ipAddress) => ({
      ipAddress,
      httpState: await probeHttpPort(ipAddress, 80)
    }))
  );

  const responsiveDevices: DeviceInfo[] = probes
    .filter((probe) => probe.httpState === "open")
    .map((probe) => ({
      id: `device-${probe.ipAddress}`,
      ipAddress: probe.ipAddress,
      hostname: probe.ipAddress === context.gatewayIp ? "Gateway / Router" : `Netzwerkgerät ${probe.ipAddress}`,
      deviceType: probe.ipAddress === context.gatewayIp ? "gateway" : inferDeviceTypeFromIp(probe.ipAddress),
      isKnown: probe.ipAddress === context.gatewayIp,
      isGateway: probe.ipAddress === context.gatewayIp,
      openPorts: [
        {
          port: 80,
          service: "HTTP",
          state: "open",
          risk: "medium"
        }
      ],
      riskTags: probe.ipAddress === context.gatewayIp ? ["Router"] : ["HTTP-Dienst sichtbar"],
      lastSeen: new Date()
    }));

  const nativeDeviceInfos: DeviceInfo[] = nativeDevices.map((device) => ({
    id: `native-${device.ip}`,
    ipAddress: device.ip,
    hostname: device.hostname ?? `Netzwerkgerät ${device.ip}`,
    macAddress: device.mac,
    deviceType: device.ip === context.gatewayIp ? ("gateway" as const) : inferDeviceTypeFromHostname(device.hostname),
    isKnown: device.ip === context.gatewayIp,
    isGateway: device.ip === context.gatewayIp,
    openPorts: [],
    riskTags: device.hostname ? ["Native Geräteerkennung"] : ["Unbekanntes Gerät"],
    lastSeen: new Date()
  }));

  return [...nativeDeviceInfos, ...responsiveDevices];
}

function assessDevices(devices: DeviceInfo[]): Vulnerability[] {
  const unknownDevices = devices.filter((device) => !device.isKnown && device.deviceType === "unknown");
  if (unknownDevices.length === 0) return [];
  return [makeVulnerability("UNKNOWN_DEVICES", { count: String(unknownDevices.length) })];
}

function assessDns(dnsServers: string[]): Vulnerability[] {
  const suspiciousServers = dnsServers.filter((server) => server && !isPrivateIp(server) && !isTrustedPublicDns(server));
  if (suspiciousServers.length > 0) {
    return [
      makeVulnerability("DNS_UNENCRYPTED", {
        title: "Unbekannte DNS-Server konfiguriert",
        description: `DNS-Server ${suspiciousServers.join(", ")} sollten durch den IT-Dienstleister geprüft werden.`
      })
    ];
  }

  return [];
}

function assessTraffic(devices: DeviceInfo[]): Vulnerability[] {
  const httpDevices = devices.filter((device) =>
    device.openPorts.some((port) => port.port === 80 && port.state === "open")
  );

  if (httpDevices.length === 0) return [];
  return [makeVulnerability("HTTP_SERVICES")];
}

function buildBaseDevices(ipAddress: string, gatewayIp: string): DeviceInfo[] {
  const now = new Date();
  const devices: DeviceInfo[] = [];

  if (isPrivateIp(gatewayIp)) {
    devices.push({
      id: `gateway-${gatewayIp}`,
      ipAddress: gatewayIp,
      hostname: "Gateway / Router",
      deviceType: "gateway",
      isKnown: true,
      isGateway: true,
      openPorts: [],
      riskTags: ["Netzübergang"],
      lastSeen: now
    });
  }

  if (isPrivateIp(ipAddress)) {
    devices.push({
      id: `phone-${ipAddress}`,
      ipAddress,
      hostname: Device.deviceName ?? "Dieses Smartphone",
      vendor: Device.manufacturer ?? undefined,
      deviceType: "phone",
      isKnown: true,
      openPorts: [],
      riskTags: ["Scan-Gerät"],
      lastSeen: now
    });
  }

  return devices;
}

function upsertGatewayPorts(devices: DeviceInfo[], gatewayIp: string, ports: PortProbe[]) {
  return devices.map((device) =>
    device.ipAddress === gatewayIp
      ? {
          ...device,
          openPorts: ports,
          riskTags: [...device.riskTags, ...ports.filter((port) => port.state === "open").map((port) => port.service)]
        }
      : device
  );
}

function mergeDevices(baseDevices: DeviceInfo[], discoveredDevices: DeviceInfo[]) {
  const byIp = new Map<string, DeviceInfo>();
  [...baseDevices, ...discoveredDevices].forEach((device) => {
    const current = byIp.get(device.ipAddress);
    byIp.set(device.ipAddress, {
      ...current,
      ...device,
      openPorts: dedupePorts([...(current?.openPorts ?? []), ...device.openPorts]),
      riskTags: Array.from(new Set([...(current?.riskTags ?? []), ...device.riskTags]))
    });
  });

  return Array.from(byIp.values());
}

function dedupePorts(ports: PortProbe[]) {
  return Array.from(new Map(ports.map((port) => [port.port, port])).values());
}

function dedupeVulnerabilities(vulnerabilities: Vulnerability[]) {
  return Array.from(new Map(vulnerabilities.map((vulnerability) => [vulnerability.id, vulnerability])).values());
}

function makeVulnerability(
  key: keyof typeof WLAN_VULNERABILITIES,
  replacements: Partial<Pick<Vulnerability, "title" | "description">> & Record<string, string> = {}
): Vulnerability {
  const definition = WLAN_VULNERABILITIES[key];
  return {
    id: key,
    ...definition,
    title: replacements.title ?? definition.title,
    description: (replacements.description ?? definition.description).replace(/\{(\w+)\}/g, (_, token: string) => {
      return replacements[token] ?? `{${token}}`;
    })
  };
}

function candidateIps(ipAddress: string, gatewayIp: string) {
  const prefix = ipAddress.split(".").slice(0, 3).join(".");
  if (!prefix || prefix === "0.0.0") return [];

  return Array.from(
    new Set([
      gatewayIp,
      `${prefix}.1`,
      `${prefix}.2`,
      `${prefix}.10`,
      `${prefix}.20`,
      `${prefix}.50`,
      `${prefix}.100`,
      `${prefix}.101`,
      `${prefix}.150`,
      `${prefix}.200`,
      `${prefix}.254`
    ])
  ).filter((candidate) => candidate !== ipAddress && isPrivateIp(candidate));
}

function inferGatewayIp(ipAddress: string) {
  if (!isPrivateIp(ipAddress)) return "";
  const parts = ipAddress.split(".");
  if (parts.length !== 4) return "";
  return `${parts[0]}.${parts[1]}.${parts[2]}.1`;
}

function inferSubnetMask(ipAddress: string) {
  if (ipAddress.startsWith("10.")) return "255.0.0.0";
  if (ipAddress.startsWith("172.")) return "255.240.0.0";
  if (ipAddress.startsWith("192.168.")) return "255.255.255.0";
  return "unbekannt";
}

function inferDeviceTypeFromIp(ipAddress: string): DeviceInfo["deviceType"] {
  const parts = ipAddress.split(".");
  const host = Number(parts[parts.length - 1]);
  if (!Number.isFinite(host)) return "unknown";
  if (host >= 100 && host <= 199) return "workstation";
  if (host >= 200) return "printer";
  return "unknown";
}

function inferDeviceTypeFromHostname(hostname?: string): DeviceInfo["deviceType"] {
  const normalized = hostname?.toLowerCase() ?? "";
  if (normalized.includes("print") || normalized.includes("druck")) return "printer";
  if (normalized.includes("iphone") || normalized.includes("android") || normalized.includes("phone")) return "phone";
  if (normalized.includes("server") || normalized.includes("nas")) return "server";
  if (normalized.includes("pc") || normalized.includes("win") || normalized.includes("macbook")) return "workstation";
  if (normalized.includes("camera") || normalized.includes("iot")) return "iot";
  return "unknown";
}

function getStringProperty(source: Record<string, unknown>, key: string) {
  const value = source[key];
  return typeof value === "string" && value.length > 0 ? value : "";
}

function getStringArrayProperty(source: Record<string, unknown>, key: string) {
  const value = source[key];
  if (!Array.isArray(value)) return null;
  const strings = value.filter((item): item is string => typeof item === "string");
  return strings.length > 0 ? strings : null;
}

function stripWifiQuotes(value: string) {
  return value.replace(/^"|"$/g, "");
}

function isPrivateIp(ipAddress: string) {
  const parts = ipAddress.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return false;
  const [first, second] = parts;
  return first === 10 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168);
}

function isTrustedPublicDns(ipAddress: string) {
  return ["1.1.1.1", "1.0.0.1", "8.8.8.8", "8.8.4.4", "9.9.9.9", "149.112.112.112"].includes(ipAddress);
}

function riskLevelFromScore(score: number) {
  if (score >= 80) return "low";
  if (score >= 55) return "medium";
  return "high";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type StoredWlanScanResult = Omit<WlanScanResult, "timestamp" | "connectedDevices"> & {
  timestamp: string;
  connectedDevices: Array<Omit<DeviceInfo, "lastSeen"> & { lastSeen: string }>;
};

function reviveScanResult(result: StoredWlanScanResult): WlanScanResult {
  return {
    ...result,
    timestamp: new Date(result.timestamp),
    connectedDevices: result.connectedDevices.map((device) => ({
      ...device,
      lastSeen: new Date(device.lastSeen)
    }))
  };
}
