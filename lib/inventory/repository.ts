import type {
  AccessPoint,
  InventoryItem,
  InventoryProvenance,
  KnownDevice,
  RouterFirewallRule,
  RouterWifiConfiguration
} from "@/lib/inventory/types";

export const INVENTORY_SNAPSHOT_VERSION = 1 as const;

export type InventoryPracticeSnapshot = {
  version: typeof INVENTORY_SNAPSHOT_VERSION;
  practiceId: string;
  revision: number;
  items: InventoryItem[];
  knownDevices: KnownDevice[];
  accessPoints: AccessPoint[];
  routerWifiConfig: RouterWifiConfiguration | null;
  routerFirewallRules: RouterFirewallRule[];
  updatedAt: string;
};

export type InventoryRepositoryLoadResult =
  | { status: "ready"; snapshot: InventoryPracticeSnapshot }
  | { status: "empty" }
  | { status: "volatile"; reason: "secure_store_unavailable" }
  | { status: "error"; reason: "key_missing" | "invalid_payload" | "decrypt_failed" | "storage_failed" };

export type InventoryRepositorySaveResult =
  | { status: "saved"; revision: number }
  | { status: "conflict"; actualRevision: number }
  | { status: "volatile"; reason: "secure_store_unavailable" }
  | { status: "error"; reason: "encrypt_failed" | "storage_failed" };

export type InventoryRepositoryDeleteResult =
  | { status: "deleted" }
  | { status: "volatile"; reason: "secure_store_unavailable" }
  | { status: "error"; reason: "storage_failed" };

export interface InventoryRepository {
  load(practiceId: string): Promise<InventoryRepositoryLoadResult>;
  save(snapshot: InventoryPracticeSnapshot, expectedRevision: number): Promise<InventoryRepositorySaveResult>;
  delete(practiceId: string): Promise<InventoryRepositoryDeleteResult>;
}

export function emptyInventorySnapshot(practiceId: string, now = new Date()): InventoryPracticeSnapshot {
  return {
    version: INVENTORY_SNAPSHOT_VERSION,
    practiceId,
    revision: 0,
    items: [],
    knownDevices: [],
    accessPoints: [],
    routerWifiConfig: null,
    routerFirewallRules: [],
    updatedAt: now.toISOString()
  };
}

export function parseInventorySnapshot(value: string, expectedPracticeId: string): InventoryPracticeSnapshot | null {
  if (value.length > MAX_SNAPSHOT_LENGTH) return null;
  try {
    const candidate = JSON.parse(value) as unknown;
    if (!isRecord(candidate)) return null;
    if (candidate.version !== INVENTORY_SNAPSHOT_VERSION || candidate.practiceId !== expectedPracticeId) return null;
    if (!isRevision(candidate.revision) || !isIsoDate(candidate.updatedAt)) return null;
    if (!boundedArray(candidate.items) || !candidate.items.every(isInventoryItem)) return null;
    if (!boundedArray(candidate.knownDevices) || !candidate.knownDevices.every(isKnownDevice)) return null;
    if (!boundedArray(candidate.accessPoints) || !candidate.accessPoints.every(isAccessPoint)) return null;
    if (candidate.routerWifiConfig !== null && !isRouterWifiConfiguration(candidate.routerWifiConfig)) return null;
    if (!boundedArray(candidate.routerFirewallRules) || !candidate.routerFirewallRules.every(isRouterFirewallRule)) return null;
    return candidate as InventoryPracticeSnapshot;
  } catch {
    return null;
  }
}

function isInventoryItem(value: unknown): value is InventoryItem {
  if (!isRecord(value)) return false;
  return isCommonEntity(value)
    && isOneOf(value.type, ["device", "network", "domain", "subdomain", "email", "provider", "critical_system"])
    && typeof value.name === "string"
    && optionalString(value.detail)
    && optionalString(value.owner)
    && isCriticality(value.criticality);
}

