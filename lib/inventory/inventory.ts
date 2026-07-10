import type { Practice } from "@/lib/store/session";
import type {
  AccessPoint,
  AccessPointDraft,
  InventoryDraft,
  InventoryItem,
  InventoryItemType,
  KnownDevice,
  KnownDeviceDraft,
  RouterFirewallRule,
  RouterFirewallRuleAction,
  RouterFirewallRuleDirection,
  RouterFirewallRuleDraft,
  RouterFirewallRuleProtocol,
  RouterFirewallRuleSourceView
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

export type RouterFirewallRuleImportResult = {
  rules: RouterFirewallRuleDraft[];
  rejectedRows: Array<{ row: number; reason: string }>;
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

export function createRouterFirewallRule(draft: RouterFirewallRuleDraft, now = new Date(), importedAt?: Date): RouterFirewallRule {
  const timestamp = now.toISOString();

  return {
    id: `router-firewall-rule-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    name: draft.name.trim() || `${draft.protocol.toUpperCase()} ${draft.ports.trim() || "alle Ports"}`,
    sourceView: draft.sourceView,
    direction: draft.direction,
    protocol: draft.protocol,
    ports: normalizePorts(draft.ports),
    source: draft.source.trim() || "any",
    destination: draft.destination.trim() || "any",
    action: draft.action,
    purpose: draft.purpose.trim(),
    owner: draft.owner.trim(),
    enabled: draft.enabled,
    lastReviewedAt: normalizeOptionalDateInput(draft.lastReviewedAt),
    createdAt: timestamp,
    updatedAt: timestamp,
    importedAt: importedAt?.toISOString()
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

export function importRouterFirewallRulesFromCsv(input: string): RouterFirewallRuleImportResult {
  const rows = parseDelimitedRows(input);
  const [header, ...dataRows] = rows;
  if (!header || header.length === 0) return { rules: [], rejectedRows: [] };

  const headerMap = new Map(header.map((name, index) => [normalizeHeader(name), index]));
  const rules: RouterFirewallRuleDraft[] = [];
  const rejectedRows: RouterFirewallRuleImportResult["rejectedRows"] = [];

  dataRows.forEach((row, index) => {
    if (row.every((cell) => cell.trim().length === 0)) return;
    const rowNumber = index + 2;
    const get = (...keys: string[]) => {
      const foundKey = keys.map(normalizeHeader).find((key) => headerMap.has(key));
      if (!foundKey) return "";
      return row[headerMap.get(foundKey) ?? -1]?.trim() ?? "";
    };
    const name = get("name", "regel", "rule");
    const protocol = parseProtocol(get("protocol", "protokoll"));
    const direction = parseDirection(get("direction", "richtung"));
    const action = parseAction(get("action", "aktion"));
    const sourceView = parseSourceView(get("sourceView", "sicht", "view"));
    const ports = get("ports", "port", "portfreigabe");

    if (!protocol || !direction || !action || !sourceView) {
      rejectedRows.push({ row: rowNumber, reason: "Protokoll, Richtung, Aktion oder Sicht ist unbekannt." });
      return;
    }

    rules.push({
      name,
      sourceView,
      direction,
      protocol,
      ports,
      source: get("source", "quelle"),
      destination: get("destination", "ziel"),
      action,
      purpose: get("purpose", "zweck", "begruendung", "begründung"),
      owner: get("owner", "verantwortlich", "zuständig", "zustaendig"),
      enabled: parseEnabled(get("enabled", "aktiv", "status")),
      lastReviewedAt: get("lastReviewedAt", "lastReview", "review", "letztePruefung", "letztePrüfung")
    });
  });

  return { rules, rejectedRows };
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

function normalizeOptionalDateInput(value?: string) {
  if (!value?.trim()) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
}

function normalizePorts(value: string) {
  return value.trim().replace(/\s+/g, "");
}

function parseDelimitedRows(input: string) {
  return input
    .trim()
    .split(/\r?\n/)
    .map((line) => parseDelimitedLine(line, line.includes(";") ? ";" : ","));
}

function parseDelimitedLine(line: string, delimiter: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === "\"" && quoted && next === "\"") {
      current += "\"";
      index += 1;
    } else if (char === "\"") {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  cells.push(current);
  return cells;
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[\s_-]/g, "");
}

function parseProtocol(value: string): RouterFirewallRuleProtocol | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === "tcp" || normalized === "udp" || normalized === "icmp" || normalized === "any") return normalized;
  if (normalized === "alle" || normalized === "all") return "any";
  return null;
}

function parseDirection(value: string): RouterFirewallRuleDirection | null {
  const normalized = normalizeHeader(value);
  if (normalized === "wantolan" || normalized === "externnachintern" || normalized === "incoming" || normalized === "inbound") return "wan_to_lan";
  if (normalized === "lantowan" || normalized === "internnachextern" || normalized === "outgoing" || normalized === "outbound") return "lan_to_wan";
  if (normalized === "lantolan" || normalized === "intern") return "lan_to_lan";
  if (normalized === "vpntolan" || normalized === "vpn") return "vpn_to_lan";
  return null;
}

function parseAction(value: string): RouterFirewallRuleAction | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === "allow" || normalized === "permit" || normalized === "erlauben" || normalized === "zulassen") return "allow";
  if (normalized === "deny" || normalized === "block" || normalized === "verweigern" || normalized === "blockieren") return "deny";
  return null;
}

function parseSourceView(value: string): RouterFirewallRuleSourceView | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === "external" || normalized === "extern" || normalized === "wan" || normalized === "internet") return "external";
  if (normalized === "internal" || normalized === "intern" || normalized === "lan") return "internal";
  return null;
}

function parseEnabled(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return true;
  return normalized === "true" || normalized === "yes" || normalized === "ja" || normalized === "aktiv" || normalized === "enabled" || normalized === "1";
}
