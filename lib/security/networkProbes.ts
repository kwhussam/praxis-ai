import { NativeModules, Platform } from "react-native";

import type {
  GatewaySecurityProbeResult,
  HttpAdminProbeResult,
  Ipv6NetworkInfo,
  Ipv6ReachabilityProbeResult,
  MdnsServiceResult,
  MdnsServiceType,
  ProbeState,
  DnsFilterTestResult,
  SmbSecurityProbeResult,
  SnmpProbeResult,
  SsdpProbeResult,
  TcpProbeResult,
  WifiSecurityDetails
} from "@/lib/security/networkProbeTypes";
import { assessDhcpConsistencyInput } from "@/lib/security/dhcpConsistency";
import { classifyDnsResolvers } from "@/lib/security/dnsAssessment";
import { buildIpv6NetworkInfo } from "@/lib/security/ipv6Assessment";
import { EXTENDED_HTTP_PORTS, EXTENDED_TCP_PORTS } from "@/lib/security/servicePortCatalog";

type NativeNetworkProbeModule = {
  getWifiSecurityDetails?: () => Promise<Partial<WifiSecurityDetails> | null>;
  probeTcpPorts?: (request: { host: string; ports: number[]; timeoutMs: number }) => Promise<TcpProbeResult[]>;
  probeIpv6TcpPorts?: (request: { host: string; ports: number[]; timeoutMs: number }) => Promise<Ipv6ReachabilityProbeResult[]>;
  probeSsdp?: (request: { timeoutMs: number }) => Promise<SsdpProbeResult>;
  discoverMdnsServices?: (request: { types: string[]; timeoutMs: number }) => Promise<MdnsServiceResult[]>;
  probeSnmpBasic?: (request: { hosts: string[]; timeoutMs: number }) => Promise<SnmpProbeResult[]>;
  probeSmbSecurity?: (request: { hosts: string[]; timeoutMs: number }) => Promise<SmbSecurityProbeResult[]>;
  resolveDnsTestDomains?: (request: { domains: string[]; timeoutMs: number }) => Promise<DnsFilterTestResult[]>;
  getIpv6NetworkInfo?: () => Promise<Ipv6NetworkInfo>;
};

const nativeNetworkProbe = NativeModules.PraxisShieldNetworkProbe as NativeNetworkProbeModule | undefined;
const HTTP_ADMIN_PORTS = EXTENDED_HTTP_PORTS;
const GATEWAY_TCP_PORTS = EXTENDED_TCP_PORTS;
export const DNS_FILTER_TEST_DOMAINS: Array<Pick<DnsFilterTestResult, "domain" | "category">> = [
  { domain: "malware.testcategory.com", category: "malware" },
  { domain: "phishing.testcategory.com", category: "phishing" }
];
export const DEFAULT_MDNS_TYPES: MdnsServiceType[] = [
  "_http._tcp",
  "_https._tcp",
  "_ipp._tcp",
  "_printer._tcp",
  "_pdl-datastream._tcp",
  "_smb._tcp",
  "_afpovertcp._tcp",
  "_nfs._tcp",
  "_rtsp._tcp",
  "_workstation._tcp",
  "_scanner._tcp",
  "_dicom._tcp"
];

export async function getNativeWifiSecurityDetails() {
  if (!nativeNetworkProbe?.getWifiSecurityDetails) return null;

  try {
    return await nativeNetworkProbe.getWifiSecurityDetails();
  } catch {
    return null;
  }
}

