export type WifiSecurityProtocol = "WEP" | "WPA" | "WPA2" | "WPA3" | "OPEN" | "UNKNOWN";

export type WifiAuthMode =
  | "open"
  | "wep"
  | "wpa_personal"
  | "wpa_enterprise"
  | "wpa2_personal"
  | "wpa2_enterprise"
  | "wpa3_personal"
  | "wpa3_enterprise"
  | "mixed"
  | "unknown";

export type ProbeSource = "measured" | "inferred" | "unavailable" | "questionnaire";
export type ProbeConfidence = "high" | "medium" | "low";
export type ProbeState = "open" | "closed" | "filtered" | "unknown";
export type SmbDialect = "SMB1" | "SMB2" | "SMB3" | "UNKNOWN";
export type NetworkSegmentId = "practice_wifi" | "guest_wifi" | "server_network" | "printer_network" | "medical_device_network";
export type DnsFilterTestCategory = "malware" | "phishing";

export type SecurityCheckId =
  | "wifi_encryption"
  | "wps_status"
  | "wpa3_upgrade"
  | "router_http"
  | "telnet"
  | "smb"
  | "smb_security"
  | "upnp_ssdp"
  | "rdp"
  | "database_ports"
  | "printer_services"
  | "nas_services"
  | "camera_iot"
  | "medical_device_metadata"
  | "ipv6_exposure"
  | "dns_resolver"
  | "dns_security"
  | "dns_filter_test"
  | "dhcp_consistency"
  | "guest_network"
  | "network_segmentation"
  | "rogue_access_point"
  | "rogue_device"
  | "router_firmware"
  | "default_password_risk"
  | "firewall_baseline";

export type SecuritySeverity = "critical" | "high" | "medium" | "low";
export type SecurityStatus = "secure" | "warning" | "critical" | "unknown" | "not_supported";

export interface WifiSecurityDetails {
  protocol: WifiSecurityProtocol;
  authMode: WifiAuthMode;
  isEnterprise: boolean;
  isPersonal: boolean;
  isMixedMode: boolean;
  supportsWpa3: boolean;
  capabilities?: string;
  source: ProbeSource;
  confidence: ProbeConfidence;
  platformLimitations: string[];
}

export interface TcpProbeResult {
  host: string;
  port: number;
  state: ProbeState;
  latencyMs?: number;
  source: ProbeSource;
  errorCode?: string;
}

export interface HttpAdminProbeResult {
  host: string;
  port: number;
  state: ProbeState;
  statusCode?: number;
  redirectsToHttps: boolean;
  httpsAvailable: boolean;
  serverHeader?: string;
  source: ProbeSource;
  errorCode?: string;
}

export interface SsdpProbeResult {
  active: boolean | null;
  source: ProbeSource;
  confidence: ProbeConfidence;
  devices: Array<{
    location?: string;
    server?: string;
    usn?: string;
    st?: string;
  }>;
  errorCode?: string;
}

export type MdnsServiceType =
  | "_http._tcp"
  | "_https._tcp"
  | "_ipp._tcp"
  | "_printer._tcp"
  | "_pdl-datastream._tcp"
  | "_smb._tcp"
  | "_afpovertcp._tcp"
  | "_nfs._tcp"
  | "_rtsp._tcp"
  | "_workstation._tcp"
  | "_scanner._tcp"
  | "_dicom._tcp";

export interface MdnsServiceResult {
  type: MdnsServiceType | string;
  name?: string;
  host?: string;
  addresses: string[];
  port?: number;
  txt?: Record<string, string>;
  source: ProbeSource;
  confidence: ProbeConfidence;
  errorCode?: string;
}

export interface SnmpProbeResult {
  host: string;
  udpPort: 161;
  state: ProbeState;
  source: ProbeSource;
  confidence: ProbeConfidence;
  sysDescr?: string;
  sysObjectId?: string;
  errorCode?: string;
}

export interface SmbSecurityProbeResult {
  host: string;
  port: 445;
  state: ProbeState;
  source: ProbeSource;
  confidence: ProbeConfidence;
  supportedDialects: SmbDialect[];
  smb1Supported: boolean | null;
  signingEnabled: boolean | null;
  signingRequired: boolean | null;
  guestAccess: boolean | null;
  errorCode?: string;
}

export type DeviceClass =
  | "router"
  | "printer"
  | "nas"
  | "camera_iot"
  | "medical_device"
  | "database_server"
  | "workstation"
  | "phone"
  | "server"
  | "unknown";

export interface DeviceClassification {
  host: string;
  deviceClass: DeviceClass;
  confidence: ProbeConfidence;
  signals: string[];
  privacyBoundary: string;
  vendor?: string;
}

export interface Ipv6NetworkInfo {
  enabled: boolean;
  globalAddresses: string[];
  uniqueLocalAddresses: string[];
  linkLocalAddresses: string[];
  dnsServers: string[];
  gatewayVisible: boolean | null;
  source: ProbeSource;
  confidence: ProbeConfidence;
  errorCode?: string;
}

