import { NativeModules, PermissionsAndroid, Platform } from "react-native";
import WifiManager from "react-native-wifi-reborn";

import {
  collected,
  isCollected,
  notCollected,
  type CollectionResult
} from "@/lib/assessment/collection";

export type NativeWifiNetwork = {
  ssid?: string;
  bssid?: string;
  frequency?: number;
  level?: number;
  capabilities?: string;
};

export type NativeNetworkDevice = {
  ip: string;
  mac?: string;
  hostname?: string;
};

type PraxisShieldWifiModule = {
  scanDevices?: () => Promise<NativeNetworkDevice[]>;
};

export type NativeCollectionOptions = {
  timeoutMs?: number;
  now?: Date;
};

export const WIFI_OBSERVATION_TTL_MS = 5 * 60 * 1000;
export const LOCAL_DEVICE_OBSERVATION_TTL_MS = 10 * 60 * 1000;
const DEFAULT_NATIVE_TIMEOUT_MS = 8_000;

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

export async function collectCurrentWifiSsid(
  options: NativeCollectionOptions = {}
): Promise<CollectionResult<string>> {
  if (Platform.OS === "web") {
    return notCollected("unsupported", "Die Web-Plattform darf den aktuellen WLAN-Namen nicht auslesen.", {
      now: options.now
    });
  }

  const permission = await resolveWifiPermission(options.now);
  if (permission) return permission;

  try {
    const ssid = await withTimeout(
      WifiManager.getCurrentWifiSSID(),
      options.timeoutMs ?? DEFAULT_NATIVE_TIMEOUT_MS
    );
    if (!ssid?.trim()) {
      return notCollected("unavailable", "Der aktuelle WLAN-Name wurde vom Betriebssystem nicht bereitgestellt.", {
        now: options.now
      });
    }
    return collected(ssid, { now: options.now, ttlMs: WIFI_OBSERVATION_TTL_MS });
  } catch (error) {
    return nativeFailure(error, "Der aktuelle WLAN-Name konnte nicht gelesen werden.", options.now);
  }
}

export async function collectVisibleWifiNetworks(
  options: NativeCollectionOptions = {}
): Promise<CollectionResult<NativeWifiNetwork[]>> {
  if (Platform.OS === "ios" || Platform.OS === "web") {
    return notCollected("unsupported", "Die Plattform erlaubt keinen Scan sichtbarer WLAN-Netze.", {
      now: options.now
    });
  }

  const permission = await resolveWifiPermission(options.now);
  if (permission) return permission;

  try {
    const networks = await withTimeout(
      WifiManager.loadWifiList(),
      options.timeoutMs ?? DEFAULT_NATIVE_TIMEOUT_MS
    );
    return collected(
      networks.map((network) => ({
        ssid: network.SSID,
        bssid: network.BSSID,
        frequency: network.frequency,
        level: network.level,
        capabilities: network.capabilities
      })),
      { now: options.now, ttlMs: WIFI_OBSERVATION_TTL_MS }
    );
  } catch (error) {
    return nativeFailure(error, "Sichtbare WLAN-Netze konnten nicht gelesen werden.", options.now);
  }
}

export async function collectLocalDevices(
  options: NativeCollectionOptions = {}
): Promise<CollectionResult<NativeNetworkDevice[]>> {
  if (Platform.OS === "web" || !nativeWifiModule?.scanDevices) {
    return notCollected("unsupported", "Für diese Plattform ist keine native Geräteerkennung verfügbar.", {
      now: options.now
    });
  }

  try {
    const devices = await withTimeout(
      nativeWifiModule.scanDevices(),
      options.timeoutMs ?? DEFAULT_NATIVE_TIMEOUT_MS
    );
    return collected(devices, { now: options.now, ttlMs: LOCAL_DEVICE_OBSERVATION_TTL_MS });
  } catch (error) {
    return nativeFailure(error, "Die native Geräteerkennung ist fehlgeschlagen.", options.now);
  }
}

// Rückwärtskompatible Convenience-APIs. Neue Assessment-Pfade verwenden die
// collect*-Varianten, damit ein Sensorfehler nicht als leere Messung erscheint.
export async function getCurrentWifiSsid() {
  const result = await collectCurrentWifiSsid();
  return isCollected(result) ? result.value : null;
}

export async function scanVisibleWifiNetworks(): Promise<NativeWifiNetwork[]> {
  const result = await collectVisibleWifiNetworks();
  return isCollected(result) ? result.value : [];
}

export async function scanLocalDevices(): Promise<NativeNetworkDevice[]> {
  const result = await collectLocalDevices();
  return isCollected(result) ? result.value : [];
}

async function resolveWifiPermission(now?: Date): Promise<CollectionResult<never> | null> {
  try {
    if (await ensureAndroidWifiPermissions()) return null;
    return notCollected("permission_denied", "Die erforderliche WLAN-Berechtigung wurde nicht erteilt.", { now });
  } catch {
    return notCollected("error", "Der WLAN-Berechtigungsstatus konnte nicht ermittelt werden.", { now });
  }
}

function nativeFailure<T>(error: unknown, reason: string, now?: Date): CollectionResult<T> {
  return error instanceof NativeCollectionTimeout
    ? notCollected("timeout", reason, { now })
    : notCollected("error", reason, { now });
}

class NativeCollectionTimeout extends Error {}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new NativeCollectionTimeout()), Math.max(0, timeoutMs));
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}
