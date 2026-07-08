import {
  createKnownDevice,
  createPracticeSeedInventory,
  isKnownDeviceStale,
  normalizeMacAddress,
  summarizeInventory,
  summarizeKnownDevices
} from "@/lib/inventory/inventory";
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

  it("normalisiert MAC-Adressen für bekannte Geräte", () => {
    expect(normalizeMacAddress("aabb.ccdd.eeff")).toBe("AA:BB:CC:DD:EE:FF");

    const device = createKnownDevice(
      {
        macAddress: "aa-bb-cc-dd-ee-ff",
        hostname: "empfang-pc",
        deviceType: "workstation",
        location: "Empfang",
        owner: "Praxis",
        criticality: "high",
        lastConfirmedAt: "2026-07-01"
      },
      new Date("2026-07-08T00:00:00.000Z")
    );

    expect(device.macAddress).toBe("AA:BB:CC:DD:EE:FF");
    expect(device.hostname).toBe("empfang-pc");
  });

  it("erkennt überfällige Known Devices", () => {
    const current = new Date("2026-07-08T00:00:00.000Z");
    const fresh = createKnownDevice(
      {
        macAddress: "AA:BB:CC:DD:EE:01",
        hostname: "fresh",
        deviceType: "server",
        location: "Serverraum",
        owner: "IT",
        criticality: "critical",
        lastConfirmedAt: "2026-06-01"
      },
      current
    );
    const stale = createKnownDevice(
      {
        macAddress: "AA:BB:CC:DD:EE:02",
        hostname: "stale",
        deviceType: "printer",
        location: "Empfang",
        owner: "Praxis",
        criticality: "medium",
        lastConfirmedAt: "2026-01-01"
      },
      current
    );

    expect(isKnownDeviceStale(fresh, current)).toBe(false);
    expect(isKnownDeviceStale(stale, current)).toBe(true);
    expect(summarizeKnownDevices([fresh, stale], current)).toEqual({ total: 2, critical: 1, stale: 1 });
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
