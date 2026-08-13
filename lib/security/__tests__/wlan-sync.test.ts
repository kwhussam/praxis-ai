declare const jest: {
  mock(moduleName: string, factory: () => unknown): void;
};

let mockInsertResult: { error: { code?: string; message: string } | null };
let mockSelectedRow: unknown;
var mockNativeWifiSecurityDetails: Record<string, unknown> | null = null;

jest.mock("@react-native-community/netinfo", () => ({
  __esModule: true,
  default: { fetch: async () => ({ type: "wifi", details: {} }) }
}));

jest.mock("expo-device", () => ({}));
jest.mock("expo-network", () => ({
  getIpAddressAsync: async () => "192.168.1.10"
}));
jest.mock("react-native", () => ({
  Platform: { OS: "ios" }
}));
jest.mock("@/lib/security/nativeWifi", () => ({
  WIFI_OBSERVATION_TTL_MS: 300000,
  collectCurrentWifiSsid: async () => ({ status: "collected", value: "Praxis-WLAN", observed_at: "2026-07-14T12:00:00.000Z", expires_at: "2026-07-14T12:05:00.000Z", freshness: "fresh" }),
  collectLocalDevices: async () => ({ status: "collected", value: [], observed_at: "2026-07-14T12:00:00.000Z", expires_at: "2026-07-14T12:10:00.000Z", freshness: "fresh" }),
  collectVisibleWifiNetworks: async () => ({ status: "unsupported", reason: "iOS", observed_at: "2026-07-14T12:00:00.000Z", freshness: "unknown" })
}));
jest.mock("@/lib/security/networkProbes", () => ({
  getNativeWifiSecurityDetails: async () => mockNativeWifiSecurityDetails,
  probeDeviceServices: async () => ({ http: [], tcp: [], smb: [], ssdp: [], mdns: [], snmp: [] }),
  probeGatewaySecurity: async () => null,
  probeIpv6TcpPorts: async () => [],
  probeTcpPorts: async () => []
}));
jest.mock("@/lib/api/supabase", () => ({
  supabase: {
    from: () => ({
      insert: async () => mockInsertResult,
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: mockSelectedRow, error: null })
          })
        })
      })
    })
  }
}));

import { runWlanSecurityScan, syncWlanScanResultToSupabase, type WlanScanResult } from "@/lib/security/wlan";

describe("WLAN collection contract", () => {
  it("surfaces platform limitations and coverage instead of treating them as empty measurements", async () => {
    mockNativeWifiSecurityDetails = null;
    const result = await runWlanSecurityScan({ phaseDelayMs: 0, phaseIds: ["network_info"] });

    expect(result.networkName).toBe("Praxis-WLAN");
    expect(result.collection.currentWifi.status).toBe("collected");
    expect(result.collection.visibleWifiNetworks.status).toBe("unsupported");
    expect(result.collection.localDevices.status).toBe("not_checked");
    expect(result.coverage).toMatchObject({
      score: 33,
      status: "insufficient",
      unsupported: ["securityProtocol", "visibleWifiNetworks"]
    });
    expect(result.findings.networkName.collection_status).toBe("collected");
    expect(result.findings.securityProtocol.collection_status).toBe("unsupported");
    expect(result.findings.securityProtocol.value).toBe(null);
    expect(result.findings.securityProtocol.collection_reason).toContain("iOS");
    expect(result.methodology.some((line) => line.includes("visibleWifiNetworks: unsupported"))).toBe(true);
  });

  it("uses native security evidence independently from unsupported visible-network scanning", async () => {
    mockNativeWifiSecurityDetails = { protocol: "WPA2", source: "measured", confidence: "high" };

    const result = await runWlanSecurityScan({ phaseDelayMs: 0, phaseIds: ["network_info"] });

    expect(result.collection.visibleWifiNetworks.status).toBe("unsupported");
    expect(result.collection.securityProtocol.status).toBe("collected");
    expect(result.findings.securityProtocol).toMatchObject({
      value: "WPA2",
      source: "measured",
      source_detail: "Native WiFi security details",
      collection_status: "collected"
    });
  });
});

describe("syncWlanScanResultToSupabase", () => {
  it("treats a duplicate client_sync_id as an idempotent retry when the existing row is visible", async () => {
    mockInsertResult = { error: { code: "23505", message: "duplicate key value violates unique constraint" } };
    mockSelectedRow = { id: "80000000-0000-4000-8000-0000000000a1", created_at: "2026-07-14T12:00:00.000Z" };

    const result = await syncWlanScanResultToSupabase("11111111-1111-4111-8111-111111111111", minimalScanResult());

    expect(result).toEqual({
      ok: true,
      replayed: true,
      scanId: "80000000-0000-4000-8000-0000000000a1"
    });
  });
});

function minimalScanResult(): WlanScanResult {
  return {
    networkName: "Praxis-WLAN",
    securityProtocol: "WPA2",
    wifiSecurity: { protocol: "WPA2" } as WlanScanResult["wifiSecurity"],
    ipAddress: "192.168.1.10",
    subnetMask: "255.255.255.0",
    gatewayIp: "192.168.1.1",
    dnsServers: ["192.168.1.1"],
    connectedDevices: [],
    vulnerabilities: [],
    securityFindings: [],
    riskScore: 80,
    scanMode: "standard",
    scanSegment: "practice_wifi",
    subnetScan: {
      mode: "standard",
      candidateHosts: 0,
      scannedHosts: 0,
      scannedEntireRecognizedSubnet: false
    },
    timestamp: new Date("2026-07-14T12:00:00.000Z"),
    findings: {} as WlanScanResult["findings"],
    methodology: [],
    collection: {
      currentWifi: { status: "collected", observed_at: "2026-07-14T12:00:00.000Z", expires_at: "2026-07-14T12:05:00.000Z", freshness: "fresh" },
      securityProtocol: { status: "collected", observed_at: "2026-07-14T12:00:00.000Z", expires_at: "2026-07-14T12:05:00.000Z", freshness: "fresh" },
      visibleWifiNetworks: { status: "unsupported", reason: "iOS", observed_at: "2026-07-14T12:00:00.000Z", freshness: "unknown" },
      localDevices: { status: "not_checked", reason: "Nicht ausgeführt", observed_at: "2026-07-14T12:00:00.000Z", freshness: "unknown" },
      mdnsDiscovery: { status: "unsupported", reason: "iOS", observed_at: "2026-07-14T12:00:00.000Z", freshness: "unknown" }
    },
    coverage: {
      score: 67,
      status: "insufficient",
      active: 2,
      total: 3,
      missing: ["localDevices"],
      unsupported: ["visibleWifiNetworks"]
    }
  };
}
