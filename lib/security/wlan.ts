import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";
import * as Device from "expo-device";
import * as Network from "expo-network";
import { Platform } from "react-native";

import type { AccessPoint, KnownDevice } from "@/lib/inventory/types";
import {
  getCurrentWifiSsid,
  scanLocalDevices,
  scanVisibleWifiNetworks,
  type NativeWifiNetwork
} from "@/lib/security/nativeWifi";
import { assessFirewallBaseline, firewallBaselineFinding } from "@/lib/security/firewallBaseline";
import { assessGuestNetwork, guestNetworkFinding } from "@/lib/security/guestNetworkAssessment";
import { dhcpDocumentationFinding } from "@/lib/security/dhcpConsistency";
import { buildIpv4SubnetCandidates, MAX_AUDIT_SUBNET_HOSTS, usableSubnetHostCount } from "@/lib/security/ipv4Subnet";
import { ipv6ReachabilityFinding } from "@/lib/security/ipv6Assessment";
import { assessDnsOperation } from "@/lib/security/dnsAssessment";
import { classifyDevice } from "@/lib/security/deviceClassification";
import { assessGatewaySecurity, assessDeviceSecurity, assessWifiSecurity, calculateSecurityFindingScore } from "@/lib/security/networkSecurityAssessment";
import { getNativeWifiSecurityDetails, probeDeviceServices, probeGatewaySecurity, probeIpv6TcpPorts, probeTcpPorts } from "@/lib/security/networkProbes";
import { assessRogueAccessPoints, rogueApFinding } from "@/lib/security/rogueApAssessment";
import { assessRogueDevices, rogueDeviceFinding } from "@/lib/security/rogueDeviceAssessment";
import { assessRouterCredentialRisk, defaultPasswordRiskFinding } from "@/lib/security/routerCredentialRisk";
import { fingerprintRouter, routerFirmwareFinding } from "@/lib/security/routerFingerprint";
import {
  assessNetworkSegmentation,
  buildNetworkSegmentObservation,
  buildSegmentReachabilityTargets,
  segmentationFinding,
  type NetworkSegmentObservation
} from "@/lib/security/segmentationAssessment";
import type {
  DeviceClassification,
  GatewaySecurityProbeResult,
  HttpAdminProbeResult,
  Ipv6ReachabilityProbeResult,
  NetworkSegmentId,
  NetworkSecurityFinding,
  SegmentReachabilityTestResult,
  TcpProbeResult,
  WifiSecurityDetails,
  WifiSecurityProtocol
} from "@/lib/security/networkProbeTypes";
import { serviceForPort } from "@/lib/security/servicePortCatalog";
import { resolveWifiSecurityDetails } from "@/lib/security/wifiCapabilities";
import { supabase } from "@/lib/api/supabase";
import { createStringStorage } from "@/lib/store/storage";

export type { NetworkSecurityFinding, WifiSecurityDetails } from "@/lib/security/networkProbeTypes";
export type { NetworkSegmentId } from "@/lib/security/networkProbeTypes";
export type SecurityProtocol = WifiSecurityProtocol;
export type DataSource = "measured" | "inferred" | "unavailable" | "simulated" | "questionnaire";
export type FindingConfidence = "high" | "medium" | "low";

export interface WlanFinding<TValue> {
  id: string;
  value: TValue;
  source: DataSource;
  source_detail?: string;
  confidence: FindingConfidence;
  measured_at: Date;
}

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
  | "device_inventory"
  | "ipv6"
  | "dhcp";

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
  source?: DataSource;
}

export interface DeviceInfo {
  id: string;
  ipAddress: string;
  hostname: string;
  macAddress?: string;
  vendor?: string;
  deviceType: "gateway" | "phone" | "workstation" | "printer" | "server" | "nas" | "iot" | "medical" | "database" | "unknown";
  isKnown: boolean;
  isGateway?: boolean;
  openPorts: PortProbe[];
  riskTags: string[];
  classification?: DeviceClassification;
  lastSeen: Date;
}

