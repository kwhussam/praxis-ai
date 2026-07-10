import { apiRequest } from "@/lib/api/client";
import { supabase } from "@/lib/api/supabase";
import { AppConfig } from "@/lib/config/environment";
import { assertDemoPracticeAccess } from "@/lib/demo/demo-data";
import {
  type DashboardData,
  type EmailSecurityStatus,
  type MonitoringEvent,
  type MonitoringEventType,
  type MonitoringSeverity,
  type MonitoringSnapshot,
  type MonitoringTargets,
  type RiskHistoryState
} from "@/lib/monitoring/types";

type PracticeRef = {
  id: string;
  domain?: string;
  email?: string;
};

type RealtimeHandlers = {
  onEvent: (event: MonitoringEvent) => void;
  onSnapshot: (snapshot: MonitoringSnapshot) => void;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class MonitoringFetchError extends Error {
  constructor(message: string, public readonly context: { practiceId: string }) {
    super(message);
    this.name = "MonitoringFetchError";
  }
}

export async function loadMonitoringDashboard(practiceId: string): Promise<DashboardData> {
  assertDemoPracticeAccess(practiceId);

  if (!UUID_RE.test(practiceId)) {
    if (AppConfig.isDemoMode && practiceId.startsWith("demo-")) {
      return buildDemoDashboard(practiceId);
    }

    throw new MonitoringFetchError("Ungültige Practice-ID für Monitoring.", { practiceId });
  }

  if (practiceId.startsWith("demo-")) {
    return buildDemoDashboard(practiceId);
  }

  const [snapshotResult, historyResult, eventsResult] = await Promise.all([
    supabase
      .from("monitoring_snapshots")
      .select("*")
      .eq("practice_id", practiceId)
      .order("checked_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("monitoring_snapshots")
      .select("score, checked_at")
      .eq("practice_id", practiceId)
      .order("checked_at", { ascending: true })
      .limit(90),
    supabase
      .from("monitoring_events")
      .select("*")
      .eq("practice_id", practiceId)
      .order("created_at", { ascending: false })
      .limit(40)
  ]);

  if (snapshotResult.error) {
    throw new MonitoringFetchError(snapshotResult.error.message, { practiceId });
  }

  if (historyResult.error) {
    throw new MonitoringFetchError(historyResult.error.message, { practiceId });
  }

  if (eventsResult.error) {
    throw new MonitoringFetchError(eventsResult.error.message, { practiceId });
  }

  if (!snapshotResult.data) {
    return buildEmptyDashboard(practiceId);
  }

  return {
    snapshot: normalizeSnapshot(snapshotResult.data),
    events: (eventsResult.data ?? []).map(normalizeEvent),
    history: (historyResult.data ?? []).map((row) => ({
      day: formatHistoryDay(readString(row, "checked_at", new Date().toISOString())),
      score: readNumber(row, "score", 0)
    }))
  };
}

export function subscribeToMonitoringRealtime(practiceId: string, handlers: RealtimeHandlers) {
  assertDemoPracticeAccess(practiceId);

  if (!UUID_RE.test(practiceId)) {
    return () => undefined;
  }

  const channel = supabase
    .channel(`monitoring:${practiceId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "monitoring_events", filter: `practice_id=eq.${practiceId}` },
      (payload) => handlers.onEvent(normalizeEvent(payload.new))
    )
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "monitoring_snapshots", filter: `practice_id=eq.${practiceId}` },
      (payload) => handlers.onSnapshot(normalizeSnapshot(payload.new))
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}

export async function startManualMonitoringScan(practice: PracticeRef, targets?: MonitoringTargets) {
  assertDemoPracticeAccess(practice.id);

  return apiRequest<{ snapshot: MonitoringSnapshot; events: MonitoringEvent[] }>("/api/monitoring/run", {
    method: "POST",
    body: {
      practiceId: practice.id,
      domain: targets?.domains[0] ?? practice.domain,
      email: targets?.leakConsentAccepted ? targets.emails[0] ?? practice.email : undefined,
      domains: targets?.domains,
      subdomains: targets?.subdomains,
      emails: targets?.leakConsentAccepted ? targets.emails : undefined,
      leakConsentAccepted: targets?.leakConsentAccepted === true
    }
  });
}

export function buildEmptyDashboard(practiceId: string): DashboardData {
  const checkedAt = new Date().toISOString();

  return {
    snapshot: {
      id: "empty-snapshot",
      practice_id: practiceId,
      source: "scheduled",
      score: 0,
      category_scores: {},
      ssl: {
        valid: false,
        expires_at: null,
        days_remaining: null
      },
      email_security: {
        spf: false,
        dkim: false,
        dmarc: false
      },
      devices: {
        known: 0,
        unknown: 0
      },
      checks: {},
      checked_at: checkedAt
    },
    events: [],
    history: []
  };
}

export function buildDemoDashboard(practiceId: string): DashboardData {
  assertDemoPracticeAccess(practiceId);

  const now = new Date();
  const history = Array.from({ length: 13 }, (_, index) => {
    const date = new Date(now);
    date.setDate(now.getDate() - (12 - index) * 7);
    return {
      day: formatHistoryDay(date.toISOString()),
      score: [58, 61, 63, 62, 66, 68, 70, 73, 72, 75, 77, 79, 82][index]
    };
  });

  const snapshot: MonitoringSnapshot = {
    id: "demo-snapshot",
    practice_id: practiceId,
    source: "demo",
    score: 82,
    category_scores: {
      ssl: 88,
      dns: 74,
      email: 68,
      ports: 92,
      reputation: 96,
      leaks: 81
    },
    ssl: {
      valid: true,
      expires_at: addDays(now, 23).toISOString(),
      days_remaining: 23,
      issuer: "Let's Encrypt",
      grade: "A"
    },
    email_security: {
      spf: true,
      dkim: true,
      dmarc: false
    },
    devices: {
      known: 18,
      unknown: 3
    },
    checks: {},
    checked_at: now.toISOString()
  };

  const events: MonitoringEvent[] = [
    {
      id: "demo-event-1",
      practice_id: practiceId,
      type: "dmarc_missing",
      severity: "critical",
      title: "DMARC-Eintrag wurde entfernt",
      message: "Die Domain kann leichter für gefälschte Praxis-Mails missbraucht werden.",
      details: {},
      resolved_at: null,
      created_at: addMinutes(now, -14).toISOString()
    },
    {
      id: "demo-event-2",
      practice_id: practiceId,
      type: "ssl_expiry",
      severity: "warning",
      title: "SSL-Zertifikat läuft bald ab",
      message: "Noch 23 Tage bis zum Ablauf. Erneuerung beim IT-Partner vormerken.",
      details: { days_remaining: 23 },
      resolved_at: null,
      created_at: addHours(now, -4).toISOString()
    },
    {
      id: "demo-event-3",
      practice_id: practiceId,
      type: "monitoring_run",
      severity: "info",
      title: "Monitoring-Lauf abgeschlossen",
      message: "DNS, SSL, E-Mail-Security, Ports, Leaks und Reputation wurden geprüft.",
      details: {},
      resolved_at: null,
      created_at: addHours(now, -8).toISOString()
    }
  ];

  return { snapshot, events, history };
}

function normalizeSnapshot(row: unknown): MonitoringSnapshot {
  return {
    id: readString(row, "id", "snapshot"),
    practice_id: readString(row, "practice_id", ""),
    source: readSource(row),
    score: readNumber(row, "score", 0),
    category_scores: readNumberMap(row, "category_scores"),
    ssl: readSsl(row),
    email_security: readEmailSecurity(row),
    devices: readDevices(row),
    checks: readRecord(row, "checks"),
    checked_at: readString(row, "checked_at", new Date().toISOString())
  };
}

function normalizeEvent(row: unknown): MonitoringEvent {
  const type = readEventType(row);

  return {
    id: readString(row, "id", `${type}-${Date.now()}`),
    practice_id: readString(row, "practice_id", ""),
    type,
    severity: readSeverity(row),
    title: readString(row, "title", titleForType(type)),
    message: readString(row, "message", ""),
    details: readRecord(row, "details"),
    risk_state: readRiskState(readRecord(row, "details")),
    resolved_at: readNullableString(row, "resolved_at"),
    created_at: readString(row, "created_at", new Date().toISOString())
  };
}

function readSsl(row: unknown): MonitoringSnapshot["ssl"] {
  const ssl = readRecord(row, "ssl");

  return {
    valid: readBoolean(ssl, "valid", false),
    expires_at: readNullableString(ssl, "expires_at"),
    days_remaining: readNullableNumber(ssl, "days_remaining"),
    issuer: readString(ssl, "issuer", undefined),
    grade: readString(ssl, "grade", undefined)
  };
}

function readEmailSecurity(row: unknown): EmailSecurityStatus {
  const email = readRecord(row, "email_security");

  return {
    spf: readBoolean(email, "spf", false),
    dkim: readBoolean(email, "dkim", false),
    dmarc: readBoolean(email, "dmarc", false)
  };
}

function readDevices(row: unknown): MonitoringSnapshot["devices"] {
  const devices = readRecord(row, "devices");

  return {
    known: readNumber(devices, "known", 0),
    unknown: readNumber(devices, "unknown", 0)
  };
}

function readEventType(row: unknown): MonitoringEventType {
  const type = readString(row, "type", "monitoring_run");

  if (
    type === "ssl_expiry" ||
    type === "dmarc_missing" ||
    type === "leak_detected" ||
    type === "port_open" ||
    type === "domain_blacklisted" ||
    type === "dns_changed" ||
    type === "monitoring_run"
  ) {
    return type;
  }

  return "monitoring_run";
}

function readSeverity(row: unknown): MonitoringSeverity {
  const severity = readString(row, "severity", "info");
  if (severity === "critical" || severity === "warning" || severity === "info") return severity;
  return "info";
}

function readRiskState(details: Record<string, unknown>): RiskHistoryState | undefined {
  const state = details.risk_state;
  if (state === "new" || state === "recurring" || state === "resolved" || state === "unchanged") return state;
  return undefined;
}

function readSource(row: unknown): MonitoringSnapshot["source"] {
  const source = readString(row, "source", "scheduled");
  if (source === "scheduled" || source === "manual" || source === "demo") return source;
  return "scheduled";
}

function titleForType(type: MonitoringEventType) {
  switch (type) {
    case "ssl_expiry":
      return "SSL-Zertifikat läuft bald ab";
    case "dmarc_missing":
      return "DMARC-Eintrag fehlt";
    case "leak_detected":
      return "Datenleck erkannt";
    case "port_open":
      return "Kritischer Port offen";
    case "domain_blacklisted":
      return "Domain auf Blacklist";
    case "dns_changed":
      return "DNS-Änderung erkannt";
    case "monitoring_run":
      return "Monitoring-Lauf abgeschlossen";
  }
}

function readRecord(row: unknown, key: string): Record<string, unknown> {
  const value = getValue(row, key);
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function readNumberMap(row: unknown, key: string) {
  const record = readRecord(row, key);

  return Object.fromEntries(
    Object.entries(record).map(([entryKey, value]) => [entryKey, typeof value === "number" ? value : Number(value) || 0])
  );
}

function readString(row: unknown, key: string, fallback: string): string;
function readString(row: unknown, key: string, fallback: undefined): string | undefined;
function readString(row: unknown, key: string, fallback: string | undefined) {
  const value = getValue(row, key);
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function readNullableString(row: unknown, key: string) {
  const value = getValue(row, key);
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readNumber(row: unknown, key: string, fallback: number) {
  const value = getValue(row, key);
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readNullableNumber(row: unknown, key: string) {
  const value = getValue(row, key);
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readBoolean(row: unknown, key: string, fallback: boolean) {
  const value = getValue(row, key);
  return typeof value === "boolean" ? value : fallback;
}

function getValue(row: unknown, key: string) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return undefined;
  return (row as Record<string, unknown>)[key];
}

function formatHistoryDay(value: string) {
  return new Date(value).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(date.getDate() + days);
  return next;
}

function addHours(date: Date, hours: number) {
  const next = new Date(date);
  next.setHours(date.getHours() + hours);
  return next;
}

function addMinutes(date: Date, minutes: number) {
  const next = new Date(date);
  next.setMinutes(date.getMinutes() + minutes);
  return next;
}