export interface DnsResolverAssessment {
  server: string;
  resolverClass: "router_dns" | "provider_dns" | "public_dns" | "security_dns" | "unknown" | "suspicious";
  source: ProbeSource;
  confidence: ProbeConfidence;
  filteringHint?: string;
  supportsDotLikely?: boolean;
  recommendation: string;
}

export interface DnsFilterTestResult {
  domain: string;
  category: DnsFilterTestCategory;
  blocked: boolean | null;
  responseCode?: "NOERROR" | "NXDOMAIN" | "REFUSED" | "SERVFAIL" | "TIMEOUT" | "UNKNOWN";
  resolvedAddresses: string[];
  source: ProbeSource;
  confidence: ProbeConfidence;
  errorCode?: string;
}

export interface DhcpConsistencyAssessment {
  status: "consistent" | "warning" | "critical" | "unknown";
  issues: string[];
  source: ProbeSource;
  confidence: ProbeConfidence;
}

export interface GuestNetworkAssessment {
  status: "present" | "likely_present" | "not_present" | "unknown";
  clientIsolationLikely: boolean | null;
  captivePortalLikely: boolean | null;
  ssidSignals: string[];
  score: number;
  source: ProbeSource;
  confidence: ProbeConfidence;
}

export interface SegmentationAssessment {
  score: number;
  status: "good" | "partial" | "weak" | "unknown";
  sharedSegments: Array<"guests" | "practice" | "servers" | "printers" | "iot" | "medical">;
  riskyCoLocation: string[];
  observedSegments?: NetworkSegmentId[];
  missingSegments?: NetworkSegmentId[];
  crossSegmentExposure?: string[];
  reachabilityTests?: SegmentReachabilityTestResult[];
  source: ProbeSource;
  confidence: ProbeConfidence;
}

export interface SegmentReachabilityTestResult {
  fromSegment: NetworkSegmentId;
  toSegment: NetworkSegmentId;
  host: string;
  port: number;
  service: string;
  reachable: boolean | null;
  source: ProbeSource;
  confidence: ProbeConfidence;
  errorCode?: string;
}

export interface RogueApCandidate {
  ssid: string;
  bssid?: string;
  rssi?: number;
  frequency?: number;
  securityProtocol?: string;
  reason: string[];
  confidence: ProbeConfidence;
}

export interface RogueApAssessment {
  candidates: RogueApCandidate[];
  status: "none" | "suspicious" | "unknown";
  source: ProbeSource;
  confidence: ProbeConfidence;
}

export interface RogueDeviceAssessment {
  knownDevices: number;
  unknownDevices: string[];
  suspiciousDevices: string[];
  newDevices: string[];
  status: "clean" | "unknown_devices" | "suspicious" | "unknown";
  source: ProbeSource;
  confidence: ProbeConfidence;
}

export interface RouterFingerprint {
  vendor?: string;
  model?: string;
  firmwareHint?: string;
  managementInterface: "https" | "http" | "both" | "unknown";
  evidence: string[];
  source: ProbeSource;
  confidence: ProbeConfidence;
}

export interface RouterCredentialRiskAssessment {
  risk: "low" | "medium" | "high" | "unknown";
  reasons: string[];
  questionnaireRecommended: boolean;
  source: ProbeSource;
  confidence: ProbeConfidence;
}

export interface FirewallBaselineAssessment {
  status: "good" | "partial" | "critical" | "unknown";
  exposedCriticalPorts: number[];
  exposedManagementPorts: number[];
  ipv6Risk: boolean;
  source: ProbeSource;
  confidence: ProbeConfidence;
}

export interface GatewaySecurityProbeResult {
  host: string;
  http: HttpAdminProbeResult[];
  tcp: TcpProbeResult[];
  ssdp: SsdpProbeResult;
  mdns: MdnsServiceResult[];
  snmp: SnmpProbeResult[];
  smb: SmbSecurityProbeResult[];
  deviceClassifications: DeviceClassification[];
  ipv6: Ipv6NetworkInfo;
  dnsResolvers: DnsResolverAssessment[];
  dnsFilterTests: DnsFilterTestResult[];
  dhcpConsistency: DhcpConsistencyAssessment;
}

export interface NetworkSecurityFinding {
  id: string;
  checkId: SecurityCheckId;
  title: string;
  severity: SecuritySeverity;
  status: SecurityStatus;
  detected: boolean;
  confidence: ProbeConfidence;
  details: string;
  recommendation: string;
  contextQuestions?: string[];
  scoreImpact: number;
  complianceImpact: "none" | "documentation" | "technical_measure" | "urgent_action";
  evidence: {
    source: ProbeSource;
    host?: string;
    ports?: number[];
    protocol?: string;
    raw?: Record<string, string | number | boolean | null>;
    measuredAt: string;
  };
}
