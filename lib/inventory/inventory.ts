import type { Practice } from "@/lib/store/session";
import type {
  AccessPoint,
  AccessPointDraft,
  InventoryDraft,
  InventoryItem,
  InventoryItemType,
  KnownDevice,
  KnownDeviceDraft
} from "@/lib/inventory/types";

export type InventorySummary = {
  total: number;
  critical: number;
  byType: Record<InventoryItemType, number>;
};

export type KnownDeviceSummary = {
  total: number;
  critical: number;
  stale: number;
};

export type AccessPointSummary = {
  total: number;
  openExpected: number;
};

const emptyCounts: Record<InventoryItemType, number> = {
  device: 0,
  network: 0,
  domain: 0,
  subdomain: 0,
  email: 0,
  provider: 0,
  critical_system: 0
};

export function summarizeInventory(items: InventoryItem[]): InventorySummary {
  return items.reduce<InventorySummary>(
    (summary, item) => ({
      total: summary.total + 1,
      critical: summary.critical + (item.criticality === "critical" ? 1 : 0),
      byType: {
        ...summary.byType,
        [item.type]: summary.byType[item.type] + 1
      }
    }),
    { total: 0, critical: 0, byType: emptyCounts }
  );
}

export function createInventoryItem(draft: InventoryDraft, now = new Date()): InventoryItem {
  const timestamp = now.toISOString();

  return {
    id: `inventory-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    type: draft.type,
    name: draft.name.trim(),
    detail: normalizeOptional(draft.detail),
    owner: normalizeOptional(draft.owner),
    criticality: draft.criticality,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function createKnownDevice(draft: KnownDeviceDraft, now = new Date()): KnownDevice {
  const timestamp = now.toISOString();

  return {
    id: `known-device-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    macAddress: normalizeMacAddress(draft.macAddress),
    hostname: draft.hostname.trim(),
    deviceType: draft.deviceType,
    location: draft.location.trim(),
    owner: draft.owner.trim(),
    criticality: draft.criticality,
    lastConfirmedAt: normalizeDateInput(draft.lastConfirmedAt, now),
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function createAccessPoint(draft: AccessPointDraft, now = new Date()): AccessPoint {
  const timestamp = now.toISOString();

  return {
    id: `access-point-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    ssid: draft.ssid.trim(),
    bssid: normalizeMacAddress(draft.bssid),
    location: draft.location.trim(),
    vendor: draft.vendor.trim(),
    channel: draft.channel.trim(),
    expectedEncryption: draft.expectedEncryption,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

export function summarizeKnownDevices(devices: KnownDevice[], now = new Date()): KnownDeviceSummary {
  return devices.reduce<KnownDeviceSummary>(
    (summary, device) => ({
      total: summary.total + 1,
      critical: summary.critical + (device.criticality === "critical" ? 1 : 0),
      stale: summary.stale + (isKnownDeviceStale(device, now) ? 1 : 0)
    }),
    { total: 0, critical: 0, stale: 0 }
  );
}

export function summarizeAccessPoints(accessPoints: AccessPoint[]): AccessPointSummary {
  return {
    total: accessPoints.length,
    openExpected: accessPoints.filter((accessPoint) => accessPoint.expectedEncryption === "OPEN").length
  };
}

export function isKnownDeviceStale(device: KnownDevice, now = new Date()) {
  const confirmedAt = new Date(device.lastConfirmedAt);
  if (Number.isNaN(confirmedAt.getTime())) return true;
  const maxAgeMs = 1000 * 60 * 60 * 24 * 90;
  return now.getTime() - confirmedAt.getTime() > maxAgeMs;
}

export function normalizeMacAddress(value: string) {
  const cleaned = value.trim().replace(/[^a-fA-F0-9]/g, "").toUpperCase();
  if (cleaned.length !== 12) return value.trim().toUpperCase();
  return cleaned.match(/.{1,2}/g)?.join(":") ?? value.trim().toUpperCase();
}

export function createPracticeSeedInventory(practice: Practice | null): InventoryItem[] {
  const seedDate = new Date(0);
  const drafts: InventoryDraft[] = [];

  if (practice?.domain) {
    drafts.push({
      type: "domain",
      name: practice.domain,
      detail: "Praxis-Hauptdomain",
      criticality: "high"
    });
  }

  if (practice?.email) {
    drafts.push({
      type: "email",
      name: practice.email,
      detail: "Praxis-Kontaktadresse",
      criticality: "medium"
    });
  }

  return drafts.map((draft, index) => ({
    ...createInventoryItem(draft, new Date(seedDate.getTime() + index)),
    id: `seed-${practice?.id ?? "practice"}-${draft.type}-${index}`
  }));
}

function normalizeOptional(value?: string) {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function normalizeDateInput(value: string, fallback: Date) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback.toISOString();
  return parsed.toISOString();
}