export interface WlanScanResult {
  networkName: string;
  securityProtocol: SecurityProtocol;
  wifiSecurity: WifiSecurityDetails;
  ipAddress: string;
  subnetMask: string;
  gatewayIp: string;
  dnsServers: string[];
  connectedDevices: DeviceInfo[];
  vulnerabilities: Vulnerability[];
  securityFindings: NetworkSecurityFinding[];
  riskScore: number;
  scanMode: WlanScanMode;
  scanSegment: NetworkSegmentId;
  subnetScan: SubnetScanSummary;
  timestamp: Date;
  findings: {
    networkName: WlanFinding<string>;
    securityProtocol: WlanFinding<SecurityProtocol>;
    ipAddress: WlanFinding<string>;
    subnetMask: WlanFinding<string>;
    gatewayIp: WlanFinding<string>;
    dnsServers: WlanFinding<string[]>;
    connectedDevices: WlanFinding<DeviceInfo[]>;
    openPorts: WlanFinding<PortProbe[]>;
    upnpStatus: WlanFinding<boolean | null>;
    deviceClassifications: WlanFinding<DeviceClassification[]>;
    ipv6Status: WlanFinding<GatewaySecurityProbeResult["ipv6"] | null>;
    dnsResolverAssessments: WlanFinding<GatewaySecurityProbeResult["dnsResolvers"]>;
    dhcpConsistency: WlanFinding<GatewaySecurityProbeResult["dhcpConsistency"] | null>;
    securityChecks: WlanFinding<NetworkSecurityFinding[]>;
  };
  methodology: string[];
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

export type WlanScanMode = "standard" | "audit";

export type SubnetScanSummary = {
  mode: WlanScanMode;
  candidateHosts: number;
  scannedHosts: number;
  scannedEntireRecognizedSubnet: boolean;
  limitation?: string;
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
      "WLAN-Sicherheitsprotokoll erkennen (WEP/WPA/WPA2/WPA3)",
      "Rogue-Access-Point-Hinweise aus WLAN-Metadaten ableiten"
    ]
  },
  {
    id: "encryption_check",
    label: "Verschlüsselung wird geprüft",
    icon: "lock",
    checks: [
      "WLAN-Protokoll auf Schwachstellen prüfen",
      "WPS-Status als nicht geprüft kennzeichnen",
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
      "Datenbankports prüfen (MySQL 3306, PostgreSQL 5432)",
      "SMB/NFS/AFP-Dateidienste prüfen"
    ]
  },
  {
    id: "device_discovery",
    label: "Geräte im Netzwerk werden erkannt",
    icon: "devices",
    checks: [
      "Schonende Geräteerkennung über bekannte Kandidaten",
      "Drucker, NAS, Kamera/IoT und medizinische Geräte vorsichtig klassifizieren",
      "Unbekannte/verdächtige Geräte markieren",
      "HTTP-, IPP-, JetDirect- und Webinterfaces prüfen",
      "Rogue-Device-Hinweise mit früheren Scans vergleichen"
    ]
  },
  {
    id: "dns_check",
    label: "DNS-Sicherheit wird analysiert",
    icon: "globe",
    checks: [
      "DNS-Resolver klassifizieren",
      "DNS-Filter-/Schutzfunktion ableiten",
      "DHCP-, Gateway- und DNS-Konsistenz prüfen"
    ]
  },
  {
    id: "traffic_analysis",
    label: "Datenverkehr wird bewertet",
    icon: "activity",
    checks: [
      "IPv6-Aktivität und globale IPv6-Adressen bewerten",
      "Unverschlüsselte lokale Adminoberflächen bewerten",
      "Gastnetz- und Segmentierungs-Score berechnen",
      "Router-Firmware-, Default-Passwort- und Firewall-Basisrisiko bewerten"
    ]
  }
] as const;

export const PLATFORM_LIMITATIONS = {
  ios: [
    "Geräte-Scan per ARP ist nicht verfügbar, weil iOS keinen Raw-Socket-Zugriff erlaubt.",
    "WPS-Status ist nicht direkt auslesbar.",
    "Gerätezahl wird aus sichtbaren HTTP-Antworten und Gateway-Informationen abgeleitet."
  ],
  android: [
    "Geräte-Scan hängt von Android-Version, WLAN-Berechtigungen und Hersteller-ROM ab.",
    "WPS-Status ist nur bei nativer Verfügbarkeit auslesbar.",
    "Nicht antwortende Geräte können im mobilen Best-Effort-Scan unsichtbar bleiben."
  ],
  web: [
    "Browser erlauben keinen lokalen WLAN- oder Portscan.",
    "Netzwerkdetails sind im Web nur eingeschränkt verfügbar."
  ],
  default: [
    "Mobile Betriebssysteme beschränken aktive Netzwerkscans.",
    "Der Scan ist eine technische Momentaufnahme und ersetzt keinen Penetrationstest."
  ]
} as const;

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

