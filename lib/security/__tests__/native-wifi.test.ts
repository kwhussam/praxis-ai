var mockAndroidApiLevel = 35;
var mockGrantedPermissions = new Set<string>();
var mockPermissionRequests: string[][] = [];
var mockWifiListCalls = 0;

declare const jest: { mock(moduleName: string, factory: () => unknown): void };
declare function beforeEach(fn: () => void): void;

jest.mock("react-native", () => ({
  NativeModules: {
    PraxisShieldNetworkProbe: {
      scanDevices: async () => [{ ip: "192.168.1.10", mac: "aa:bb:cc:dd:ee:ff" }]
    }
  },
  Platform: { OS: "android", get Version() { return mockAndroidApiLevel; } },
  PermissionsAndroid: {
    PERMISSIONS: { ACCESS_FINE_LOCATION: "fine-location", NEARBY_WIFI_DEVICES: "nearby-wifi" },
    RESULTS: { GRANTED: "granted" },
    check: async (permission: string) => mockGrantedPermissions.has(permission),
    requestMultiple: async (permissions: string[]) => {
      mockPermissionRequests.push(permissions);
      return Object.fromEntries(permissions.map((permission) => [permission, mockGrantedPermissions.has(permission) ? "granted" : "denied"]));
    }
  }
}));

jest.mock("react-native-wifi-reborn", () => ({
  __esModule: true,
  default: {
    getCurrentWifiSSID: async () => "Praxis-WLAN",
    loadWifiList: async () => {
      mockWifiListCalls += 1;
      return [{ SSID: "Praxis-WLAN", BSSID: "aa:bb:cc:dd:ee:ff", capabilities: "[WPA2-PSK-CCMP]" }];
    }
  }
}));

import { ensureAndroidWifiPermissions, scanLocalDevices, scanVisibleWifiNetworks } from "@/lib/security/nativeWifi";

describe("Android native Wi-Fi discovery", () => {
  beforeEach(() => {
    mockAndroidApiLevel = 35;
    mockGrantedPermissions = new Set<string>();
    mockPermissionRequests = [];
    mockWifiListCalls = 0;
  });

  it("requires fine-location and nearby-Wi-Fi on Android 13+ before scanning", async () => {
    mockGrantedPermissions = new Set(["fine-location", "nearby-wifi"]);

    expect(await ensureAndroidWifiPermissions()).toBe(true);
    expect(mockPermissionRequests).toHaveLength(0);
    expect(await scanVisibleWifiNetworks()).toEqual([{
      ssid: "Praxis-WLAN",
      bssid: "aa:bb:cc:dd:ee:ff",
      frequency: undefined,
      level: undefined,
      capabilities: "[WPA2-PSK-CCMP]"
    }]);
    expect(mockWifiListCalls).toBe(1);
  });

  it("does not invoke WifiManager when a runtime permission is denied", async () => {
    mockGrantedPermissions = new Set(["fine-location"]);

    expect(await scanVisibleWifiNetworks()).toEqual([]);
    expect(mockPermissionRequests).toEqual([["fine-location", "nearby-wifi"]]);
    expect(mockWifiListCalls).toBe(0);
  });

  it("uses the registered NetworkProbe bridge for best-effort device metadata", async () => {
    expect(await scanLocalDevices()).toEqual([
      { ip: "192.168.1.10", mac: "aa:bb:cc:dd:ee:ff" }
    ]);
  });
});
