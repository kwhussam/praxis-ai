import { createPracticeSeedInventory, summarizeInventory } from "@/lib/inventory/inventory";
import type { InventoryItem } from "@/lib/inventory/types";

describe("PracticeInventory", () => {
  it("fasst Inventar nach Typ und Kritikalität zusammen", () => {
    const items: InventoryItem[] = [
      item("device", "Router", "critical"),
      item("domain", "praxis.test", "high"),
      item("email", "kontakt@praxis.test", "medium")
    ];

    const summary = summarizeInventory(items);

    expect(summary.total).toBe(3);
    expect(summary.critical).toBe(1);
    expect(summary.byType.device).toBe(1);
    expect(summary.byType.domain).toBe(1);
    expect(summary.byType.email).toBe(1);
  });

  it("legt Praxisdomain und E-Mail als Seed-Inventar an", () => {
    const items = createPracticeSeedInventory({
      id: "practice-1",
      name: "Praxis Test",
      domain: "praxis.test",
      email: "kontakt@praxis.test",
      plan: "free"
    });

    expect(items.map((entry) => entry.type)).toEqual(["domain", "email"]);
    expect(items.map((entry) => entry.name)).toEqual(["praxis.test", "kontakt@praxis.test"]);
  });
});

function item(type: InventoryItem["type"], name: string, criticality: InventoryItem["criticality"]): InventoryItem {
  return {
    id: name,
    type,
    name,
    criticality,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
}