const wlanScanStorage = createStringStorage("praxisshield-wlan-scans", {
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
  wifiSecurity: WifiSecurityDetails;
  visibleNetworks: NativeWifiNetwork[];
  devices: DeviceInfo[];
  vulnerabilities: Vulnerability[];
  securityFindings: NetworkSecurityFinding[];
  gatewayProbe: GatewaySecurityProbeResult | null;
  ipv6Reachability: Ipv6ReachabilityProbeResult[];
  segmentReachabilityTests: SegmentReachabilityTestResult[];
  scanMode: WlanScanMode;
  scanSegment: NetworkSegmentId;
  subnetScan: SubnetScanSummary;
};

type WlanSecurityScanOptions = {
  onProgress?: (progress: WlanScanProgress) => void;
  phaseDelayMs?: number;
  knownDevices?: KnownDevice[];
  accessPoints?: AccessPoint[];
  scanSegment?: NetworkSegmentId;
  networkStructure?: {
    guestWifiExists?: boolean;
    guestWifiClientIsolation?: boolean;
    networkStructureDocumented?: boolean;
  };
  dnsOperation?: {
    resolverDocumented?: boolean;
    filterEnabled?: boolean;
    privacyReviewed?: boolean;
    providerDocumented?: boolean;
    configurationDocumented?: boolean;
  };
  dhcpDocumentation?: {
    authorizedServerDocumented?: boolean;
    routerIpDocumented?: boolean;
    dnsServersDocumented?: boolean;
    exceptionsDocumented?: boolean;
  };
  routerDocumentation?: {
    manufacturerDocumented?: boolean;
    modelDocumented?: boolean;
    firmwareVersionDocumented?: boolean;
    updateStatusDocumented?: boolean;
    firmwareCurrent?: boolean;
    itProviderDocumented?: boolean;
  };
  routerCredentials?: {
    adminPasswordChanged?: boolean;
    passwordManagerUsed?: boolean;
    routerMfaAvailable?: boolean;
    managedByItProvider?: boolean;
  };
  ipv6Security?: {
    usedIntentionally?: boolean;
    firewallRulesCovered?: boolean;
    dnsRulesCovered?: boolean;
    reachabilityConsentAccepted?: boolean;
  };
  auditMode?: {
    enabled: boolean;
    consentAccepted: boolean;
  };
};

export async function runWlanSecurityScan(options?: WlanSecurityScanOptions): Promise<WlanScanResult> {
  const delayMs = options?.phaseDelayMs ?? 420;
  let context: ScanContext | null = null;

  for (let phaseIndex = 0; phaseIndex < SCAN_PHASES.length; phaseIndex += 1) {
    const phase = SCAN_PHASES[phaseIndex];

    for (let checkIndex = 0; checkIndex < phase.checks.length; checkIndex += 1) {
      emitProgress(options?.onProgress, phaseIndex, checkIndex, context);
      await sleep(delayMs);
    }

    if (phase.id === "network_info") {
      context = await readNetworkContext(scanModeFromOptions(options), options?.scanSegment ?? "practice_wifi");
    }

    if (phase.id === "encryption_check" && context) {
      const encryptionFindings = assessWifiSecurity(context.wifiSecurity);
      context.securityFindings.push(...encryptionFindings);
      context.vulnerabilities.push(...securityFindingsToVulnerabilities(encryptionFindings));
    }

    if (phase.id === "port_scan" && context) {
      const gatewayProbe = await probeGatewaySecurity({
        host: context.gatewayIp,
        localIp: context.ipAddress,
        subnetMask: context.subnetMask,
        dnsServers: context.dnsServers
      });
      const gatewayClassification = classifyDevice({
        host: context.gatewayIp,
        hostname: "Gateway / Router",
        http: gatewayProbe.http,
        tcp: gatewayProbe.tcp,
        ssdp: gatewayProbe.ssdp,
        mdns: gatewayProbe.mdns,
        snmp: gatewayProbe.snmp
      });
      gatewayProbe.deviceClassifications = [gatewayClassification];
      context.gatewayProbe = gatewayProbe;
      const gatewayPorts = gatewayProbeToPortProbes(gatewayProbe);
      context.devices = upsertGatewayPorts(context.devices, context.gatewayIp, gatewayPorts, gatewayClassification);
      if (options?.ipv6Security?.reachabilityConsentAccepted) {
        context.ipv6Reachability = await runIpv6ReachabilityChecks(gatewayProbe.ipv6);
      }
      const gatewayFindings = [
        ...assessGatewaySecurity(gatewayProbe, { ipv6Answers: options?.ipv6Security }),
        ipv6ReachabilityFinding(context.ipv6Reachability)
      ];
      context.securityFindings.push(...gatewayFindings);
      context.vulnerabilities.push(...securityFindingsToVulnerabilities(gatewayFindings));
    }

    if (phase.id === "device_discovery" && context) {
      const discoveredDevices = await discoverNetworkDevices(context);
      context.devices = mergeDevices(context.devices, discoveredDevices);
      context.segmentReachabilityTests = await runSegmentReachabilityTests(context);
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
    context = await readNetworkContext(scanModeFromOptions(options), options?.scanSegment ?? "practice_wifi");
  }

  const previousResult = getLatestWlanScanResult();
  const advancedFindings = buildAdvancedNetworkFindings(context, previousResult?.connectedDevices ?? [], {
    accessPoints: options?.accessPoints ?? [],
    knownDevices: options?.knownDevices ?? [],
    networkStructure: options?.networkStructure ?? {},
    dnsOperation: options?.dnsOperation ?? {},
    dhcpDocumentation: options?.dhcpDocumentation ?? {},
    routerDocumentation: options?.routerDocumentation ?? {},
    routerCredentials: options?.routerCredentials ?? {}
  });
  context.securityFindings.push(...advancedFindings);
  context.vulnerabilities.push(...securityFindingsToVulnerabilities(advancedFindings));

  const result = {
    networkName: context.ssid,
    securityProtocol: context.securityProtocol,
    wifiSecurity: context.wifiSecurity,
    ipAddress: context.ipAddress,
    subnetMask: context.subnetMask,
    gatewayIp: context.gatewayIp,
    dnsServers: context.dnsServers,
    connectedDevices: context.devices,
    vulnerabilities: dedupeVulnerabilities(context.vulnerabilities),
    securityFindings: dedupeSecurityFindings(context.securityFindings),
    riskScore: calculateWlanRiskScore(context.vulnerabilities, context.securityFindings),
    scanMode: context.scanMode,
    scanSegment: context.scanSegment,
    subnetScan: context.subnetScan,
    timestamp: new Date(),
    findings: buildFindings(context),
    methodology: [...scanMethodology(context), ...getPlatformLimitations()]
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

function getSegmentObservations(): NetworkSegmentObservation[] {
  const payload = wlanScanStorage.getString("segment_observations");
  if (!payload) return [];

  try {
    const parsed = JSON.parse(payload);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isNetworkSegmentObservation);
  } catch {
    return [];
  }
}

function upsertSegmentObservation(observation: NetworkSegmentObservation) {
  const bySegment = new Map<NetworkSegmentId, NetworkSegmentObservation>();
  getSegmentObservations().forEach((item) => bySegment.set(item.segment, item));
  bySegment.set(observation.segment, observation);
  const observations = Array.from(bySegment.values());
  wlanScanStorage.set("segment_observations", JSON.stringify(observations));
  return observations;
}

function isNetworkSegmentObservation(value: unknown): value is NetworkSegmentObservation {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<NetworkSegmentObservation>;
  return isKnownNetworkSegment(candidate.segment) && typeof candidate.visibleDeviceCount === "number" && Array.isArray(candidate.deviceClasses) && Array.isArray(candidate.exposedServices) && typeof candidate.observedAt === "string";
}

function isKnownNetworkSegment(value: unknown): value is NetworkSegmentId {
  return value === "practice_wifi" || value === "guest_wifi" || value === "server_network" || value === "printer_network" || value === "medical_device_network";
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
      wifiSecurity: result.wifiSecurity,
      scanMode: result.scanMode,
      scanSegment: result.scanSegment,
      findings: serializeFindings(result.findings),
      securityFindings: result.securityFindings,
      methodology: result.methodology,
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

export function calculateWlanRiskScore(vulnerabilities: Vulnerability[], securityFindings: NetworkSecurityFinding[] = []) {
  const securityFindingScore = calculateSecurityFindingScore(securityFindings);
  if (securityFindingScore !== null) return securityFindingScore;

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

function gatewayProbeToPortProbes(probe: GatewaySecurityProbeResult): PortProbe[] {
  const httpPorts: PortProbe[] = probe.http.map((item) => ({
    port: item.port,
    service: item.port === 443 || item.port === 8443 ? "HTTPS / Webinterface" : item.port === 631 ? "IPP / Druck-Webinterface" : item.port === 8080 ? "HTTP-Admininterface" : "HTTP / Webinterface",
    state: item.state,
    risk: item.port === 443 ? "info" : item.redirectsToHttps ? "low" : "medium",
    source: item.source
  }));

  const tcpPorts: PortProbe[] = probe.tcp.map((item) => ({
    port: item.port,
    service: serviceNameForPort(item.port),
    state: item.state,
    risk: riskForPort(item.port),
    source: item.source
  }));

  const ssdpPort: PortProbe = {
    port: 1900,
    service: "UPnP / SSDP",
    state: probe.ssdp.active === true ? "open" : probe.ssdp.active === false ? "closed" : "unknown",
    risk: "medium",
    source: probe.ssdp.source
  };

  return dedupePorts([...httpPorts, ...tcpPorts, ssdpPort]);
}

function securityFindingsToVulnerabilities(findings: NetworkSecurityFinding[]): Vulnerability[] {
  return findings
    .filter((finding) => finding.detected && finding.status !== "secure" && finding.status !== "unknown")
    .map((finding) => ({
      id: finding.id,
      title: finding.title,
      description: finding.details,
      severity: finding.severity,
      remediation: finding.recommendation,
      category: categoryForSecurityFinding(finding)
    }));
}

function serviceNameForPort(port: number) {
  const service = serviceForPort(port);
  if (service) return service.service;
  if (port === 23) return "Telnet";
  if (port === 139) return "NetBIOS / SMB";
  if (port === 445) return "SMB / Windows-Dateifreigabe";
  if (port === 3389) return "RDP / Remote Desktop";
  return `TCP ${port}`;
}

function riskForPort(port: number): PortProbe["risk"] {
  const service = serviceForPort(port);
  if (service) return service.risk;
  if (port === 23 || port === 3389) return "critical";
  if (port === 445 || port === 139) return "high";
  return "info";
}

function categoryForSecurityFinding(finding: NetworkSecurityFinding): WlanVulnCategory {
  if (finding.checkId === "wifi_encryption" || finding.checkId === "wpa3_upgrade") return "encryption";
  if (finding.checkId === "upnp_ssdp") return "upnp_enabled";
  if (finding.checkId === "router_http") return "unencrypted_traffic";
  if (finding.checkId === "guest_network" || finding.checkId === "network_segmentation") return "guest_network";
  if (finding.checkId === "rogue_device" || finding.checkId === "rogue_access_point") return "rogue_devices";
  if (finding.checkId === "router_firmware") return "firmware_outdated";
  if (finding.checkId === "default_password_risk") return "default_credentials";
  if (finding.checkId === "firewall_baseline") return "open_ports";
  if (finding.checkId === "smb_security" || finding.checkId === "printer_services" || finding.checkId === "nas_services" || finding.checkId === "camera_iot" || finding.checkId === "medical_device_metadata") return "device_inventory";
  if (finding.checkId === "ipv6_exposure" || finding.checkId === "ipv6_reachability") return "ipv6";
  if (finding.checkId === "dhcp_consistency") return "dhcp";
  if (finding.checkId === "dns_resolver" || finding.checkId === "dns_security" || finding.checkId === "dns_filter_test") return "dns_hijacking";
  return "open_ports";
}

function deviceServicePorts(http: HttpAdminProbeResult[], tcp: TcpProbeResult[]): PortProbe[] {
  const httpPorts = http.map((probe) => ({
    port: probe.port,
    service: probe.port === 443 || probe.port === 8443 ? "HTTPS-Webinterface" : probe.port === 631 ? "IPP / Druck-Webinterface" : "HTTP-Webinterface",
    state: probe.state,
    risk: probe.state === "open" && probe.port !== 443 && probe.port !== 8443 ? ("medium" as const) : ("info" as const),
    source: probe.source
  }));
  const tcpPorts = tcp.map((probe) => ({
    port: probe.port,
    service: serviceNameForPort(probe.port),
    state: probe.state,
    risk: riskForPort(probe.port),
    source: probe.source
  }));
  return dedupePorts([...httpPorts, ...tcpPorts]);
}

function deviceTypeFromClassification(classification: DeviceClassification): DeviceInfo["deviceType"] | null {
  if (classification.deviceClass === "printer") return "printer";
  if (classification.deviceClass === "nas") return "nas";
  if (classification.deviceClass === "camera_iot") return "iot";
  if (classification.deviceClass === "medical_device") return "medical";
  if (classification.deviceClass === "database_server") return "database";
  if (classification.deviceClass === "server") return "server";
  if (classification.deviceClass === "workstation") return "workstation";
  if (classification.deviceClass === "phone") return "phone";
  return null;
}

function buildAdvancedNetworkFindings(
  context: ScanContext,
  previousDevices: DeviceInfo[],
  inventory: {
    accessPoints: AccessPoint[];
    knownDevices: KnownDevice[];
    networkStructure: NonNullable<WlanSecurityScanOptions["networkStructure"]>;
    dnsOperation: NonNullable<WlanSecurityScanOptions["dnsOperation"]>;
    dhcpDocumentation: NonNullable<WlanSecurityScanOptions["dhcpDocumentation"]>;
    routerDocumentation: NonNullable<WlanSecurityScanOptions["routerDocumentation"]>;
    routerCredentials: NonNullable<WlanSecurityScanOptions["routerCredentials"]>;
  }
) {
  const classifications = context.devices.flatMap((device) => (device.classification ? [device.classification] : []));
  const gatewayDevice = context.devices.find((device) => device.ipAddress === context.gatewayIp);
  const gatewayPorts = gatewayDevice?.openPorts ?? [];
  const gatewayReachable = gatewayPorts.some((port) => port.state === "open") || Boolean(context.gatewayIp);

  const guestAssessment = assessGuestNetwork({
    ssid: context.ssid,
    gatewayReachable,
    visibleDeviceCount: context.devices.length,
    classifications,
    captivePortalLikely: context.ssid.toLowerCase().includes("guest") || context.ssid.toLowerCase().includes("gast") ? null : false,
    declaredGuestNetwork: inventory.networkStructure.guestWifiExists,
    declaredClientIsolation: inventory.networkStructure.guestWifiClientIsolation,
    segmentReachabilityTests: context.segmentReachabilityTests
  });

  const currentSegmentObservation = buildNetworkSegmentObservation({
    segment: context.scanSegment,
    ssid: context.ssid,
    gatewayIp: context.gatewayIp,
    visibleDeviceCount: context.devices.length,
    classifications,
    exposedServices: context.devices.flatMap((device) =>
      device.openPorts.filter((port) => port.state === "open").map((port) => `${device.ipAddress}:${port.port}`)
    )
  });
  const segmentObservations = upsertSegmentObservation(currentSegmentObservation);
  const segmentationAssessment = assessNetworkSegmentation({
    guestNetworkStatus: guestAssessment.status,
    classifications,
    visibleDeviceCount: context.devices.length,
    observations: segmentObservations,
    reachabilityTests: context.segmentReachabilityTests
  });

  const rogueApAssessment = assessRogueAccessPoints({
    currentSsid: context.ssid,
    visibleNetworks: context.visibleNetworks,
    accessPoints: inventory.accessPoints
  });

  const rogueDeviceAssessment = assessRogueDevices(context.devices, previousDevices, inventory.knownDevices);
  const findings = [
    guestNetworkFinding(guestAssessment),
    segmentationFinding(segmentationAssessment),
    assessDnsOperation(inventory.dnsOperation),
    dhcpDocumentationFinding(inventory.dhcpDocumentation),
    rogueApFinding(rogueApAssessment),
    rogueDeviceFinding(rogueDeviceAssessment)
  ];

  if (context.gatewayProbe) {
    const routerFingerprint = fingerprintRouter({
      http: context.gatewayProbe.http,
      classification: gatewayDevice?.classification,
      structured: inventory.routerDocumentation
    });
    const credentialRisk = assessRouterCredentialRisk({
      fingerprint: routerFingerprint,
      answers: inventory.routerCredentials
    });
    const firewallBaseline = assessFirewallBaseline(context.gatewayProbe);
    findings.push(routerFirmwareFinding(routerFingerprint));
    findings.push(defaultPasswordRiskFinding(credentialRisk));
    findings.push(firewallBaselineFinding(firewallBaseline));
  }

  return findings;
}

async function runSegmentReachabilityTests(context: ScanContext): Promise<SegmentReachabilityTestResult[]> {
  const targets = buildSegmentReachabilityTargets(context.scanSegment, getSegmentObservations()).slice(0, 24);
  if (targets.length === 0) return [];

  return mapWithConcurrency(targets, 3, async (target) => {
    const [probe] = await probeTcpPorts(target.host, [target.port], 900);
    return {
      fromSegment: target.fromSegment,
      toSegment: target.toSegment,
      host: target.host,
      port: target.port,
      service: target.service,
      reachable: probe.source === "measured" ? probe.state === "open" : null,
      source: probe.source,
      confidence: probe.source === "measured" ? ("high" as const) : ("low" as const),
      errorCode: probe.errorCode
    };
  });
}

async function runIpv6ReachabilityChecks(info: GatewaySecurityProbeResult["ipv6"]): Promise<Ipv6ReachabilityProbeResult[]> {
  const localTargets = [...info.uniqueLocalAddresses, ...info.linkLocalAddresses].slice(0, 6);
  if (localTargets.length === 0) return [];

  const ports = [80, 443, 445, 3389];
  const targetRequests = localTargets.flatMap((host) => ports.map((port) => ({ host, port })));
  const results = await mapWithConcurrency(targetRequests, 3, async (target) => {
    const [probe] = await probeIpv6TcpPorts(target.host, [target.port], 900);
    return probe;
  });
  return results;
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

async function readNetworkContext(scanMode: WlanScanMode, scanSegment: NetworkSegmentId): Promise<ScanContext> {
  const state = await NetInfo.fetch();
  const details = (state.details && typeof state.details === "object" ? state.details : {}) as Record<string, unknown>;
  const detailIp = getStringProperty(details, "ipAddress");
  const fallbackIp = await Network.getIpAddressAsync().catch(() => "");
  const ipAddress = detailIp || fallbackIp || "0.0.0.0";
  const subnetMask = getStringProperty(details, "subnet") || inferSubnetMask(ipAddress);
  const gatewayIp = getStringProperty(details, "gateway") || inferGatewayIp(ipAddress);
  const ssid = await getCurrentSsid(state);
  const visibleNetworks = await scanVisibleWifiNetworks();
  const nativeWifiSecurity = await getNativeWifiSecurityDetails();
  const wifiSecurity = resolveWifiSecurityDetails(ssid, visibleNetworks, nativeWifiSecurity, Platform.OS);
  const securityProtocol = state.type === "wifi" ? wifiSecurity.protocol : "UNKNOWN";
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
    wifiSecurity,
    visibleNetworks,
    devices,
    vulnerabilities: [],
    securityFindings: [],
    gatewayProbe: null,
    ipv6Reachability: [],
    segmentReachabilityTests: [],
    scanMode,
    scanSegment,
    subnetScan: {
      mode: scanMode,
      candidateHosts: 0,
      scannedHosts: 0,
      scannedEntireRecognizedSubnet: false
    }
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

async function discoverNetworkDevices(context: ScanContext): Promise<DeviceInfo[]> {
  const nativeDevices = await scanLocalDevices();
  const candidates = candidateIps(context.ipAddress, context.gatewayIp, context.subnetMask, context.scanMode);
  context.subnetScan = summarizeSubnetScan(context, candidates.length);
  const probes = await mapWithConcurrency(
    candidates,
    context.scanMode === "audit" ? 4 : candidates.length || 1,
    async (ipAddress) => {
      const services = await probeDeviceServices(ipAddress, 1200);
      const nativeDevice = nativeDevices.find((device) => device.ip === ipAddress);
      const classification = classifyDevice({
        host: ipAddress,
        hostname: nativeDevice?.hostname,
        macAddress: nativeDevice?.mac,
        http: services.http,
        tcp: services.tcp,
        ssdp: context.gatewayProbe?.ssdp,
        mdns: context.gatewayProbe?.mdns,
        snmp: context.gatewayProbe?.snmp.filter((probe) => probe.host === ipAddress)
      });
      const openPorts = deviceServicePorts(services.http, services.tcp);
      const isVisible = openPorts.some((port) => port.state === "open") || nativeDevice || classification.deviceClass !== "unknown";
      return {
        ipAddress,
        services,
        nativeDevice,
        classification,
        openPorts,
        isVisible
      };
    }
  );

  const responsiveDevices: DeviceInfo[] = probes
    .filter((probe) => probe.isVisible)
    .map((probe) => ({
      id: `device-${probe.ipAddress}`,
      ipAddress: probe.ipAddress,
      hostname: probe.nativeDevice?.hostname ?? (probe.ipAddress === context.gatewayIp ? "Gateway / Router" : `Netzwerkgerät ${probe.ipAddress}`),
      macAddress: probe.nativeDevice?.mac,
      vendor: probe.classification.vendor,
      deviceType: probe.ipAddress === context.gatewayIp ? "gateway" : deviceTypeFromClassification(probe.classification) ?? inferDeviceTypeFromIp(probe.ipAddress),
      isKnown: probe.ipAddress === context.gatewayIp,
      isGateway: probe.ipAddress === context.gatewayIp,
      openPorts: probe.openPorts,
      riskTags: Array.from(new Set([
        ...(probe.ipAddress === context.gatewayIp ? ["Router"] : []),
        ...probe.classification.signals.slice(0, 4),
        ...probe.openPorts.filter((port) => port.state === "open").map((port) => port.service)
      ])),
      classification: probe.classification,
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

  const deviceFindings = probes.flatMap((probe) => {
    return assessDeviceSecurity({
      host: probe.ipAddress,
      tcp: probe.services.tcp,
      http: probe.services.http,
      smb: probe.services.smb,
      classifications: [probe.classification]
    });
  });
  context.securityFindings.push(...deviceFindings);
  context.vulnerabilities.push(...securityFindingsToVulnerabilities(deviceFindings));

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
    device.openPorts.some((port) => [80, 8080, 5000, 5001, 631].includes(port.port) && port.state === "open")
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

function upsertGatewayPorts(devices: DeviceInfo[], gatewayIp: string, ports: PortProbe[], classification?: DeviceClassification) {
  return devices.map((device) =>
    device.ipAddress === gatewayIp
      ? {
          ...device,
          classification,
          openPorts: ports,
          riskTags: [
            ...device.riskTags,
            ...(classification?.signals.slice(0, 4) ?? []),
            ...ports.filter((port) => port.state === "open").map((port) => port.service)
          ]
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

function dedupeSecurityFindings(findings: NetworkSecurityFinding[]) {
  return Array.from(new Map(findings.map((finding) => [finding.id, finding])).values());
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

function candidateIps(ipAddress: string, gatewayIp: string, subnetMask: string, scanMode: WlanScanMode): string[] {
  if (scanMode === "audit") {
    return buildIpv4SubnetCandidates(ipAddress, subnetMask, gatewayIp) ?? candidateIps(ipAddress, gatewayIp, subnetMask, "standard");
  }

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
  if (normalized.includes("nas") || normalized.includes("synology") || normalized.includes("qnap")) return "nas";
  if (normalized.includes("server")) return "server";
  if (normalized.includes("dicom") || normalized.includes("med")) return "medical";
  if (normalized.includes("db") || normalized.includes("mysql") || normalized.includes("postgres")) return "database";
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

function summarizeSubnetScan(context: ScanContext, scannedHosts: number): SubnetScanSummary {
  const totalHosts = usableSubnetHostCount(context.ipAddress, context.subnetMask);
  const auditLimited = context.scanMode === "audit" && totalHosts !== null && totalHosts > MAX_AUDIT_SUBNET_HOSTS;

  return {
    mode: context.scanMode,
    candidateHosts: totalHosts ?? scannedHosts,
    scannedHosts,
    scannedEntireRecognizedSubnet: context.scanMode === "audit" && totalHosts !== null && !auditLimited,
    limitation: auditLimited
      ? `Subnetz umfasst ${totalHosts} Hosts; aus Sicherheitsgründen wurden ${MAX_AUDIT_SUBNET_HOSTS} Hosts geprüft.`
      : context.scanMode === "standard"
        ? "Standardmodus prüft nur Gateway und bekannte Kandidaten-IP-Adressen."
        : undefined
  };
}

function scanModeFromOptions(options?: WlanSecurityScanOptions): WlanScanMode {
  return options?.auditMode?.enabled && options.auditMode.consentAccepted ? "audit" : "standard";
}

async function mapWithConcurrency<TInput, TResult>(
  items: TInput[],
  concurrency: number,
  mapper: (item: TInput) => Promise<TResult>
) {
  const results: TResult[] = [];
  let index = 0;
  const workerCount = Math.max(1, Math.min(concurrency, items.length || 1));

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (index < items.length) {
        const currentIndex = index;
        index += 1;
        results[currentIndex] = await mapper(items[currentIndex]);
      }
    })
  );

  return results;
}

function buildFindings(context: ScanContext): WlanScanResult["findings"] {
  const measuredAt = new Date();
  const gatewayPorts = context.devices.find((device) => device.ipAddress === context.gatewayIp)?.openPorts ?? [];
  const securitySource: DataSource = context.wifiSecurity.source;
  const deviceSource: DataSource = Platform.OS === "web" ? "unavailable" : "measured";
  const securityChecks = dedupeSecurityFindings(context.securityFindings);
  const classifications = context.devices.flatMap((device) => (device.classification ? [device.classification] : []));

  return {
    networkName: makeFinding("network_name", context.ssid, context.ssid ? "measured" : "unavailable", "NetInfo / native WiFi", context.ssid ? "high" : "low", measuredAt),
    securityProtocol: makeFinding(
      "security_protocol",
      context.securityProtocol,
      securitySource,
      context.visibleNetworks.length > 0 ? "Native WiFi capabilities" : "SSID and platform inference",
      context.visibleNetworks.length > 0 ? "high" : "low",
      measuredAt
    ),
    ipAddress: makeFinding("ip_address", context.ipAddress, context.ipAddress !== "0.0.0.0" ? "measured" : "unavailable", "NetInfo / Expo Network", "high", measuredAt),
    subnetMask: makeFinding("subnet_mask", context.subnetMask, context.subnetMask === "unbekannt" ? "unavailable" : "inferred", "NetInfo or RFC1918 inference", "medium", measuredAt),
    gatewayIp: makeFinding("gateway_ip", context.gatewayIp, context.gatewayIp ? "inferred" : "unavailable", "NetInfo gateway or subnet inference", context.gatewayIp ? "medium" : "low", measuredAt),
    dnsServers: makeFinding("dns_servers", context.dnsServers, context.dnsServers.length > 0 ? "measured" : "unavailable", "NetInfo DNS details", context.dnsServers.length > 0 ? "high" : "low", measuredAt),
    connectedDevices: makeFinding("connected_devices", context.devices, deviceSource, "Native discovery and HTTP probes", Platform.OS === "ios" ? "low" : "medium", measuredAt),
    openPorts: makeFinding(
      "open_ports",
      gatewayPorts,
      context.gatewayIp ? "measured" : "unavailable",
      context.scanMode === "audit"
        ? "Audit mode TCP connect probes across the recognized IPv4 subnet"
        : "HTTP probes against gateway and selected subnet hosts",
      "medium",
      measuredAt
    ),
    upnpStatus: makeFinding(
      "upnp_status",
      context.gatewayProbe?.ssdp.active ?? null,
      context.gatewayProbe?.ssdp.source ?? "unavailable",
      "SSDP M-SEARCH via native UDP module when available",
      context.gatewayProbe?.ssdp.confidence ?? "low",
      measuredAt
    ),
    deviceClassifications: makeFinding(
      "device_classifications",
      classifications,
      classifications.length > 0 ? "inferred" : "unavailable",
      "Port, HTTP, mDNS, SSDP and limited SNMP metadata; no logins or content reads",
      classifications.some((item) => item.confidence === "high") ? "high" : classifications.length > 0 ? "medium" : "low",
      measuredAt
    ),
    ipv6Status: makeFinding(
      "ipv6_status",
      context.gatewayProbe?.ipv6 ?? null,
      context.gatewayProbe?.ipv6.source ?? "unavailable",
      "Native interface metadata and DNS server list; no IPv6 port scan",
      context.gatewayProbe?.ipv6.confidence ?? "low",
      measuredAt
    ),
    dnsResolverAssessments: makeFinding(
      "dns_resolver_assessments",
      context.gatewayProbe?.dnsResolvers ?? [],
      context.gatewayProbe?.dnsResolvers.length ? "inferred" : "unavailable",
      "Local DNS IP classification against private/router/public/security DNS lists",
      context.gatewayProbe?.dnsResolvers.some((item) => item.confidence === "high") ? "high" : "medium",
      measuredAt
    ),
    dhcpConsistency: makeFinding(
      "dhcp_consistency",
      context.gatewayProbe?.dhcpConsistency ?? null,
      context.gatewayProbe ? "inferred" : "unavailable",
      "Logical consistency check for IP, subnet, gateway and DNS",
      context.gatewayProbe?.dhcpConsistency.confidence ?? "low",
      measuredAt
    ),
    securityChecks: makeFinding(
      "security_checks",
      securityChecks,
      securityChecks.some((finding) => finding.evidence.source === "measured") ? "measured" : "unavailable",
      "Structured WLAN, HTTP, TCP and SSDP security probes",
      securityChecks.some((finding) => finding.confidence === "high") ? "high" : "medium",
      measuredAt
    )
  };
}

function makeFinding<TValue>(
  id: string,
  value: TValue,
  source: DataSource,
  sourceDetail: string,
  confidence: FindingConfidence,
  measuredAt: Date
): WlanFinding<TValue> {
  return {
    id,
    value,
    source,
    source_detail: sourceDetail,
    confidence,
    measured_at: measuredAt
  };
}

function serializeFindings(findings: WlanScanResult["findings"]) {
  return Object.fromEntries(
    Object.entries(findings).map(([key, finding]) => [
      key,
      {
        ...finding,
        measured_at: finding.measured_at.toISOString()
      }
    ])
  );
}

function reviveFindings(findings: StoredWlanScanResult["findings"]): WlanScanResult["findings"] {
  return Object.fromEntries(
    Object.entries(findings).map(([key, finding]) => [
      key,
      {
        ...finding,
        measured_at: new Date(finding.measured_at)
      }
    ])
  ) as WlanScanResult["findings"];
}

function getPlatformLimitations() {
  if (Platform.OS === "ios") return [...PLATFORM_LIMITATIONS.ios, ...PLATFORM_LIMITATIONS.default];
  if (Platform.OS === "android") return [...PLATFORM_LIMITATIONS.android, ...PLATFORM_LIMITATIONS.default];
  if (Platform.OS === "web") return [...PLATFORM_LIMITATIONS.web, ...PLATFORM_LIMITATIONS.default];
  return [...PLATFORM_LIMITATIONS.default];
}

function scanMethodology(context: ScanContext) {
  const summary = context.subnetScan;
  const modeText =
    summary.mode === "audit"
      ? `Audit-Modus: langsamer TCP-Connect-Scan über ${summary.scannedHosts} Hosts im erkannten IPv4-Subnetz.`
      : "Standardmodus: schneller lokaler Scan gegen Gateway und ausgewählte Kandidaten-IP-Adressen.";

  return summary.limitation ? [modeText, summary.limitation] : [modeText];
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

type StoredWlanScanResult = Omit<WlanScanResult, "timestamp" | "connectedDevices" | "securityFindings" | "wifiSecurity" | "findings"> & {
  timestamp: string;
  connectedDevices: Array<Omit<DeviceInfo, "lastSeen"> & { lastSeen: string }>;
  securityFindings?: NetworkSecurityFinding[];
  wifiSecurity?: WifiSecurityDetails;
  findings: Partial<{
    [Key in keyof WlanScanResult["findings"]]: Omit<WlanScanResult["findings"][Key], "measured_at"> & {
      measured_at: string;
    };
  }>;
};

function reviveScanResult(result: StoredWlanScanResult): WlanScanResult {
  const findings = reviveFindings(result.findings);
  const securityFindings = result.securityFindings ?? [];
  findings.securityChecks =
    findings.securityChecks ??
    makeFinding("security_checks", securityFindings, "unavailable", "Legacy scan without structured security checks", "low", new Date());
  findings.deviceClassifications =
    findings.deviceClassifications ??
    makeFinding("device_classifications", [], "unavailable", "Legacy scan without device classification metadata", "low", new Date());
  findings.ipv6Status =
    findings.ipv6Status ??
    makeFinding("ipv6_status", null, "unavailable", "Legacy scan without IPv6 metadata", "low", new Date());
  findings.dnsResolverAssessments =
    findings.dnsResolverAssessments ??
    makeFinding("dns_resolver_assessments", [], "unavailable", "Legacy scan without DNS resolver classification", "low", new Date());
  findings.dhcpConsistency =
    findings.dhcpConsistency ??
    makeFinding("dhcp_consistency", null, "unavailable", "Legacy scan without DHCP consistency assessment", "low", new Date());

  return {
    ...result,
    wifiSecurity: result.wifiSecurity ?? defaultWifiSecurity(result.securityProtocol),
    securityFindings,
    scanMode: result.scanMode ?? "standard",
    scanSegment: result.scanSegment ?? "practice_wifi",
    subnetScan: result.subnetScan ?? {
      mode: "standard",
      candidateHosts: 0,
      scannedHosts: 0,
      scannedEntireRecognizedSubnet: false,
      limitation: "Legacy scan without subnet scan metadata."
    },
    timestamp: new Date(result.timestamp),
    findings,
    connectedDevices: result.connectedDevices.map((device) => ({
      ...device,
      lastSeen: new Date(device.lastSeen)
    }))
  };
}

function defaultWifiSecurity(protocol: SecurityProtocol): WifiSecurityDetails {
  return {
    protocol,
    authMode: "unknown",
    isEnterprise: false,
    isPersonal: protocol === "WPA" || protocol === "WPA2" || protocol === "WPA3",
    isMixedMode: false,
    supportsWpa3: protocol === "WPA3",
    source: "inferred",
    confidence: "low",
    platformLimitations: ["Legacy scan result without detailed WPA mode metadata."]
  };
}