export async function probeGatewaySecurity(options: {
  host: string;
  localIp: string;
  subnetMask: string;
  dnsServers: string[];
  timeoutMs?: number;
}): Promise<GatewaySecurityProbeResult> {
  const { host, localIp, subnetMask, dnsServers } = options;
  const timeoutMs = options.timeoutMs ?? 1400;
  if (!isPrivateIp(host)) {
    return {
      host,
      http: [],
      tcp: [],
      ssdp: unavailableSsdp("invalid_private_ip"),
      mdns: [],
      snmp: [],
      smb: unavailableSmbSecurity([host], "invalid_private_ip"),
      deviceClassifications: [],
      ipv6: unavailableIpv6("invalid_private_ip", dnsServers),
      dnsResolvers: classifyDnsResolvers(dnsServers, host),
      dnsFilterTests: unavailableDnsFilterTests("invalid_private_ip"),
      dhcpConsistency: assessDhcpConsistencyInput({ ipAddress: localIp, subnetMask, gatewayIp: host, dnsServers })
    };
  }

  const [http, tcp, ssdp, mdns, snmp, smb, ipv6, dnsFilterTests] = await Promise.all([
    probeHttpAdmin(host, timeoutMs),
    probeTcpPorts(host, [...GATEWAY_TCP_PORTS], timeoutMs),
    probeSsdp(timeoutMs),
    discoverMdnsServices(DEFAULT_MDNS_TYPES, timeoutMs),
    probeSnmpBasic([host], timeoutMs),
    probeSmbSecurity([host], timeoutMs),
    getIpv6NetworkInfo(dnsServers),
    probeDnsFilterTestDomains(timeoutMs)
  ]);

  return {
    host,
    http,
    tcp,
    ssdp,
    mdns,
    snmp,
    smb,
    deviceClassifications: [],
    ipv6,
    dnsResolvers: classifyDnsResolvers(dnsServers, host),
    dnsFilterTests,
    dhcpConsistency: assessDhcpConsistencyInput({ ipAddress: localIp, subnetMask, gatewayIp: host, dnsServers })
  };
}

export async function probeHttpAdmin(host: string, timeoutMs = 1400): Promise<HttpAdminProbeResult[]> {
  const results = await Promise.all(HTTP_ADMIN_PORTS.map((port) => probeHttpPort(host, port, timeoutMs)));
  const httpsAvailable = results.some((result) => result.port === 443 && result.state === "open");
  return results.map((result) => ({ ...result, httpsAvailable }));
}

export async function probeDeviceServices(host: string, timeoutMs = 1200) {
  const [http, tcp, smb] = await Promise.all([
    probeHttpAdmin(host, timeoutMs),
    probeTcpPorts(host, [...GATEWAY_TCP_PORTS], timeoutMs),
    probeSmbSecurity([host], timeoutMs)
  ]);
  return { host, http, tcp, smb };
}

export async function probeTcpPorts(host: string, ports: number[], timeoutMs = 1200): Promise<TcpProbeResult[]> {
  if (!nativeNetworkProbe?.probeTcpPorts) {
    return ports.map((port) => ({
      host,
      port,
      state: "unknown",
      source: "unavailable",
      errorCode: Platform.OS === "web" ? "web_tcp_unavailable" : "native_tcp_module_unavailable"
    }));
  }

  try {
    const startedAt = Date.now();
    const results = await nativeNetworkProbe.probeTcpPorts({ host, ports, timeoutMs });
    return ports.map((port) => {
      const nativeResult = results.find((result) => result.port === port);
      return {
        host,
        port,
        state: normalizeProbeState(nativeResult?.state),
        latencyMs: nativeResult?.latencyMs ?? Date.now() - startedAt,
        source: nativeResult?.source ?? "measured",
        errorCode: nativeResult?.errorCode
      };
    });
  } catch (error) {
    return ports.map((port) => ({
      host,
      port,
      state: "unknown",
      source: "unavailable",
      errorCode: error instanceof Error ? error.message : "native_tcp_probe_failed"
    }));
  }
}

