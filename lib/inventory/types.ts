export type InventoryItemType =
  | "device"
  | "network"
  | "domain"
  | "subdomain"
  | "email"
  | "provider"
  | "critical_system";

export type InventoryCriticality = "critical" | "high" | "medium" | "low";
export type KnownDeviceType =
  | "router"
  | "workstation"
  | "server"
  | "printer"
  | "phone"
  | "tablet"
  | "medical"
  | "iot"
  | "unknown";
export type AccessPointExpectedEncryption = "WPA2_AES" | "WPA2_WPA3_MIXED" | "WPA3" | "OPEN" | "UNKNOWN";

export type InventoryItem = {
  id: string;
  type: InventoryItemType;
  name: string;
  detail?: string;
  owner?: string;
  criticality: InventoryCriticality;
  createdAt: string;
  updatedAt: string;
};

export type InventoryDraft = {
  type: InventoryItemType;
  name: string;
  detail?: string;
  owner?: string;
  criticality: InventoryCriticality;
};

export type KnownDevice = {
  id: string;
  macAddress: string;
  hostname: string;
  deviceType: KnownDeviceType;
  location: string;
  owner: string;
  criticality: InventoryCriticality;
  lastConfirmedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type KnownDeviceDraft = {
  macAddress: string;
  hostname: string;
  deviceType: KnownDeviceType;
  location: string;
  owner: string;
  criticality: InventoryCriticality;
  lastConfirmedAt: string;
};

export type AccessPoint = {
  id: string;
  ssid: string;
  bssid: string;
  location: string;
  vendor: string;
  channel: string;
  expectedEncryption: AccessPointExpectedEncryption;
  createdAt: string;
  updatedAt: string;
};

export type AccessPointDraft = {
  ssid: string;
  bssid: string;
  location: string;
  vendor: string;
  channel: string;
  expectedEncryption: AccessPointExpectedEncryption;
};

export type RouterWifiConfiguration = {
  wpa2Aes: boolean;
  wpa2Wpa3MixedMode: boolean;
  wpa3: boolean;
  tkip: boolean;
  openWifi: boolean;
  wps: boolean;
  updatedAt?: string;
};

export type InventoryCategory = {
  type: InventoryItemType;
  label: string;
  pluralLabel: string;
};

export const INVENTORY_CATEGORIES: InventoryCategory[] = [
  { type: "device", label: "Gerät", pluralLabel: "Geräte" },
  { type: "network", label: "Netz", pluralLabel: "Netze" },
  { type: "domain", label: "Domain", pluralLabel: "Domains" },
  { type: "subdomain", label: "Subdomain", pluralLabel: "Subdomains" },
  { type: "email", label: "E-Mail", pluralLabel: "E-Mail-Adressen" },
  { type: "provider", label: "Dienstleister", pluralLabel: "Dienstleister" },
  { type: "critical_system", label: "Kritisches System", pluralLabel: "Kritische Systeme" }
];

export const INVENTORY_CRITICALITIES: Array<{ value: InventoryCriticality; label: string }> = [
  { value: "critical", label: "Kritisch" },
  { value: "high", label: "Hoch" },
  { value: "medium", label: "Mittel" },
  { value: "low", label: "Niedrig" }
];

export const KNOWN_DEVICE_TYPES: Array<{ value: KnownDeviceType; label: string }> = [
  { value: "router", label: "Router" },
  { value: "workstation", label: "Arbeitsplatz" },
  { value: "server", label: "Server" },
  { value: "printer", label: "Drucker" },
  { value: "phone", label: "Telefon" },
  { value: "tablet", label: "Tablet" },
  { value: "medical", label: "Medizingerät" },
  { value: "iot", label: "IoT" },
  { value: "unknown", label: "Unbekannt" }
];

export const ACCESS_POINT_ENCRYPTIONS: Array<{ value: AccessPointExpectedEncryption; label: string }> = [
  { value: "WPA2_AES", label: "WPA2-AES" },
  { value: "WPA2_WPA3_MIXED", label: "WPA2/WPA3 Mixed" },
  { value: "WPA3", label: "WPA3" },
  { value: "OPEN", label: "Offen" },
  { value: "UNKNOWN", label: "Unbekannt" }
];

export function inventoryCategoryLabel(type: InventoryItemType) {
  return INVENTORY_CATEGORIES.find((category) => category.type === type)?.label ?? type;
}

export function inventoryCategoryPluralLabel(type: InventoryItemType) {
  return INVENTORY_CATEGORIES.find((category) => category.type === type)?.pluralLabel ?? type;
}

export function inventoryCriticalityLabel(value: InventoryCriticality) {
  return INVENTORY_CRITICALITIES.find((criticality) => criticality.value === value)?.label ?? value;
}

export function knownDeviceTypeLabel(value: KnownDeviceType) {
  return KNOWN_DEVICE_TYPES.find((deviceType) => deviceType.value === value)?.label ?? value;
}

export function accessPointEncryptionLabel(value: AccessPointExpectedEncryption) {
  return ACCESS_POINT_ENCRYPTIONS.find((encryption) => encryption.value === value)?.label ?? value;
}