function isKnownDevice(value: unknown): value is KnownDevice {
  if (!isRecord(value)) return false;
  return isCommonEntity(value)
    && typeof value.macAddress === "string"
    && typeof value.hostname === "string"
    && isOneOf(value.deviceType, ["router", "workstation", "server", "printer", "phone", "tablet", "medical", "iot", "unknown"])
    && typeof value.location === "string"
    && typeof value.owner === "string"
    && isCriticality(value.criticality)
    && isIsoDate(value.lastConfirmedAt);
}

function isAccessPoint(value: unknown): value is AccessPoint {
  if (!isRecord(value)) return false;
  return isCommonEntity(value)
    && typeof value.ssid === "string"
    && typeof value.bssid === "string"
    && typeof value.location === "string"
    && typeof value.vendor === "string"
    && typeof value.channel === "string"
    && isOneOf(value.expectedEncryption, ["WPA2_AES", "WPA2_WPA3_MIXED", "WPA3", "OPEN", "UNKNOWN"]);
}

function isRouterWifiConfiguration(value: unknown): value is RouterWifiConfiguration {
  if (!isRecord(value)) return false;
  return ["wpa2Aes", "wpa2Wpa3MixedMode", "wpa3", "tkip", "openWifi", "wps"].every(
    (key) => typeof value[key] === "boolean"
  ) && isProvenance(value.provenance) && optionalIsoDate(value.updatedAt);
}

function isRouterFirewallRule(value: unknown): value is RouterFirewallRule {
  if (!isRecord(value)) return false;
  return isCommonEntity(value)
    && ["name", "ports", "source", "destination", "purpose", "owner"].every((key) => typeof value[key] === "string")
    && isOneOf(value.sourceView, ["external", "internal"])
    && isOneOf(value.direction, ["wan_to_lan", "lan_to_wan", "lan_to_lan", "vpn_to_lan"])
    && isOneOf(value.protocol, ["tcp", "udp", "icmp", "any"])
    && isOneOf(value.action, ["allow", "deny"])
    && typeof value.enabled === "boolean"
    && optionalIsoDate(value.lastReviewedAt)
    && optionalIsoDate(value.importedAt);
}

function isCommonEntity(value: Record<string, unknown>) {
  return typeof value.id === "string"
    && isIsoDate(value.createdAt)
    && isIsoDate(value.updatedAt)
    && isProvenance(value.provenance);
}

function isProvenance(value: unknown): value is InventoryProvenance {
  if (!isRecord(value)) return false;
  return isOneOf(value.source, ["manual", "observed", "imported", "practice_profile", "connector", "agent"])
    && typeof value.synthetic === "boolean"
    && typeof value.confidence === "number"
    && Number.isInteger(value.confidence)
    && value.confidence >= 0
    && value.confidence <= 100
    && isOneOf(value.syncPolicy, ["local_only", "cloud_allowed"])
    && (!value.synthetic || value.syncPolicy === "local_only")
    && (value.source !== "practice_profile" || value.synthetic)
    && optionalIsoDate(value.observedAt)
    && optionalIsoDate(value.confirmedAt)
    && optionalIsoDate(value.expiresAt);
}

function isCriticality(value: unknown) {
  return isOneOf(value, ["critical", "high", "medium", "low"]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function optionalString(value: unknown) {
  return value === undefined || typeof value === "string";
}

function optionalIsoDate(value: unknown) {
  return value === undefined || isIsoDate(value);
}

function isIsoDate(value: unknown) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isRevision(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && allowed.includes(value as T);
}

function boundedArray(value: unknown): value is unknown[] {
  return Array.isArray(value) && value.length <= MAX_RECORDS_PER_COLLECTION;
}

const MAX_SNAPSHOT_LENGTH = 8 * 1024 * 1024;
const MAX_RECORDS_PER_COLLECTION = 10_000;