export async function probeIpv6TcpPorts(host: string, ports: number[], timeoutMs = 1200): Promise<Ipv6ReachabilityProbeResult[]> {
  if (!nativeNetworkProbe?.probeIpv6TcpPorts) {
    return ports.map((port) => ({
      host,
      port,
      state: "unknown",
      source: "unavailable",
      confidence: "low",
      errorCode: Platform.OS === "web" ? "web_ipv6_tcp_unavailable" : "native_ipv6_tcp_module_unavailable"
    }));
  }

  try {
    const startedAt = Date.now();
    const results = await nativeNetworkProbe.probeIpv6TcpPorts({ host, ports, timeoutMs });
    return ports.map((port) => {
      const nativeResult = results.find((result) => result.port === port);
      return {
        host,
        port,
        state: normalizeProbeState(nativeResult?.state),
        latencyMs: nativeResult?.latencyMs ?? Date.now() - startedAt,
        source: nativeResult?.source ?? "measured",
        confidence: nativeResult?.confidence ?? "medium",
        errorCode: nativeResult?.errorCode
      };
    });
  } catch (error) {
    return ports.map((port) => ({
      host,
      port,
      state: "unknown",
      source: "unavailable",
      confidence: "low",
      errorCode: error instanceof Error ? error.message : "native_ipv6_tcp_probe_failed"
    }));
  }
}

export async function probeSsdp(timeoutMs = 1600): Promise<SsdpProbeResult> {
  if (!nativeNetworkProbe?.probeSsdp) {
    return unavailableSsdp(Platform.OS === "web" ? "web_udp_unavailable" : "native_udp_module_unavailable");
  }

  try {
    const result = await nativeNetworkProbe.probeSsdp({ timeoutMs });
    return {
      active: typeof result.active === "boolean" ? result.active : null,
      source: result.source ?? "measured",
      confidence: result.confidence ?? (result.active ? "high" : "medium"),
      devices: Array.isArray(result.devices) ? result.devices : [],
      errorCode: result.errorCode
    };
  } catch (error) {
    return unavailableSsdp(error instanceof Error ? error.message : "native_ssdp_probe_failed");
  }
}

export async function discoverMdnsServices(types = DEFAULT_MDNS_TYPES, timeoutMs = 1600): Promise<MdnsServiceResult[]> {
  if (!nativeNetworkProbe?.discoverMdnsServices) {
    return types.map((type) => ({
      type,
      addresses: [],
      source: "unavailable",
      confidence: "low",
      errorCode: Platform.OS === "web" ? "web_mdns_unavailable" : "native_mdns_module_unavailable"
    }));
  }

  try {
    return await nativeNetworkProbe.discoverMdnsServices({ types, timeoutMs });
  } catch (error) {
    return types.map((type) => ({
      type,
      addresses: [],
      source: "unavailable",
      confidence: "low",
      errorCode: error instanceof Error ? error.message : "native_mdns_probe_failed"
    }));
  }
}

export async function probeSnmpBasic(hosts: string[], timeoutMs = 900): Promise<SnmpProbeResult[]> {
  if (!nativeNetworkProbe?.probeSnmpBasic) {
    return hosts.map((host) => ({
      host,
      udpPort: 161,
      state: "unknown",
      source: "unavailable",
      confidence: "low",
      errorCode: Platform.OS === "web" ? "web_snmp_unavailable" : "native_snmp_module_unavailable"
    }));
  }

  try {
    return await nativeNetworkProbe.probeSnmpBasic({ hosts, timeoutMs });
  } catch (error) {
    return hosts.map((host) => ({
      host,
      udpPort: 161,
      state: "unknown",
      source: "unavailable",
      confidence: "low",
      errorCode: error instanceof Error ? error.message : "native_snmp_probe_failed"
    }));
  }
}

export async function probeSmbSecurity(hosts: string[], timeoutMs = 1200): Promise<SmbSecurityProbeResult[]> {
  if (!nativeNetworkProbe?.probeSmbSecurity) {
    return unavailableSmbSecurity(
      hosts,
      Platform.OS === "web" ? "web_smb_probe_unavailable" : "native_smb_probe_unavailable"
    );
  }

  try {
    const results = await nativeNetworkProbe.probeSmbSecurity({ hosts, timeoutMs });
    return hosts.map((host) => normalizeSmbSecurityResult(host, results.find((result) => result.host === host)));
  } catch (error) {
    return unavailableSmbSecurity(hosts, error instanceof Error ? error.message : "native_smb_probe_failed");
  }
}

