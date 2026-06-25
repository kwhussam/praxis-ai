import { NativeModules, Platform } from "react-native";
import WifiManager from "react-native-wifi-reborn";

export type NativeWifiNetwork = {
  ssid?: string;
  bssid?: string;
  frequency?: number;
  level?: number;
  capabilities?: string;
};

type PraxisShieldWifiModule = {
  scanDevices?: () => Promise<Array<{ ip: string; mac?: string; hostname?: string }>>;
};

const nativeWifiModule = NativeModules.PraxisShieldWifi as PraxisShieldWifiModule | undefined;

export async function getCurrentWifiSsid() {
  if (Platform.OS === "web") return null;

  try {
    return await WifiManager.getCurrentWifiSSID();
  } catch {
    return null;
  }
}

export async function scanVisibleWifiNetworks(): Promise<NativeWifiNetwork[]> {
  if (Platform.OS === "ios") {
    return [];
  }

  try {
    return (await WifiManager.loadWifiList()) as NativeWifiNetwork[];
  } catch {
    return [];
  }
}

export async function scanLocalDevices() {
  if (!nativeWifiModule?.scanDevices) {
    return [];
  }

  return nativeWifiModule.scanDevices();
}
