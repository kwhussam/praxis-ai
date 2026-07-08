export type InventoryItemType =
  | "device"
  | "network"
  | "domain"
  | "subdomain"
  | "email"
  | "provider"
  | "critical_system";

export type InventoryCriticality = "critical" | "high" | "medium" | "low";

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

export function inventoryCategoryLabel(type: InventoryItemType) {
  return INVENTORY_CATEGORIES.find((category) => category.type === type)?.label ?? type;
}

export function inventoryCategoryPluralLabel(type: InventoryItemType) {
  return INVENTORY_CATEGORIES.find((category) => category.type === type)?.pluralLabel ?? type;
}

export function inventoryCriticalityLabel(value: InventoryCriticality) {
  return INVENTORY_CRITICALITIES.find((criticality) => criticality.value === value)?.label ?? value;
}