export async function probeDnsFilterTestDomains(timeoutMs = 1200): Promise<DnsFilterTestResult[]> {
  if (!nativeNetworkProbe?.resolveDnsTestDomains) {
    return unavailableDnsFilterTests(Platform.OS === "web" ? "web_dns_test_unavailable" : "native_dns_test_unavailable");
  }

  try {
    const domains = DNS_FILTER_TEST_DOMAINS.map((item) => item.domain);
    const results = await nativeNetworkProbe.resolveDnsTestDomains({ domains, timeoutMs });
    return DNS_FILTER_TEST_DOMAINS.map((test) => normalizeDnsFilterTestResult(test, results.find((result) => result.domain === test.domain)));
  } catch (error) {
    return unavailableDnsFilterTests(error instanceof Error ? error.message : "native_dns_test_failed");
  }
}

export async function getIpv6NetworkInfo(dnsServers: string[]): Promise<Ipv6NetworkInfo> {
  if (!nativeNetworkProbe?.getIpv6NetworkInfo) {
    return buildIpv6NetworkInfo([], dnsServers);
  }

  try {
    const info = await nativeNetworkProbe.getIpv6NetworkInfo();
    return {
      ...info,
      dnsServers: info.dnsServers.length > 0 ? info.dnsServers : dnsServers.filter((server) => server.includes(":"))
    };
  } catch (error) {
    return unavailableIpv6(error instanceof Error ? error.message : "native_ipv6_probe_failed", dnsServers);
  }
}

async function probeHttpPort(host: string, port: number, timeoutMs: number): Promise<HttpAdminProbeResult> {
  const protocol = port === 443 ? "https" : "http";
  const startedAt = Date.now();

  try {
    const response = await fetchWithTimeout(`${protocol}://${host}:${port}`, timeoutMs, "HEAD");
    return {
      host,
      port,
      state: "open",
      statusCode: response.status,
      redirectsToHttps: responseRedirectsToHttps(response),
      httpsAvailable: port === 443,
      serverHeader: response.headers.get("server") ?? undefined,
      source: "measured"
    };
  } catch (headError) {
    if (headError instanceof Error && headError.name === "AbortError") {
      return httpResult(host, port, "filtered", "http_timeout");
    }

    try {
      const response = await fetchWithTimeout(`${protocol}://${host}:${port}`, Math.max(600, timeoutMs - (Date.now() - startedAt)), "GET");
      return {
        host,
        port,
        state: "open",
        statusCode: response.status,
        redirectsToHttps: responseRedirectsToHttps(response),
        httpsAvailable: port === 443,
        serverHeader: response.headers.get("server") ?? undefined,
        source: "measured"
      };
    } catch (getError) {
      if (getError instanceof Error && getError.name === "AbortError") {
        return httpResult(host, port, "filtered", "http_timeout");
      }
      return httpResult(host, port, "closed", getError instanceof Error ? getError.message : "http_probe_failed");
    }
  }
}

async function fetchWithTimeout(url: string, timeoutMs: number, method: "HEAD" | "GET") {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      method,
      signal: controller.signal,
      redirect: "manual",
      headers: {
        Accept: "text/html,*/*;q=0.8",
        "Cache-Control": "no-store"
      }
    });
  } finally {
    clearTimeout(timeout);
  }
}

function responseRedirectsToHttps(response: Response) {
  const location = response.headers.get("location") ?? "";
  return location.toLowerCase().startsWith("https://") || response.url.toLowerCase().startsWith("https://");
}

