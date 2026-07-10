import {
  createAccessPoint,
  createKnownDevice,
  createRouterFirewallRule,
  createPracticeSeedInventory,
  importRouterFirewallRulesFromCsv,
  isKnownDeviceStale,
  normalizeMacAddress,
  summarizeAccessPoints,
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

  it("erstellt Access Points mit normalisierter BSSID", () => {
    const accessPoint = createAccessPoint(
      {
        ssid: "Praxis",
        bssid: "aabb.ccdd.eeff",
        location: "Empfang",
        vendor: "Ubiquiti",
        channel: "6",
        expectedEncryption: "WPA2_AES"
      },
      new Date("2026-07-08T00:00:00.000Z")
    );

    expect(accessPoint.bssid).toBe("AA:BB:CC:DD:EE:FF");
    expect(summarizeAccessPoints([accessPoint])).toEqual({ total: 1, openExpected: 0 });
  });

  it("erstellt Router-Firewall-Regeln für manuelle Erfassung", () => {
    const rule = createRouterFirewallRule(
      {
        name: "VPN",
        sourceView: "external",
        direction: "wan_to_lan",
        protocol: "tcp",
        ports: " 443 ",
        source: "203.0.113.10",
        destination: "Firewall",
        action: "allow",
        purpose: "VPN-Zugang",
        owner: "IT",
        enabled: true,
        lastReviewedAt: "2026-07-01"
      },
      new Date("2026-07-08T00:00:00.000Z")
    );

    expect(rule.ports).toBe("443");
    expect(rule.lastReviewedAt).toBe("2026-07-01T00:00:00.000Z");
  });

  it("importiert Router-Firewall-Regeln aus CSV", () => {
    const result = importRouterFirewallRulesFromCsv(
      "name,sourceView,direction,protocol,ports,source,destination,action,purpose,owner,enabled,lastReviewedAt\n" +
        "RDP,external,wan_to_lan,tcp,3389,any,server,allow,Fernwartung,IT,true,2026-07-01"
    );

    expect(result.rejectedRows).toHaveLength(0);
    expect(result.rules[0]).toMatchObject({
      name: "RDP",
      sourceView: "external",
      direction: "wan_to_lan",
      protocol: "tcp",
      ports: "3389",
      action: "allow"
    });
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
