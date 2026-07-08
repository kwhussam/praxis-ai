import type { Practice } from "@/lib/store/session";
import type { InventoryDraft, InventoryItem, InventoryItemType } from "@/lib/inventory/types";

export type InventorySummary = {
  total: number;
  critical: number;
  byType: Record<InventoryItemType, number>;
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