function httpResult(
  host: string,
  port: number,
  state: ProbeState,
  errorCode?: string
): HttpAdminProbeResult {
  return {
    host,
    port,
    state,
    redirectsToHttps: false,
    httpsAvailable: port === 443 && state === "open",
    source: "measured",
    errorCode
  };
}

function unavailableIpv6(errorCode: string, dnsServers: string[]): Ipv6NetworkInfo {
  return {
    ...buildIpv6NetworkInfo([], dnsServers),
    errorCode
  };
}

function unavailableSsdp(errorCode: string): SsdpProbeResult {
  return {
    active: null,
    source: "unavailable",
    confidence: "low",
    devices: [],
    errorCode
  };
}

function unavailableSmbSecurity(hosts: string[], errorCode: string): SmbSecurityProbeResult[] {
  return hosts.map((host) => ({
    host,
    port: 445,
    state: "unknown",
    source: "unavailable",
    confidence: "low",
    supportedDialects: [],
    smb1Supported: null,
    signingEnabled: null,
    signingRequired: null,
    guestAccess: null,
    errorCode
  }));
}

function unavailableDnsFilterTests(errorCode: string): DnsFilterTestResult[] {
  return DNS_FILTER_TEST_DOMAINS.map((test) => ({
    domain: test.domain,
    category: test.category,
    blocked: null,
    resolvedAddresses: [],
    source: "unavailable",
    confidence: "low",
    errorCode
  }));
}

function normalizeDnsFilterTestResult(
  test: Pick<DnsFilterTestResult, "domain" | "category">,
  result?: DnsFilterTestResult
): DnsFilterTestResult {
  if (!result) return unavailableDnsFilterTests("native_dns_test_missing_result").find((item) => item.domain === test.domain)!;
  const responseCode = normalizeDnsResponseCode(result.responseCode);
  const blocked =
    typeof result.blocked === "boolean"
      ? result.blocked
      : responseCode === "NXDOMAIN" || responseCode === "REFUSED"
        ? true
        : responseCode === "NOERROR" && result.resolvedAddresses.length > 0
          ? false
          : null;

  return {
    domain: test.domain,
    category: test.category,
    blocked,
    responseCode,
    resolvedAddresses: Array.isArray(result.resolvedAddresses) ? result.resolvedAddresses : [],
    source: result.source ?? "measured",
    confidence: result.confidence ?? "medium",
    errorCode: result.errorCode
  };
}

function normalizeDnsResponseCode(code?: string) {
  if (code === "NOERROR" || code === "NXDOMAIN" || code === "REFUSED" || code === "SERVFAIL" || code === "TIMEOUT" || code === "UNKNOWN") return code;
  return undefined;
}

function normalizeSmbSecurityResult(host: string, result?: SmbSecurityProbeResult): SmbSecurityProbeResult {
  if (!result) return unavailableSmbSecurity([host], "native_smb_probe_missing_result")[0];

  return {
    host,
    port: 445,
    state: normalizeProbeState(result.state),
    source: result.source ?? "measured",
    confidence: result.confidence ?? "medium",
    supportedDialects: Array.isArray(result.supportedDialects) ? result.supportedDialects : [],
    smb1Supported: typeof result.smb1Supported === "boolean" ? result.smb1Supported : null,
    signingEnabled: typeof result.signingEnabled === "boolean" ? result.signingEnabled : null,
    signingRequired: typeof result.signingRequired === "boolean" ? result.signingRequired : null,
    guestAccess: typeof result.guestAccess === "boolean" ? result.guestAccess : null,
    errorCode: result.errorCode
  };
}

function normalizeProbeState(state?: string): ProbeState {
  if (state === "open" || state === "closed" || state === "filtered" || state === "unknown") {
    return state;
  }
  return "unknown";
}

function isPrivateIp(ipAddress: string) {
  const parts = ipAddress.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return false;
  const [first, second] = parts;
  return first === 10 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168);
}
