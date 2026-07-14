declare const jest: {
  mock(moduleName: string, factory: () => unknown): void;
};

let mockInsertResult: { error: { code?: string; message: string } | null };
let mockSelectedRow: unknown;

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
  getCurrentWifiSsid: async () => "Praxis-WLAN",
  scanLocalDevices: async () => [],
  scanVisibleWifiNetworks: async () => []
}));
jest.mock("@/lib/security/networkProbes", () => ({
  getNativeWifiSecurityDetails: async () => null,
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

import { syncWlanScanResultToSupabase, type WlanScanResult } from "@/lib/security/wlan";

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
    methodology: []
  };
}
