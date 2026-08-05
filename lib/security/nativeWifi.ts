import { NativeModules, PermissionsAndroid, Platform } from "react-native";
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

const nativeWifiModule = NativeModules.PraxisShieldNetworkProbe as PraxisShieldWifiModule | undefined;

export async function ensureAndroidWifiPermissions() {
  if (Platform.OS !== "android") return true;
  const apiLevel = typeof Platform.Version === "number" ? Platform.Version : Number.parseInt(String(Platform.Version), 10);
  const permissions = [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
  if (apiLevel >= 33) permissions.push(PermissionsAndroid.PERMISSIONS.NEARBY_WIFI_DEVICES);

  const alreadyGranted = await Promise.all(permissions.map((permission) => PermissionsAndroid.check(permission)));
  if (alreadyGranted.every(Boolean)) return true;
  const results = await PermissionsAndroid.requestMultiple(permissions);
  return permissions.every((permission) => results[permission] === PermissionsAndroid.RESULTS.GRANTED);
}

export async function getCurrentWifiSsid() {
  if (Platform.OS === "web") return null;

  try {
    if (!(await ensureAndroidWifiPermissions())) return null;
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
    if (!(await ensureAndroidWifiPermissions())) return [];
    const networks = await WifiManager.loadWifiList();
    return networks.map((network) => ({
      ssid: network.SSID,
      bssid: network.BSSID,
      frequency: network.frequency,
      level: network.level,
      capabilities: network.capabilities
    }));
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
