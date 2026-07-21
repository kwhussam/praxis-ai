import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import type { ExecutionContext, ScheduledController } from "@cloudflare/workers-types";

import { calculateScore, SCORING_VERSION as SECURITY_SCORING_VERSION } from "@/lib/security/scoring";
import { questionnaireAnswersToCheckData, type QuestionnaireAnswerValue } from "@/lib/security/questionnaire";
import { addDays, type DeletionReport } from "./privacy";

type Env = {
  ANTHROPIC_API_KEY: string;
  ANTHROPIC_MODEL?: string;
  APP_ENV?: string;
  DATA_ENCRYPTION_KEY?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SECURITYTRAILS_API_KEY?: string;
  SHODAN_API_KEY?: string;
  HIBP_API_KEY?: string;
  MXTOOLBOX_API_KEY?: string;
  VIRUSTOTAL_API_KEY?: string;
  RESEND_API_KEY?: string;
  DELETION_FROM_EMAIL?: string;
  SECURITY_PROVIDER_TIMEOUT_MS?: string;
  MONITORING_CONCURRENCY_LIMIT?: string;
};

type FindingSeverity = "critical" | "warning" | "info";
type ProviderName = "shodan" | "hibp" | "virusTotal" | "securityTrails" | "sslLabs" | "cloudflareDns";
type ProviderStatus = "active" | "not_configured" | "unavailable";
type ProviderExecutionContext = {
  statuses: Partial<Record<ProviderName, ProviderStatus>>;
  timeoutMs: number;
};

type SecurityFinding = {
  id: string;
  severity: FindingSeverity;
  title: string;
};

type ExternalCheckRequest = {
  practiceId?: string;
  domain: string;
  email?: string;
  consent?: boolean;
};

type MonitoringRunRequest = {
  practiceId?: string;
  domain?: string;
  email?: string;
  domains?: string[];
  subdomains?: string[];
  emails?: string[];
  leakConsentAccepted?: boolean;
};

type QuestionnaireRequest = {
  practiceId?: string;
  questionnaire?: Record<string, QuestionnaireAnswerValue>;
};

type ReportRequest = CheckData & {
  practiceId?: string;
  checkId?: string;
};

type PdfReportRequest = {
  practiceId?: string;
  report?: Report;
  practiceName?: string;
  domain?: string;
};

type AlertAcknowledgeRequest = {
  practiceId?: string;
  alertId?: string;
};

type PrivacyDeleteRequest = {
  practiceId?: string;
};

type DashboardHistoryPoint = {
  id: string;
  source: "security_check" | "monitoring_snapshot";
  type: string;
  score: number;
  checkedAt: string;
};

type ConsentRequest = {
  practiceId?: string;
  type?: "avv" | "privacy_policy" | "wlan_scan" | "ai_processing";
  version?: string;
  accepted?: boolean;
  consentTypes?: Array<"avv" | "privacy_policy" | "wlan_scan" | "ai_processing">;
};

type MonitoringModule = "ssl_check" | "dns_check" | "port_scan" | "leak_check" | "reputation_check";

type PracticeMonitorTarget = {
  id: string;
  domain: string;
  email?: string;
};

type SSLCheck = {
  valid: boolean;
  issuer: string;
  expires_at: string | null;
  days_remaining: number | null;
  protocol: string;
  grade: "A+" | "A" | "B" | "C" | "F";
  hsts_enabled: boolean;
  vulnerabilities: string[];
};

type DNSCheck = {
  a_records: string[];
  aaaa_records: string[];
  cname_records: string[];
  ns_records: string[];
  txt_records: string[];
  caa_records: string[];
};

type EmailSecurityCheck = {
  spf: {
    exists: boolean;
    valid: boolean;
    record: string;
    issues: string[];
    alignment: "pass" | "warning" | "fail";
    alignment_mode: "strict" | "relaxed" | null;
  };
  dkim: {
    exists: boolean;
    selector_found: string | null;
    valid: boolean;
    alignment: "pass" | "warning" | "fail";
    alignment_mode: "strict" | "relaxed" | null;
  };
  dmarc: {
    exists: boolean;
    policy: "none" | "quarantine" | "reject" | null;
    rua: string | null;
    spf_alignment_mode: "strict" | "relaxed" | null;
    dkim_alignment_mode: "strict" | "relaxed" | null;
    alignment_ready: boolean;
    recommendation: string;
  };
  mta_sts: {
    exists: boolean;
    mode: "enforce" | "testing" | "none" | null;
    record: string;
  };
  tls_rpt: {
    exists: boolean;
    rua: string | null;
    record: string;
  };
  caa: {
    exists: boolean;
    records: string[];
  };
  mx_records: {
    exists: boolean;
    records: string[];
    secure: boolean;
  };
};

type OpenPort = {
  port: number;
  protocol: string;
  service: string;
  severity: FindingSeverity;
  banner?: string;
};

type ShodanVuln = {
  id: string;
  cvss: number | null;
  summary: string;
  port?: number;
};

type PortCheck = {
  open_ports: OpenPort[];
  known_vulnerabilities: ShodanVuln[];
};

type LeakCheck = {
  email_found: boolean;
  breach_count: number;
  breaches: {
    name: string;
    date: string;
    data_types: string[];
  }[];
  domain_found: boolean;
  paste_count: number;
};

type DNSHistoryEntry = {
  type: string;
  value: string;
  first_seen?: string;
  last_seen?: string;
};

type ReputationCheck = {
  blacklisted: boolean;
  blacklists: string[];
  malware_hosting: boolean;
  phishing_reports: number;
  dns_history: DNSHistoryEntry[];
};

type SubdomainSecurityCheck = {
  domain: string;
  source: "securitytrails" | "cloudflare_dns_common";
  checks: {
    dns: DNSCheck;
    ssl: SSLCheck;
  };
  score: number;
  findings: SecurityFinding[];
};

type SubdomainDiscoveryCheck = {
  status: "checked" | "partial" | "not_checked";
  source: "securitytrails" | "cloudflare_dns_common" | "none";
  discovered: string[];
  evaluated: SubdomainSecurityCheck[];
  not_checked_reason?: string;
};

type ExternalCheckResult = {
  domain: string;
  timestamp: string;
  checks: {
    ssl: SSLCheck;
    dns: DNSCheck;
    email_security: EmailSecurityCheck;
    ports: PortCheck;
    reputation: ReputationCheck;
    leaks: LeakCheck;
    subdomains: SubdomainDiscoveryCheck;
  };
  overall_score: number;
  critical_count: number;
  warning_count: number;
  findings: SecurityFinding[];
  checkedAt: string;
  scoreImpact: number;
  providers: Record<string, boolean>;
  provider_statuses: Record<ProviderName, ProviderStatus>;
};

type RiskHistoryState = "new" | "recurring" | "resolved" | "unchanged";

type MonitoringComparisonSummary = {
  critical_ports: number[];
  dns_fingerprint: string;
  dmarc_policy: EmailSecurityCheck["dmarc"]["policy"];
  dmarc_exists: boolean;
  cert_fingerprint: string;
  ssl_expires_at: string | null;
  ssl_issuer: string;
  findings: string[];
};

type MonitoringComparison = {
  previous: MonitoringComparisonSummary | null;
  current: MonitoringComparisonSummary;
  states: Record<string, RiskHistoryState>;
  resolved_findings: string[];
  dns_changed: boolean;
  dmarc_worsened: boolean;
  certificate_changed: boolean;
  new_ports: number[];
  recurring_ports: number[];
};

type CheckData = {
  practiceId?: string;
  practiceName?: string;
  domain?: string;
  questionnaire?: Record<string, QuestionnaireAnswerValue>;
  wlan?: unknown;
  external?: unknown;
  score?: number;
};

type Report = {
  executive_summary: string;
  overall_risk: "critical" | "high" | "medium" | "low";
  security_score: number;
  ampel: "rot" | "gelb" | "grün";
  top_risks: Array<{
    rank: number;
    title: string;
    plain_language: string;
    business_impact: string;
    action: string;
    effort_hours: string;
    cost_estimate: string;
    priority: "sofort" | "diese_woche" | "diesen_monat";
    evidence_source: "measured" | "inferred" | "self_reported" | "not_checked" | "unavailable";
    reliability: "high" | "medium" | "low";
  }>;
  scores_by_category: {
    access_control: number;
    backup: number;
    email_security: number;
    network: number;
    dsgvo: number;
    updates: number;
  };
  dsgvo_compliance: {
    status: "nicht_konform" | "teilweise" | "konform";
    missing_documents: string[];
    liability_risk: string;
  };
  quick_wins: Array<{
    action: string;
    time_minutes: number;
    impact: string;
  }>;
  not_checked_limitations: Array<{
    area: string;
    reason: string;
    impact: string;
  }>;
  monthly_monitoring_recommendation: boolean;
};

type DnsAnswer = {
  name: string;
  type: number;
  TTL: number;
  data: string;
};

type DnsResponse = {
  Status: number;
  Answer?: DnsAnswer[];
};

type AuthUser = {
  id: string;
  email?: string;
};

type PracticeRecord = {
  id: string;
  owner_id: string;
  name: string;
  domain?: string;
  email?: string;
  plan: "free" | "audit" | "monitoring" | "compliance";
  white_label_partner_id?: string | null;
};

type PracticeAccess = {
  user: AuthUser;
  practice: PracticeRecord;
  role: "owner" | "manager" | "viewer" | "white_label";
};

const REPORT_FORMAT_VERSION = "1.0.0";
const SCORING_VERSION = SECURITY_SCORING_VERSION;
const FREE_PLAN_DAILY_AI_REPORT_LIMIT = 3;
const DEFAULT_MONITORING_CONCURRENCY_LIMIT = 5;

export const OUTBOUND_TIMEOUT_MS = {
  anthropic: 15_000,
  securityProvider: 5_000,
  supabase: 8_000,
  resend: 8_000
} as const;

export class OutboundRequestTimeoutError extends Error {
  readonly service: string;
  readonly status = 504;
  readonly timeoutMs: number;

  constructor(service: string, timeoutMs: number) {
    super(`${service} request timed out`);
    this.name = "OutboundRequestTimeoutError";
    this.service = service;
    this.timeoutMs = timeoutMs;
  }
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: { service?: string; timeoutMs?: number } = {}
) {
  const service = options.service ?? "upstream";
  const timeoutMs = options.timeoutMs ?? OUTBOUND_TIMEOUT_MS.supabase;
  const timeoutSignal = AbortSignal.timeout(timeoutMs);

  try {
    return await fetch(input, { ...init, signal: timeoutSignal });
  } catch (error) {
    if (timeoutSignal.aborted) {
      const timeoutError = new OutboundRequestTimeoutError(service, timeoutMs);
      console.error("outbound_timeout", {
        service,
        failure: safeErrorLog(timeoutError)
      });
      throw timeoutError;
    }
    throw error;
  }
}

export async function mapInBatches<T, R>(
  items: readonly T[],
  batchSize: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const safeBatchSize = Math.max(1, Math.floor(batchSize));
  const results: R[] = [];

  for (let offset = 0; offset < items.length; offset += safeBatchSize) {
    const batch = items.slice(offset, offset + safeBatchSize);
    const batchResults = await Promise.all(
      batch.map((item, index) => mapper(item, offset + index))
    );
    results.push(...batchResults);
  }

  return results;
}

const DNS_TYPE_CODES: Record<string, number> = {
  A: 1,
  NS: 2,
  CNAME: 5,
  MX: 15,
  TXT: 16,
  AAAA: 28,
  CAA: 257
};

const app = new Hono<{ Bindings: Env }>();

app.onError((error, c) => {
  if (error instanceof OutboundRequestTimeoutError) {
    return c.json({ error: "upstream_timeout", service: error.service }, 504);
  }

  console.error("unhandled_worker_error", { failure: safeErrorLog(error) });
  return c.json({ error: "internal_server_error" }, 500);
});

const MONITORING_SCHEDULE: Record<MonitoringModule, string> = {
  ssl_check: "0 */6 * * *",
  dns_check: "0 */4 * * *",
  port_scan: "0 */12 * * *",
  leak_check: "0 2 * * *",
  reputation_check: "0 3 * * *"
};

const CRON_MODULES = new Map<string, MonitoringModule[]>(
  Object.entries(MONITORING_SCHEDULE).map(([module, cron]) => [cron, [module as MonitoringModule]])
);

app.use("*", cors({ origin: "*", allowMethods: ["GET", "POST", "OPTIONS"] }));

app.get("/health", (c) =>
  c.json({
    ok: true,
    service: "praxisshield-edge",
    checkedAt: new Date().toISOString()
  })
);

app.post("/api/check/external", async (c) => handleExternalCheck(c, { requirePractice: true, persist: true }));
app.post("/api/check/questionnaire", async (c) => handleQuestionnaireCheck(c));
app.get("/api/dashboard", async (c) => handleDashboard(c));
app.post("/api/report/generate", async (c) => handleReportGenerate(c, { requirePractice: true, persist: true }));
app.post("/api/report/pdf", async (c) => handleReportPdf(c));
app.get("/api/reports", async (c) => handleReportsList(c));
app.get("/api/reports/:id", async (c) => handleReportDetail(c));
app.get("/api/monitoring/status", async (c) => handleMonitoringStatus(c));
app.post("/api/monitoring/run", async (c) => handleMonitoringRun(c));
app.get("/api/monitoring/history", async (c) => handleMonitoringHistory(c));
app.post("/api/alert/acknowledge", async (c) => handleAlertAcknowledge(c));
app.post("/api/privacy/delete", async (c) => handlePrivacyDelete(c));
app.get("/api/privacy/export", async (c) => handlePrivacyExport(c));
app.post("/api/legal/avv/accept", async (c) => handleAvvAccept(c));
app.post("/api/legal/consent", async (c) => handleConsent(c));

const SYSTEM_PROMPT = `
Du bist ein Cybersecurity-Experte für Arztpraxen in Deutschland.
Du analysierst Sicherheitsdaten und erstellst verständliche Berichte für Ärzte ohne IT-Kenntnisse.

TONALITÄT:
- Klar, direkt, ohne Fachjargon
- Ernst aber nicht alarmistisch
- Lösungsorientiert - immer konkrete nächste Schritte
- Sensibel für den Praxiskontext (Patientendaten, DSGVO, Haftung)

AUSGABEFORMAT: Antworte ausschließlich als valides JSON gemäß ReportSchema. Keine Markdown-Blöcke, keine Erklärtexte.

NICHT-GEPRÜFT-REGEL:
- Formuliere nicht geprüfte, technisch nicht verfügbare oder nicht konfigurierte Bereiche niemals als sicher, bestanden, unauffällig, risikofrei oder wirksam geschützt.
- Wenn eine Prüfung fehlt, darfst du nur die eingeschränkte Aussagekraft und den nächsten Prüfauftrag beschreiben.
- Top-Risiken müssen die Evidenzquelle und die geschätzte Zuverlässigkeit transparent ausweisen.
`;

const REPORT_SCHEMA_HINT = `{
  "executive_summary": "2-3 Sätze für den Praxisinhaber",
  "overall_risk": "critical|high|medium|low",
  "security_score": 0,
  "ampel": "rot|gelb|grün",
  "top_risks": [
    {
      "rank": 1,
      "title": "Titel des Risikos",
      "plain_language": "Erklärung ohne Fachbegriffe",
      "business_impact": "Was passiert wenn unbehoben",
      "action": "Konkrete Maßnahme",
      "effort_hours": "Zeitaufwand",
      "cost_estimate": "Kostenrahmen",
      "priority": "sofort|diese_woche|diesen_monat",
      "evidence_source": "measured|inferred|self_reported|not_checked|unavailable",
      "reliability": "high|medium|low"
    }
  ],
  "scores_by_category": {
    "access_control": 0,
    "backup": 0,
    "email_security": 0,
    "network": 0,
    "dsgvo": 0,
    "updates": 0
  },
  "dsgvo_compliance": {
    "status": "nicht_konform|teilweise|konform",
    "missing_documents": [],
    "liability_risk": "Haftungseinschätzung"
  },
  "quick_wins": [
    {
      "action": "Sofortmaßnahme",
      "time_minutes": 30,
      "impact": "Wirkung der Maßnahme"
    }
  ],
  "not_checked_limitations": [
    {
      "area": "Betroffener Prüfbereich",
      "reason": "Warum nicht oder nur eingeschränkt geprüft",
      "impact": "Konkrete Auswirkung auf die Aussagekraft"
    }
  ],
  "monthly_monitoring_recommendation": true
}`;

function buildReportPrompt(data: CheckData) {
  const limitations = buildReportLimitations(data);

  return `
Analysiere folgende Sicherheitsdaten einer Arztpraxis und erstelle einen strukturierten Bericht.

Praxis: ${data.practiceName ?? "Unbekannte Praxis"}
Domain: ${data.domain ?? "nicht angegeben"}
Vorberechneter Score: ${typeof data.score === "number" ? data.score : "nicht angegeben"}

FRAGEBOGEN-ANTWORTEN:
${JSON.stringify(data.questionnaire ?? {}, null, 2)}

WLAN-SCAN-ERGEBNISSE:
${JSON.stringify(data.wlan ?? null, null, 2)}

EXTERNER CHECK:
${JSON.stringify(data.external ?? null, null, 2)}

NICHT GEPRÜFT / TECHNISCHE EINSCHRÄNKUNGEN:
${JSON.stringify(limitations, null, 2)}

Erstelle einen Bericht gemäß diesem Schema:
${REPORT_SCHEMA_HINT}

Bewertungsregeln:
- top_risks: maximal 5 Einträge, nach Dringlichkeit sortiert.
- Jedes Top-Risiko muss evidence_source und reliability enthalten.
- not_checked_limitations muss alle oben genannten Einschränkungen übernehmen oder fachlich präziser zusammenfassen.
- Wenn not_checked_limitations nicht leer ist, muss die executive_summary die begrenzte Aussagekraft erwähnen.
- Nicht geprüfte oder technisch nicht verfügbare Bereiche dürfen nicht als Schutzwirkung, bestandene Kontrolle oder Entwarnung formuliert werden.
- Ein Top-Risiko mit evidence_source "not_checked" oder "unavailable" muss klar als fehlender Nachweis, fehlende Prüfung oder technische Einschränkung benannt sein.
- quick_wins: 2 bis 4 konkrete Maßnahmen mit geringem Aufwand.
- security_score und scores_by_category immer zwischen 0 und 100.
- Ampel: rot bei critical/high, gelb bei medium, grün bei low.
- Nenne keine erfundenen Produktpreise; nutze grobe Kostenrahmen wie "0-100 EUR" oder "IT-Dienstleister, 1-2 Stunden".
`;
}

function buildReportLimitations(data: CheckData) {
  const limitations: Report["not_checked_limitations"] = [];
  const questionnaire = data.questionnaire ?? {};
  const wlan = asRecordOrNull(data.wlan);
  const external = asRecordOrNull(data.external);

  if (Object.keys(questionnaire).length === 0) {
    limitations.push({
      area: "Fragebogen/Nachweise",
      reason: "Es liegen keine Selbstauskünfte oder Nachweisantworten vor.",
      impact: "Organisatorische Kontrollen wie MFA, Backup, Patchmanagement und DSGVO-Dokumentation können nicht als umgesetzt bewertet werden."
    });
  }

  if (!wlan) {
    limitations.push({
      area: "Lokales Netzwerk/WLAN",
      reason: "Es wurden keine lokalen WLAN- oder Netzwerkscan-Ergebnisse übergeben.",
      impact: "Aussagen zu sichtbaren Geräten, Access Points, Segmentierung und lokalen offenen Ports sind nur eingeschränkt oder gar nicht möglich."
    });
  } else {
    const methodology = asRecordOrNull(wlan.methodology) ?? {};
    const platformLimitations = Array.isArray(methodology.platformLimitations) ? methodology.platformLimitations : [];
    for (const limitation of platformLimitations) {
      if (typeof limitation !== "string" || limitation.trim().length === 0) continue;
      limitations.push({
        area: "Lokales Netzwerk/WLAN",
        reason: limitation.trim(),
        impact: "Die technische Messung ist plattformbedingt begrenzt und darf nicht als vollständige Entwarnung interpretiert werden."
      });
    }
  }

  if (!external) {
    limitations.push({
      area: "Externe Domain-, Mail- und Leak-Prüfungen",
      reason: "Es wurden keine externen Prüfergebnisse übergeben.",
      impact: "Aussagen zu SPF/DKIM/DMARC, Subdomains, Leaks, Zertifikaten, Reputation und extern erreichbaren Diensten sind nicht belastbar."
    });
  } else {
    const providerStatuses = asRecordOrNull(external.provider_statuses) ?? {};
    for (const [provider, status] of Object.entries(providerStatuses)) {
      if (status === "active") continue;
      limitations.push({
        area: `Externer Provider ${provider}`,
        reason: status === "not_configured" ? "API-Key oder Provider-Konfiguration fehlt." : "Provider war technisch nicht verfügbar.",
        impact: "Fehlende Providerdaten dürfen nicht als fehlendes Risiko gewertet werden; der betroffene externe Prüfumfang ist reduziert."
      });
    }

    const findings = Array.isArray(external.findings) ? external.findings : [];
    for (const finding of findings) {
      const findingRecord = asRecordOrNull(finding);
      if (!findingRecord || typeof findingRecord.id !== "string") continue;
      if (!findingRecord.id.startsWith("not-checked-") && !findingRecord.id.startsWith("unavailable-")) continue;
      limitations.push({
        area: typeof findingRecord.title === "string" ? findingRecord.title : "Externe Prüfung",
        reason: findingRecord.id.startsWith("not-checked-") ? "Prüfung wurde nicht ausgeführt." : "Prüfung war technisch nicht verfügbar.",
        impact: "Der Bereich darf im KI-Bericht nicht als sicher oder unauffällig dargestellt werden."
      });
    }
  }

  return dedupeLimitations(limitations);
}

function dedupeLimitations(limitations: Report["not_checked_limitations"]) {
  const seen = new Set<string>();
  return limitations.filter((limitation) => {
    const key = `${limitation.area}|${limitation.reason}|${limitation.impact}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function parseAnthropicJson(value: unknown): unknown {
  const content = asRecord(value).content;
  if (!Array.isArray(content)) throw new Error("Anthropic response has no content array");

  const text = content
    .map((block) => {
      const item = asRecord(block);
      return typeof item.text === "string" ? item.text : "";
    })
    .join("\n")
    .trim();

  if (!text) throw new Error("Anthropic response text is empty");

  const jsonText = extractJsonObject(text);
  return JSON.parse(jsonText) as unknown;
}

function extractJsonObject(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");

  if (start < 0 || end <= start) throw new Error("No JSON object found in Claude response");
  return candidate.slice(start, end + 1);
}

function validateReport(value: unknown): Report {
  const report = asRecord(value);
  const scores = requireRecord(report.scores_by_category, "scores_by_category");
  const dsgvo = requireRecord(report.dsgvo_compliance, "dsgvo_compliance");

  return {
    executive_summary: requireString(report.executive_summary, "executive_summary"),
    overall_risk: requireEnum(report.overall_risk, ["critical", "high", "medium", "low"], "overall_risk"),
    security_score: clampScore(requireNumber(report.security_score, "security_score")),
    ampel: requireEnum(report.ampel, ["rot", "gelb", "grün"], "ampel"),
    top_risks: requireArray(report.top_risks, "top_risks").slice(0, 5).map(validateTopRisk),
    scores_by_category: {
      access_control: clampScore(requireNumber(scores.access_control, "scores_by_category.access_control")),
      backup: clampScore(requireNumber(scores.backup, "scores_by_category.backup")),
      email_security: clampScore(requireNumber(scores.email_security, "scores_by_category.email_security")),
      network: clampScore(requireNumber(scores.network, "scores_by_category.network")),
      dsgvo: clampScore(requireNumber(scores.dsgvo, "scores_by_category.dsgvo")),
      updates: clampScore(requireNumber(scores.updates, "scores_by_category.updates"))
    },
    dsgvo_compliance: {
      status: requireEnum(dsgvo.status, ["nicht_konform", "teilweise", "konform"], "dsgvo_compliance.status"),
      missing_documents: requireArray(dsgvo.missing_documents, "dsgvo_compliance.missing_documents").map((item, index) =>
        requireString(item, `dsgvo_compliance.missing_documents.${index}`)
      ),
      liability_risk: requireString(dsgvo.liability_risk, "dsgvo_compliance.liability_risk")
    },
    quick_wins: requireArray(report.quick_wins, "quick_wins").map(validateQuickWin),
    not_checked_limitations: requireArray(report.not_checked_limitations, "not_checked_limitations").map(
      validateReportLimitation
    ),
    monthly_monitoring_recommendation: requireBoolean(
      report.monthly_monitoring_recommendation,
      "monthly_monitoring_recommendation"
    )
  };
}

function validateTopRisk(value: unknown, index: number): Report["top_risks"][number] {
  const risk = requireRecord(value, `top_risks.${index}`);

  return {
    rank: Math.max(1, Math.round(requireNumber(risk.rank, `top_risks.${index}.rank`))),
    title: requireString(risk.title, `top_risks.${index}.title`),
    plain_language: requireString(risk.plain_language, `top_risks.${index}.plain_language`),
    business_impact: requireString(risk.business_impact, `top_risks.${index}.business_impact`),
    action: requireString(risk.action, `top_risks.${index}.action`),
    effort_hours: requireString(risk.effort_hours, `top_risks.${index}.effort_hours`),
    cost_estimate: requireString(risk.cost_estimate, `top_risks.${index}.cost_estimate`),
    priority: requireEnum(risk.priority, ["sofort", "diese_woche", "diesen_monat"], `top_risks.${index}.priority`),
    evidence_source: requireEnum(
      risk.evidence_source,
      ["measured", "inferred", "self_reported", "not_checked", "unavailable"],
      `top_risks.${index}.evidence_source`
    ),
    reliability: requireEnum(risk.reliability, ["high", "medium", "low"], `top_risks.${index}.reliability`)
  };
}

function validateReportLimitation(value: unknown, index: number): Report["not_checked_limitations"][number] {
  const limitation = requireRecord(value, `not_checked_limitations.${index}`);

  return {
    area: requireString(limitation.area, `not_checked_limitations.${index}.area`),
    reason: requireString(limitation.reason, `not_checked_limitations.${index}.reason`),
    impact: requireString(limitation.impact, `not_checked_limitations.${index}.impact`)
  };
}

function validateQuickWin(value: unknown, index: number): Report["quick_wins"][number] {
  const quickWin = requireRecord(value, `quick_wins.${index}`);

  return {
    action: requireString(quickWin.action, `quick_wins.${index}.action`),
    time_minutes: Math.max(5, Math.round(requireNumber(quickWin.time_minutes, `quick_wins.${index}.time_minutes`))),
    impact: requireString(quickWin.impact, `quick_wins.${index}.impact`)
  };
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  try {
    return asRecord(value);
  } catch {
    throw new Error(`${field} is missing or not an object`);
  }
}

function requireArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${field} is missing or not an array`);
  return value;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${field} is missing or empty`);
  return value.trim();
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${field} is not a valid number`);
  return value;
}

function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${field} is not a boolean`);
  return value;
}

function requireEnum<const T extends readonly string[]>(value: unknown, values: T, field: string): T[number] {
  if (typeof value !== "string" || !values.includes(value as T[number])) {
    throw new Error(`${field} has an unsupported value`);
  }
  return value as T[number];
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Expected object");
  }
  return value as Record<string, unknown>;
}

function asRecordOrNull(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function handleExternalCheck(
  c: Context<{ Bindings: Env }>,
  options: { requirePractice: boolean; persist: boolean }
) {
  let payload: ExternalCheckRequest;

  try {
    payload = await c.req.json<ExternalCheckRequest>();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  if (options.requirePractice && payload.consent !== true) {
    return c.json({ error: "consent_required", message: "Vor externen Checks ist eine Einwilligung erforderlich." }, 400);
  }

  const access = options.requirePractice || payload.practiceId
    ? await requirePracticeAccess(c, payload.practiceId, "external_check", "manager")
    : null;
  if (access instanceof Response) return access;

  const domain = normalizeDomain(payload.domain || access?.practice.domain);

  if (!domain) {
    return c.json({ error: "domain is required" }, 400);
  }

  if (access) {
    const allowed = await consumeExternalQuotaOrErrorResponse(c, access, "external_check");
    if (allowed instanceof Response) return allowed;
    if (!allowed) {
      await auditPracticeAccess(c, access, "quota_denied", "external_check", { plan: access.practice.plan });
      return c.json({ error: "daily_limit_reached", limit: 3, plan: "free" }, 429);
    }
  }

  const email = normalizeEmail(payload.email ?? access?.practice.email);
  const result = await performExternalCheck(domain, email, c.env);

  if (access && options.persist) {
    const checkId = await persistSecurityCheck(c.env, access.practice.id, "external", result.overall_score, {
      summary: redactedExternalSummary(result),
      encryptedPayload: result
    });
    await auditPracticeAccess(c, access, "create", "security_checks", { check_id: checkId, type: "external" });
    return c.json({ ...result, checkId });
  }

  return c.json(result);
}

async function handleQuestionnaireCheck(c: Context<{ Bindings: Env }>) {
  let payload: QuestionnaireRequest;

  try {
    payload = await c.req.json<QuestionnaireRequest>();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const access = await requirePracticeAccess(c, payload.practiceId, "questionnaire_check", "manager");
  if (access instanceof Response) return access;

  const questionnaire = payload.questionnaire ?? {};
  const scoreReport = calculateScore(questionnaireAnswersToCheckData(questionnaire));
  const findings = questionnaireFindings(questionnaire);
  const results = {
    questionnaire,
    scoreReport
  };
  let checkId: string;
  try {
    checkId = await persistSecurityCheck(c.env, access.practice.id, "questionnaire", scoreReport.score, {
      summary: results,
      encryptedPayload: { ...results, findings }
    });
  } catch (error) {
    rethrowOutboundTimeout(error);
    console.error("questionnaire_check_persist_failed", {
      practice_id: access.practice.id,
      failure: safeErrorLog(error)
    });
    return c.json({ error: "questionnaire_save_failed", message: "Fragebogen konnte nicht gespeichert werden." }, 500);
  }

  await auditPracticeAccess(c, access, "create", "security_checks", { check_id: checkId, type: "questionnaire" });

  return c.json({
    checkId,
    score: scoreReport.score,
    scoreReport,
    findings,
    checkedAt: new Date().toISOString()
  });
}

async function handleDashboard(c: Context<{ Bindings: Env }>) {
  const practiceId = c.req.query("practiceId");
  const access = await requirePracticeAccess(c, practiceId, "dashboard_read", "viewer");
  if (access instanceof Response) return access;

  const encodedPracticeId = encodeURIComponent(access.practice.id);

  try {
    const [questionnaireRows, externalRows, wlanRows, monitoringRows, securityHistoryRows, monitoringHistoryRows] =
      await Promise.all([
        supabaseRest<unknown[]>(
          c.env,
          `/rest/v1/security_checks?select=id,type,score,results,completed_at&practice_id=eq.${encodedPracticeId}&type=eq.questionnaire&order=completed_at.desc&limit=1`,
          { method: "GET" }
        ),
        supabaseRest<unknown[]>(
          c.env,
          `/rest/v1/security_checks?select=id,type,score,results,completed_at&practice_id=eq.${encodedPracticeId}&type=eq.external&order=completed_at.desc&limit=1`,
          { method: "GET" }
        ),
        supabaseRest<unknown[]>(
          c.env,
          `/rest/v1/wlan_scans?select=id,network_info,vulnerabilities,devices_found,risk_level,created_at&practice_id=eq.${encodedPracticeId}&order=created_at.desc&limit=1`,
          { method: "GET" }
        ),
        supabaseRest<unknown[]>(
          c.env,
          `/rest/v1/monitoring_snapshots?select=id,score,category_scores,source,checked_at&practice_id=eq.${encodedPracticeId}&order=checked_at.desc&limit=1`,
          { method: "GET" }
        ),
        supabaseRest<unknown[]>(
          c.env,
          `/rest/v1/security_checks?select=id,type,score,completed_at&practice_id=eq.${encodedPracticeId}&order=completed_at.desc&limit=30`,
          { method: "GET" }
        ),
        supabaseRest<unknown[]>(
          c.env,
          `/rest/v1/monitoring_snapshots?select=id,score,checked_at&practice_id=eq.${encodedPracticeId}&order=checked_at.desc&limit=30`,
          { method: "GET" }
        )
      ]);

    const latest = {
      questionnaire: normalizeDashboardSecurityCheck(questionnaireRows[0]),
      external: normalizeDashboardSecurityCheck(externalRows[0]),
      wlanScan: normalizeDashboardWlanScan(wlanRows[0]),
      monitoringSnapshot: normalizeDashboardMonitoringSnapshot(monitoringRows[0])
    };
    const history = buildDashboardHistory(securityHistoryRows, monitoringHistoryRows, 30);
    const hasData = Boolean(latest.questionnaire || latest.external || latest.wlanScan || latest.monitoringSnapshot);

    await auditPracticeAccess(c, access, "read", "dashboard");

    return c.json({
      practiceId: access.practice.id,
      hasData,
      latest,
      history
    });
  } catch (error) {
    rethrowOutboundTimeout(error);
    console.error("dashboard_load_failed", {
      practice_id: access.practice.id,
      failure: safeErrorLog(error)
    });
    return c.json({ error: "dashboard_load_failed", message: "Dashboard-Daten konnten nicht geladen werden." }, 500);
  }
}

function normalizeDashboardSecurityCheck(value: unknown) {
  const row = asRecordOrNull(value);
  if (!row) return null;

  const id = typeof row.id === "string" ? row.id : "";
  const type = typeof row.type === "string" ? row.type : "";
  const checkedAt = typeof row.completed_at === "string" ? row.completed_at : "";
  const score = typeof row.score === "number" && Number.isFinite(row.score) ? clampScore(row.score) : null;
  if (!id || !type || !checkedAt || score === null) return null;

  const results = asRecordOrNull(row.results);
  const scoreReport = asRecordOrNull(results?.scoreReport) ?? null;

  return {
    id,
    type,
    score,
    checkedAt,
    scoreReport,
    summary: summarizeDashboardCheck(results)
  };
}

function normalizeDashboardWlanScan(value: unknown) {
  const row = asRecordOrNull(value);
  if (!row) return null;

  const id = typeof row.id === "string" ? row.id : "";
  const createdAt = typeof row.created_at === "string" ? row.created_at : "";
  if (!id || !createdAt) return null;

  const networkInfo = asRecordOrNull(row.network_info);
  const riskScore = readOptionalScore(networkInfo?.riskScore);

  return {
    id,
    checkedAt: createdAt,
    riskScore,
    riskLevel: typeof row.risk_level === "string" ? row.risk_level : null,
    devicesFound: typeof row.devices_found === "number" && Number.isFinite(row.devices_found) ? row.devices_found : 0,
    networkName: typeof networkInfo?.networkName === "string" ? networkInfo.networkName : null,
    securityProtocol: typeof networkInfo?.securityProtocol === "string" ? networkInfo.securityProtocol : null
  };
}

function normalizeDashboardMonitoringSnapshot(value: unknown) {
  const row = asRecordOrNull(value);
  if (!row) return null;

  const id = typeof row.id === "string" ? row.id : "";
  const checkedAt = typeof row.checked_at === "string" ? row.checked_at : "";
  const score = typeof row.score === "number" && Number.isFinite(row.score) ? clampScore(row.score) : null;
  if (!id || !checkedAt || score === null) return null;

  return {
    id,
    score,
    checkedAt,
    source: typeof row.source === "string" ? row.source : "unknown",
    categoryScores: asRecordOrNull(row.category_scores) ?? {}
  };
}

function summarizeDashboardCheck(results: Record<string, unknown> | null) {
  const summary = asRecordOrNull(results?.summary);
  if (summary) return summary;

  const findings = Array.isArray(results?.findings) ? results.findings.length : null;
  if (findings !== null) return { findings };

  return {};
}

function buildDashboardHistory(securityRows: unknown[], monitoringRows: unknown[], limit: number): DashboardHistoryPoint[] {
  const securityPoints = securityRows.flatMap((row) => {
    const item = asRecordOrNull(row);
    if (!item) return [];

    const id = typeof item.id === "string" ? item.id : "";
    const type = typeof item.type === "string" ? item.type : "security_check";
    const checkedAt = typeof item.completed_at === "string" ? item.completed_at : "";
    const score = readOptionalScore(item.score);
    if (!id || !checkedAt || score === null) return [];

    return [{ id, source: "security_check" as const, type, score, checkedAt }];
  });
  const monitoringPoints = monitoringRows.flatMap((row) => {
    const item = asRecordOrNull(row);
    if (!item) return [];

    const id = typeof item.id === "string" ? item.id : "";
    const checkedAt = typeof item.checked_at === "string" ? item.checked_at : "";
    const score = readOptionalScore(item.score);
    if (!id || !checkedAt || score === null) return [];

    return [{ id, source: "monitoring_snapshot" as const, type: "monitoring", score, checkedAt }];
  });

  return [...securityPoints, ...monitoringPoints]
    .sort((left, right) => new Date(left.checkedAt).getTime() - new Date(right.checkedAt).getTime())
    .slice(-limit);
}

function readOptionalScore(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return clampScore(value);
}

async function handleReportsList(c: Context<{ Bindings: Env }>) {
  const practiceId = c.req.query("practiceId");
  const access = await requirePracticeAccess(c, practiceId, "reports_list", "viewer");
  if (access instanceof Response) return access;

  try {
    const rows = await supabaseRest<unknown[]>(
      c.env,
      `/rest/v1/reports?select=id,check_id,format_version,scoring_version,content,pdf_url,created_at&practice_id=eq.${encodeURIComponent(access.practice.id)}&anonymized_at=is.null&order=created_at.desc`,
      { method: "GET" }
    );
    const reports = rows.map(normalizeReportListItem).filter((item) => item !== null);
    await auditPracticeAccess(c, access, "read", "reports", { format: "list" });
    return c.json({ reports });
  } catch (error) {
    rethrowOutboundTimeout(error);
    console.error("reports_list_failed", {
      practice_id: access.practice.id,
      failure: safeErrorLog(error)
    });
    return c.json({ error: "reports_load_failed", message: "Berichte konnten nicht geladen werden." }, 500);
  }
}

async function handleReportDetail(c: Context<{ Bindings: Env }>) {
  const practiceId = c.req.query("practiceId");
  const access = await requirePracticeAccess(c, practiceId, "report_detail", "viewer");
  if (access instanceof Response) return access;

  const reportId = c.req.param("id") ?? "";
  if (!isUuid(reportId)) return c.json({ error: "report id is required" }, 400);

  try {
    const rows = await supabaseRest<unknown[]>(
      c.env,
      `/rest/v1/reports?select=id,encrypted_content,pdf_url,created_at&id=eq.${encodeURIComponent(reportId)}&practice_id=eq.${encodeURIComponent(access.practice.id)}&anonymized_at=is.null&limit=1`,
      { method: "GET" }
    );
    const row = asRecordOrNull(rows[0]);
    if (!row) return c.json({ error: "not_found", message: "Bericht nicht gefunden." }, 404);

    const report = validateReport(await decryptJson(c.env, row.encrypted_content));
    await auditPracticeAccess(c, access, "read", "reports", { report_id: reportId });
    return c.json({
      report: {
        id: reportId,
        content: report,
        createdAt: typeof row.created_at === "string" ? row.created_at : "",
        pdfPath: typeof row.pdf_url === "string" ? row.pdf_url : undefined
      }
    });
  } catch (error) {
    rethrowOutboundTimeout(error);
    console.error("report_detail_failed", {
      practice_id: access.practice.id,
      report_id: reportId,
      failure: safeErrorLog(error)
    });
    return c.json({ error: "report_load_failed", message: "Bericht konnte nicht geladen werden." }, 500);
  }
}

function normalizeReportListItem(value: unknown) {
  const row = asRecordOrNull(value);
  const id = typeof row?.id === "string" ? row.id : "";
  if (!isUuid(id)) return null;

  return {
    id,
    checkId: typeof row?.check_id === "string" ? row.check_id : null,
    formatVersion: typeof row?.format_version === "string" ? row.format_version : null,
    scoringVersion: typeof row?.scoring_version === "string" ? row.scoring_version : null,
    summary: asRecordOrNull(row?.content) ?? {},
    pdfPath: typeof row?.pdf_url === "string" ? row.pdf_url : null,
    createdAt: typeof row?.created_at === "string" ? row.created_at : ""
  };
}

async function handleReportGenerate(
  c: Context<{ Bindings: Env }>,
  options: { requirePractice: boolean; persist: boolean }
) {
  let payload: ReportRequest;

  try {
    payload = await c.req.json<ReportRequest>();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const access = options.requirePractice || payload.practiceId
    ? await requirePracticeAccess(c, payload.practiceId, "report_generate", "manager")
    : null;
  if (access instanceof Response) return access;

  if (access && payload.checkId) {
    const checkAccess = await requireSecurityCheckForPractice(c.env, access.practice.id, payload.checkId);
    if (checkAccess instanceof Response) return checkAccess;
  }

  if (access) {
    const allowed = await consumeAiReportQuotaOrErrorResponse(c, access, "report_generate");
    if (allowed instanceof Response) return allowed;
    if (!allowed) {
      await auditPracticeAccess(c, access, "quota_denied", "reports", { plan: access.practice.plan });
      return c.json({ error: "daily_ai_report_limit_reached", limit: FREE_PLAN_DAILY_AI_REPORT_LIMIT, plan: "free" }, 429);
    }
  }

  const reportInput: CheckData = {
    ...payload,
    score: scoreQuestionnaire(payload.questionnaire ?? {}),
    practiceName: payload.practiceName ?? access?.practice.name,
    domain: payload.domain ?? access?.practice.domain
  };

  const reportResult = await generateAiReportFromChecks(c.env, reportInput);
  if (reportResult instanceof Response) return reportResult;

  if (access && options.persist) {
    const reportId = crypto.randomUUID();
    await persistReport(c.env, {
      id: reportId,
      practiceId: access.practice.id,
      checkId: payload.checkId,
      report: reportResult
    });
    await auditPracticeAccess(c, access, "create", "reports", { report_id: reportId });
    return c.json({ ...reportResult, reportId });
  }

  return c.json(reportResult);
}

async function handleReportPdf(c: Context<{ Bindings: Env }>) {
  let payload: PdfReportRequest;

  try {
    payload = await c.req.json<PdfReportRequest>();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const access = await requirePracticeAccess(c, payload.practiceId, "report_pdf");
  if (access instanceof Response) return access;

  if (!payload.report) {
    return c.json({ error: "report is required" }, 400);
  }

  const report = validateReport(payload.report);
  const reportId = crypto.randomUUID();
  const pdf = buildSimplePdf(buildPdfSections({
    reportId,
    practiceName: payload.practiceName ?? access.practice.name,
    domain: payload.domain ?? access.practice.domain,
    report
  }));

  await auditPracticeAccess(c, access, "export", "reports_pdf", { format: "pdf" });

  return new Response(pdf, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="praxisshield-${reportId}.pdf"`,
      "cache-control": "no-store"
    }
  });
}

function buildPdfSections(input: { reportId: string; practiceName: string; domain?: string; report: Report }) {
  const generatedAt = new Date().toISOString();
  return [
    "Deckblatt",
    `PraxisShield AI Sicherheitsbericht für ${input.practiceName}`,
    `Report-ID: ${input.reportId}`,
    `Format-Version: ${REPORT_FORMAT_VERSION}`,
    `Scoring-Version: ${SCORING_VERSION}`,
    `Domain: ${input.domain ?? "nicht angegeben"}`,
    `Erstellt: ${generatedAt}`,
    "",
    "Rechtlicher Hinweis",
    "Dieser Bericht ist eine technische Momentaufnahme und ersetzt keine Rechtsberatung oder vollständigen Penetrationstest.",
    "",
    "Executive Summary",
    input.report.executive_summary,
    "",
    "Security Score",
    `Score: ${input.report.security_score}/100`,
    `Ampel: ${input.report.ampel.toUpperCase()}`,
    ...Object.entries(input.report.scores_by_category).map(([category, score]) => `${category}: ${score}/100`),
    "",
    "Kritische Risiken",
    ...input.report.top_risks
      .filter((risk) => risk.priority === "sofort")
      .map(
        (risk) =>
          `${risk.rank}. ${risk.title}: ${risk.action} (Evidenz: ${evidenceSourceLabel(risk.evidence_source)}, Zuverlaessigkeit: ${reliabilityLabel(risk.reliability)})`
      ),
    "",
    "Warnungen",
    ...input.report.top_risks
      .filter((risk) => risk.priority !== "sofort")
      .map(
        (risk) =>
          `${risk.rank}. ${risk.title}: ${risk.action} (Evidenz: ${evidenceSourceLabel(risk.evidence_source)}, Zuverlaessigkeit: ${reliabilityLabel(risk.reliability)})`
      ),
    "",
    "Nicht geprueft / technische Einschraenkungen",
    ...(input.report.not_checked_limitations.length > 0
      ? input.report.not_checked_limitations.map(
          (limitation) => `${limitation.area}: ${limitation.reason} Auswirkung: ${limitation.impact}`
        )
      : ["Keine Einschraenkungen im KI-Bericht angegeben. Dies ersetzt keine Vollpruefung."]),
    "",
    "Geltungsbereich gepruefter Kontrollen",
    "Positive Aussagen gelten nur fuer die tatsaechlich gemessenen oder nachgewiesenen Kontrollen. Nicht gepruefte Bereiche sind nicht als sicher zu werten.",
    "",
    "DSGVO-Status",
    `Status: ${input.report.dsgvo_compliance.status}`,
    `Haftungsrisiko: ${input.report.dsgvo_compliance.liability_risk}`,
    `Fehlende Dokumente: ${input.report.dsgvo_compliance.missing_documents.join(", ") || "keine angegeben"}`,
    "",
    "Maßnahmenplan",
    ...input.report.quick_wins.map((quickWin) => `${quickWin.action} (${quickWin.time_minutes} Minuten): ${quickWin.impact}`),
    "",
    "Methodik",
    "Geprüft wurden Fragebogenangaben, externe Domainsignale und optional lokale WLAN-Messwerte mit dokumentierter Datenherkunft.",
    "",
    "Über PraxisShield",
    "PraxisShield AI unterstuetzt Arztpraxen und IT-Partner bei Cybersecurity-Transparenz, DSGVO-Dokumentation und Monitoring."
  ];
}

function evidenceSourceLabel(value: Report["top_risks"][number]["evidence_source"]) {
  if (value === "measured") return "gemessen";
  if (value === "inferred") return "heuristisch";
  if (value === "self_reported") return "Selbstauskunft";
  if (value === "not_checked") return "nicht geprueft";
  return "nicht verfuegbar";
}

function reliabilityLabel(value: Report["top_risks"][number]["reliability"]) {
  if (value === "high") return "hoch";
  if (value === "medium") return "mittel";
  return "niedrig";
}

async function generateAiReportFromChecks(env: Env, payload: CheckData): Promise<Report | Response> {
  if (!env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "ANTHROPIC_API_KEY is not configured" }, { status: 500 });
  }

  let response: Response;
  try {
    response = await fetchWithTimeout(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6",
          max_tokens: 4000,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: buildReportPrompt(payload) }]
        })
      },
      { service: "anthropic", timeoutMs: OUTBOUND_TIMEOUT_MS.anthropic }
    );
  } catch (error) {
    if (error instanceof OutboundRequestTimeoutError) {
      return Response.json({ error: "anthropic_timeout" }, { status: 504 });
    }
    console.error("ai_upstream_failed", { failure: safeErrorLog(error) });
    return Response.json({ error: "anthropic_request_failed" }, { status: 502 });
  }

  if (!response.ok) {
    return Response.json({ error: "anthropic_request_failed" }, { status: 502 });
  }

  try {
    const data = (await response.json()) as unknown;
    return validateReport(parseAnthropicJson(data));
  } catch (error) {
    return Response.json(
      {
        error: "invalid_ai_report",
        message: error instanceof Error ? error.message : "Claude response did not match Report schema"
      },
      { status: 502 }
    );
  }
}

async function requirePracticeAccess(
  c: Context<{ Bindings: Env }>,
  practiceId: string | undefined,
  action: string,
  requiredRole?: "owner" | "manager" | "viewer"
): Promise<PracticeAccess | Response> {
  if (!practiceId || !isUuid(practiceId)) {
    return c.json({ error: "practiceId is required" }, 400);
  }

  let user: AuthUser | null;
  try {
    user = await getAuthenticatedUser(c);
  } catch (error) {
    console.error("practice_access_auth_failed", error);
    return c.json({ error: "internal_server_error" }, 500);
  }

  if (!user) {
    return c.json({ error: "unauthorized" }, 401);
  }

  let practices: unknown[];
  try {
    practices = await supabaseRest<unknown[]>(
      c.env,
      `/rest/v1/practices?select=id,owner_id,name,domain,email,plan,white_label_partner_id&id=eq.${encodeURIComponent(practiceId)}&limit=1`,
      { method: "GET" }
    );
  } catch (error) {
    rethrowOutboundTimeout(error);
    console.error("practice_access_practice_lookup_failed", {
      practice_id: practiceId,
      action,
      failure: safeErrorLog(error)
    });
    return c.json({ error: "practice_access_check_failed", message: "Praxiszugriff konnte nicht geprüft werden." }, 500);
  }
  const practice = normalizePractice(practices[0]);

  if (!practice) {
    return c.json({ error: "forbidden" }, 403);
  }

  let role: PracticeAccess["role"] | null;
  try {
    role = practice.owner_id === user.id ? "owner" : await getPartnerRole(c.env, user.id, practice.id);
  } catch (error) {
    rethrowOutboundTimeout(error);
    console.error("practice_access_role_lookup_failed", {
      practice_id: practice.id,
      user_id: user.id,
      action,
      failure: safeErrorLog(error)
    });
    return c.json({ error: "practice_access_check_failed", message: "Praxiszugriff konnte nicht geprüft werden." }, 500);
  }

  if (!role) {
    return c.json({ error: "forbidden" }, 403);
  }

  if (requiredRole) {
    let allowed: boolean;
    try {
      allowed = await canAccessPractice(c.env, user.id, practice.id, requiredRole);
    } catch (error) {
      rethrowOutboundTimeout(error);
      console.error("practice_access_rpc_failed", {
        practice_id: practice.id,
        user_id: user.id,
        role: requiredRole,
        action,
        failure: safeErrorLog(error)
      });
      return c.json({ error: "practice_access_check_failed", message: "Praxiszugriff konnte nicht geprüft werden." }, 500);
    }
    if (!allowed) {
      return c.json({ error: "forbidden" }, 403);
    }
  }

  const access = { user, practice, role };
  await auditPracticeAccess(c, access, "access", action);

  return access;
}

async function canAccessPractice(env: Env, userId: string, practiceId: string, requiredRole: "owner" | "manager" | "viewer") {
  return supabaseRest<boolean>(env, "/rest/v1/rpc/can_access_practice", {
    method: "POST",
    body: {
      p_user_id: userId,
      p_practice_id: practiceId,
      p_required_role: requiredRole
    }
  });
}

async function getPartnerRole(env: Env, userId: string, practiceId: string): Promise<PracticeAccess["role"] | null> {
  const grants = await supabaseRest<unknown[]>(
    env,
    `/rest/v1/partner_practices?select=role&partner_id=eq.${encodeURIComponent(userId)}&practice_id=eq.${encodeURIComponent(practiceId)}&limit=1`,
    { method: "GET" }
  );
  const grant = asRecordOrNull(grants[0]);
  const role = grant?.role;

  if (role === "owner" || role === "manager" || role === "viewer" || role === "white_label") return role;
  return null;
}

async function getAuthenticatedUser(c: Context<{ Bindings: Env }>): Promise<AuthUser | null> {
  if (!c.env.SUPABASE_URL || !c.env.SUPABASE_SERVICE_ROLE_KEY || !c.env.SUPABASE_ANON_KEY) {
    console.error("worker_misconfigured_supabase_auth");
    throw new Error("Supabase auth credentials are not configured");
  }

  const token = getBearerToken(c.req.header("authorization"));
  if (!token) return null;

  try {
    const response = await fetch(`${c.env.SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey: c.env.SUPABASE_ANON_KEY,
        authorization: `Bearer ${token}`
      }
    });

    if (response.status >= 500) {
      throw new Error(`Supabase auth request failed with ${response.status}`);
    }

    if (!response.ok) return null;

    const data = asRecord(await response.json());
    const id = typeof data.id === "string" ? data.id : "";
    if (!isUuid(id)) return null;

    return {
      id,
      email: typeof data.email === "string" ? data.email : undefined
    };
  } catch (error) {
    console.error("supabase_auth_unavailable", error);
    throw error;
  }
}

function getBearerToken(value?: string) {
  const match = value?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
}

function safeErrorLog(error: unknown) {
  const record = asRecordOrNull(error);
  const status = record?.status;
  return {
    name: error instanceof Error ? error.name : typeof record?.name === "string" ? record.name : "Error",
    message: error instanceof Error ? error.message : typeof record?.message === "string" ? record.message : "Unknown error",
    status: typeof status === "number" || typeof status === "string" ? status : undefined
  };
}

function rethrowOutboundTimeout(error: unknown): void {
  if (error instanceof OutboundRequestTimeoutError) throw error;
}

function normalizePractice(value: unknown): PracticeRecord | null {
  const item = asRecordOrNull(value);
  if (!item) return null;

  const id = typeof item.id === "string" ? item.id : "";
  const ownerId = typeof item.owner_id === "string" ? item.owner_id : "";
  const plan = item.plan === "audit" || item.plan === "monitoring" || item.plan === "compliance" ? item.plan : "free";

  if (!isUuid(id) || !isUuid(ownerId)) return null;

  return {
    id,
    owner_id: ownerId,
    name: typeof item.name === "string" ? item.name : "Praxis",
    domain: typeof item.domain === "string" ? item.domain : undefined,
    email: typeof item.email === "string" ? item.email : undefined,
    plan,
    white_label_partner_id: typeof item.white_label_partner_id === "string" ? item.white_label_partner_id : null
  };
}

async function consumeExternalQuota(env: Env, access: PracticeAccess) {
  if (access.practice.plan !== "free") return true;
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("worker_misconfigured_external_quota");
    throw new Error("Supabase service credentials are not configured");
  }

  const today = new Date().toISOString().slice(0, 10);
  const allowed = await supabaseRest<boolean>(env, "/rest/v1/rpc/consume_external_check_quota", {
    method: "POST",
    prefer: "return=representation",
    body: {
      p_user_id: access.user.id,
      p_practice_id: access.practice.id,
      p_usage_date: today,
      p_limit: 3
    }
  });

  return allowed === true;
}

async function consumeExternalQuotaOrErrorResponse(
  c: Context<{ Bindings: Env }>,
  access: PracticeAccess,
  action: string
): Promise<boolean | Response> {
  try {
    return await consumeExternalQuota(c.env, access);
  } catch (error) {
    rethrowOutboundTimeout(error);
    console.error("external_quota_check_failed", { action, failure: safeErrorLog(error) });
    return c.json({ error: "internal_server_error" }, 500);
  }
}

async function consumeAiReportQuota(env: Env, access: PracticeAccess) {
  if (access.practice.plan !== "free") return true;
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("worker_misconfigured_ai_report_quota");
    throw new Error("Supabase service credentials are not configured");
  }

  const today = new Date().toISOString().slice(0, 10);
  const allowed = await supabaseRest<boolean>(env, "/rest/v1/rpc/consume_ai_report_quota", {
    method: "POST",
    prefer: "return=representation",
    body: {
      p_user_id: access.user.id,
      p_practice_id: access.practice.id,
      p_usage_date: today,
      p_limit: FREE_PLAN_DAILY_AI_REPORT_LIMIT
    }
  });

  return allowed === true;
}

async function consumeAiReportQuotaOrErrorResponse(
  c: Context<{ Bindings: Env }>,
  access: PracticeAccess,
  action: string
): Promise<boolean | Response> {
  try {
    return await consumeAiReportQuota(c.env, access);
  } catch (error) {
    rethrowOutboundTimeout(error);
    console.error("ai_report_quota_check_failed", { action, failure: safeErrorLog(error) });
    return c.json({ error: "internal_server_error" }, 500);
  }
}

async function requireSecurityCheckForPractice(env: Env, practiceId: string, checkId: string): Promise<true | Response> {
  if (!isUuid(checkId)) {
    return Response.json({ error: "checkId is required" }, { status: 400 });
  }

  const checks = await supabaseRest<unknown[]>(
    env,
    `/rest/v1/security_checks?select=id&id=eq.${encodeURIComponent(checkId)}&practice_id=eq.${encodeURIComponent(practiceId)}&limit=1`,
    { method: "GET" }
  );

  if (!checks[0]) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  return true;
}

async function persistSecurityCheck(
  env: Env,
  practiceId: string,
  type: "questionnaire" | "wlan" | "external" | "full",
  score: number,
  payload: { summary: Record<string, unknown>; encryptedPayload: unknown }
) {
  const id = crypto.randomUUID();
  const encrypted = await encryptJson(env, payload.encryptedPayload);
  const payloadHash = await sha256Json(payload.encryptedPayload);

  await supabaseRest(env, "/rest/v1/security_checks", {
    method: "POST",
    body: {
      id,
      practice_id: practiceId,
      type,
      score: clampScore(score),
      scoring_version: SCORING_VERSION,
      results: payload.summary,
      encrypted_payload: encrypted,
      payload_sha256: payloadHash
    }
  });

  return id;
}

async function persistReport(env: Env, input: { id: string; practiceId: string; checkId?: string; report: Report }) {
  const encrypted = await encryptJson(env, input.report);
  const payloadHash = await sha256Json(input.report);

  await supabaseRest(env, "/rest/v1/reports", {
    method: "POST",
    body: {
      id: input.id,
      practice_id: input.practiceId,
      check_id: input.checkId && isUuid(input.checkId) ? input.checkId : null,
      format_version: REPORT_FORMAT_VERSION,
      scoring_version: SCORING_VERSION,
      content: redactedReportSummary(input.report),
      encrypted_content: encrypted,
      payload_sha256: payloadHash,
      input_hash: payloadHash
    }
  });
}

async function auditPracticeAccess(
  c: Context<{ Bindings: Env }>,
  access: PracticeAccess,
  action: string,
  resource: string,
  metadata: Record<string, unknown> = {}
) {
  if (!c.env.SUPABASE_URL || !c.env.SUPABASE_SERVICE_ROLE_KEY) return;

  try {
    const sanitizedMetadata = redactAuditMetadata(metadata);
    const ipHash = await sha256Text(c.req.header("cf-connecting-ip") ?? "unknown");
    const userAgent = (c.req.header("user-agent") ?? "unknown").slice(0, 180);

    if (access.role !== "owner") {
      await supabaseRest(c.env, "/rest/v1/rpc/audit_partner_practice_access", {
        method: "POST",
        body: {
          p_user_id: access.user.id,
          p_practice_id: access.practice.id,
          p_action: action,
          p_resource: resource,
          p_metadata: sanitizedMetadata,
          p_ip_hash: ipHash,
          p_user_agent: userAgent
        }
      });
      return;
    }

    await supabaseRest(c.env, "/rest/v1/practice_access_audit", {
      method: "POST",
      body: {
        practice_id: access.practice.id,
        user_id: access.user.id,
        action,
        resource,
        metadata: sanitizedMetadata,
        ip_hash: ipHash,
        user_agent: userAgent
      }
    });
  } catch (error) {
    console.error("practice_access_audit_failed", {
      action,
      resource,
      practice_id: access.practice.id,
      user_id: access.user.id,
      role: access.role,
      failure: safeErrorLog(error)
    });
  }
}

function redactAuditMetadata(metadata: Record<string, unknown>) {
  const allowed = new Set(["check_id", "report_id", "alert_id", "type", "source", "format", "plan", "role"]);
  return Object.fromEntries(Object.entries(metadata).filter(([key]) => allowed.has(key)));
}

function redactedExternalSummary(result: ExternalCheckResult) {
  return {
    domain: result.domain,
    checkedAt: result.checkedAt,
    overall_score: result.overall_score,
    critical_count: result.critical_count,
    warning_count: result.warning_count,
    providers: result.providers,
    provider_statuses: result.provider_statuses,
    finding_ids: result.findings.map((finding) => finding.id)
  };
}

function redactedReportSummary(report: Report) {
  return {
    security_score: report.security_score,
    overall_risk: report.overall_risk,
    ampel: report.ampel,
    top_risk_count: report.top_risks.length,
    monthly_monitoring_recommendation: report.monthly_monitoring_recommendation
  };
}

function scoreQuestionnaire(questionnaire: Record<string, unknown>) {
  const answers = Object.values(questionnaire);
  if (answers.length === 0) return 50;

  const positive = answers.filter(Boolean).length;
  return clampScore((positive / answers.length) * 100);
}

function questionnaireFindings(questionnaire: Record<string, QuestionnaireAnswerValue>): SecurityFinding[] {
  return Object.entries(questionnaire)
    .filter(([, value]) => value === false)
    .slice(0, 10)
    .map(([key], index) => ({
      id: `questionnaire-${key}`,
      severity: index < 3 ? "warning" : "info",
      title: `Fragebogen-Risiko: ${key}`
    }));
}

async function encryptJson(env: Env, value: unknown) {
  const key = await importAesKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);

  return {
    alg: "AES-256-GCM",
    iv: bytesToBase64(iv),
    data: bytesToBase64(new Uint8Array(ciphertext)),
    created_at: new Date().toISOString()
  };
}

async function decryptJson(env: Env, value: unknown) {
  const encrypted = asRecord(value);
  if (encrypted.alg !== "AES-256-GCM" || typeof encrypted.iv !== "string" || typeof encrypted.data !== "string") {
    throw new Error("Encrypted report has an unsupported format");
  }

  const iv = base64ToBytes(encrypted.iv);
  const ciphertext = base64ToBytes(encrypted.data);
  if (iv.length !== 12 || ciphertext.length === 0) throw new Error("Encrypted report payload is invalid");

  const key = await importAesKey(env);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return JSON.parse(new TextDecoder().decode(plaintext)) as unknown;
}

async function importAesKey(env: Env) {
  const material = decodeEncryptionKey(env.DATA_ENCRYPTION_KEY);
  if (material.length !== 32) {
    throw new Error("DATA_ENCRYPTION_KEY must decode to exactly 32 bytes for AES-256-GCM");
  }

  return crypto.subtle.importKey("raw", material, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

function decodeEncryptionKey(value?: string) {
  if (!value) return new Uint8Array();

  const trimmed = value.trim();
  if (/^[0-9a-f]{64}$/i.test(trimmed)) {
    return new Uint8Array(trimmed.match(/.{1,2}/g)?.map((byte) => Number.parseInt(byte, 16)) ?? []);
  }

  try {
    const binary = atob(trimmed.replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return new TextEncoder().encode(trimmed);
  }
}

async function sha256Json(value: unknown) {
  return sha256Text(JSON.stringify(value));
}

async function sha256Text(value: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(hash));
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function bytesToHex(bytes: Uint8Array) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function buildSimplePdf(lines: string[]) {
  const cleanLines = lines.flatMap((line) => wrapPdfLine(line, 86)).slice(0, 46);
  const stream = ["BT", "/F1 12 Tf", "50 790 Td", "16 TL", ...cleanLines.map((line) => `<${pdfUtf16Hex(line)}> Tj T*`), "ET"].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return body;
}

function wrapPdfLine(value: string, maxLength: number) {
  const words = value.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (`${current} ${word}`.trim().length > maxLength) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = `${current} ${word}`.trim();
    }
  }

  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

function pdfUtf16Hex(value: string) {
  const bytes = [0xfe, 0xff];
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    bytes.push((code >> 8) & 0xff, code & 0xff);
  }
  return bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}

async function performExternalCheck(domain: string, email: string | string[] | null, env: Env): Promise<ExternalCheckResult> {
  const timestamp = new Date().toISOString();
  const providerContext = createProviderExecutionContext(env);
  const [dns, ssl, emailSecurity, ports, reputation, leaks, subdomains] = await Promise.all([
    checkDns(domain, providerContext),
    checkSsl(domain, providerContext),
    checkEmailSecurity(domain, providerContext),
    checkPorts(domain, env.SHODAN_API_KEY, providerContext),
    checkReputation(domain, env, providerContext),
    checkLeaks(domain, email, env.HIBP_API_KEY, providerContext),
    checkSubdomains(domain, env, providerContext)
  ]);
  const checks = { ssl, dns, email_security: emailSecurity, ports, reputation, leaks, subdomains };
  const provider_statuses = buildProviderStatuses(env, providerContext.statuses, {
    sslLabs: ssl.issuer !== "unknown" || ssl.protocol !== "unknown"
  });
  const findings = buildFindings(checks, provider_statuses);
  const critical_count = findings.filter((finding) => finding.severity === "critical").length;
  const warning_count = findings.filter((finding) => finding.severity === "warning").length;
  const overall_score = calculateOverallScore(critical_count, warning_count, findings);

  const result: ExternalCheckResult = {
    domain,
    timestamp,
    checks,
    overall_score,
    critical_count,
    warning_count,
    findings,
    checkedAt: timestamp,
    scoreImpact: overall_score - 100,
    providers: {
      sslLabs: provider_statuses.sslLabs === "active",
      cloudflareDns: provider_statuses.cloudflareDns === "active",
      securityTrails: provider_statuses.securityTrails === "active",
      shodan: provider_statuses.shodan === "active",
      hibp: provider_statuses.hibp === "active",
      virusTotal: provider_statuses.virusTotal === "active"
    },
    provider_statuses
  };

  return result;
}

async function handleMonitoringRun(c: Context<{ Bindings: Env }>) {
  let payload: MonitoringRunRequest;

  try {
    payload = await c.req.json<MonitoringRunRequest>();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const access = await requirePracticeAccess(c, payload.practiceId, "monitoring_run", "manager");
  if (access instanceof Response) return access;

  const domain = normalizeDomain(payload.domain || access?.practice.domain);

  if (!domain) {
    return c.json({ error: "domain is required" }, 400);
  }

  if (access) {
    const allowed = await consumeExternalQuotaOrErrorResponse(c, access, "monitoring_run");
    if (allowed instanceof Response) return allowed;
    if (!allowed) {
      await auditPracticeAccess(c, access, "quota_denied", "monitoring_run", { plan: access.practice.plan });
      return c.json({ error: "daily_limit_reached", limit: 3, plan: "free" }, 429);
    }
  }

  const practiceId = access.practice.id;
  const targetDomains = monitoringTargetDomains(payload, domain);
  const approvedEmails = payload.leakConsentAccepted === true
    ? uniqueEmails([payload.email, access?.practice.email, ...(payload.emails ?? [])].filter((item): item is string => Boolean(item)))
    : [];
  const results = await mapInBatches(
    targetDomains,
    monitoringConcurrencyLimit(c.env),
    (targetDomain, index) => performExternalCheck(targetDomain, index === 0 ? approvedEmails : null, c.env)
  );
  const result = aggregateMonitoringResult(results);
  const previousSummary = practiceId ? await fetchPreviousMonitoringSummary(c.env, practiceId) : null;
  const comparison = buildMonitoringComparison(results, previousSummary);
  const snapshot = buildMonitoringSnapshot(practiceId, result, "manual", comparison, targetDomains, approvedEmails.length);
  const events = buildMonitoringEvents(result, ["ssl_check", "dns_check", "port_scan", "leak_check", "reputation_check"], comparison).map(
    (event) => ({ ...event, practice_id: practiceId })
  );

  await persistMonitoringResult(c.env, snapshot, events);

  await auditPracticeAccess(c, access, "create", "monitoring_snapshots", { snapshot_id: snapshot.id, source: "manual" });

  return c.json({ snapshot, events, result });
}

async function handleMonitoringStatus(c: Context<{ Bindings: Env }>) {
  const practiceId = c.req.query("practiceId");
  const access = await requirePracticeAccess(c, practiceId, "monitoring_status", "viewer");
  if (access instanceof Response) return access;

  const snapshots = await supabaseRest<unknown[]>(
    c.env,
    `/rest/v1/monitoring_snapshots?select=*&practice_id=eq.${encodeURIComponent(access.practice.id)}&order=checked_at.desc&limit=1`,
    { method: "GET" }
  );
  const events = await supabaseRest<unknown[]>(
    c.env,
    `/rest/v1/monitoring_events?select=*&practice_id=eq.${encodeURIComponent(access.practice.id)}&resolved_at=is.null&order=created_at.desc&limit=20`,
    { method: "GET" }
  );

  await auditPracticeAccess(c, access, "read", "monitoring_status");

  return c.json({
    snapshot: snapshots[0] ?? null,
    activeAlerts: events
  });
}

async function handleMonitoringHistory(c: Context<{ Bindings: Env }>) {
  const practiceId = c.req.query("practiceId");
  const access = await requirePracticeAccess(c, practiceId, "monitoring_history", "viewer");
  if (access instanceof Response) return access;

  const history = await supabaseRest<unknown[]>(
    c.env,
    `/rest/v1/monitoring_snapshots?select=id,score,category_scores,checked_at,source&practice_id=eq.${encodeURIComponent(
      access.practice.id
    )}&order=checked_at.desc&limit=90`,
    { method: "GET" }
  );

  await auditPracticeAccess(c, access, "read", "monitoring_history");

  return c.json({ history });
}

async function handleAlertAcknowledge(c: Context<{ Bindings: Env }>) {
  let payload: AlertAcknowledgeRequest;

  try {
    payload = await c.req.json<AlertAcknowledgeRequest>();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const access = await requirePracticeAccess(c, payload.practiceId, "alert_acknowledge", "manager");
  if (access instanceof Response) return access;
  if (!payload.alertId || !isUuid(payload.alertId)) return c.json({ error: "alertId is required" }, 400);

  await supabaseRest(c.env, `/rest/v1/monitoring_events?id=eq.${encodeURIComponent(payload.alertId)}&practice_id=eq.${encodeURIComponent(access.practice.id)}`, {
    method: "PATCH",
    body: { resolved_at: new Date().toISOString() }
  });
  await auditPracticeAccess(c, access, "update", "monitoring_events", { alert_id: payload.alertId });

  return c.json({ ok: true });
}

async function handlePrivacyDelete(c: Context<{ Bindings: Env }>) {
  let payload: PrivacyDeleteRequest;

  try {
    payload = await c.req.json<PrivacyDeleteRequest>();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const access = await requirePracticeAccess(c, payload.practiceId, "privacy_delete", "owner");
  if (access instanceof Response) return access;

  const deletionReport = await supabaseRest<DeletionReport>(c.env, "/rest/v1/rpc/complete_privacy_deletion", {
    method: "POST",
    body: {
      p_practice_id: access.practice.id,
      p_user_id: access.user.id
    }
  });

  await auditPracticeAccess(c, access, "delete_requested", "practices");
  await sendDeletionConfirmation(c.env, access.user.email, deletionReport);

  return c.json({ ok: true, deletion: deletionReport });
}

async function handlePrivacyExport(c: Context<{ Bindings: Env }>) {
  const practiceId = c.req.query("practiceId");
  const access = await requirePracticeAccess(c, practiceId, "privacy_export", "manager");
  if (access instanceof Response) return access;

  const exportData = {
    export_created_at: new Date().toISOString(),
    export_format: "1.0",
    practice: access.practice,
    security_checks: await supabaseRest<unknown[]>(
      c.env,
      `/rest/v1/security_checks?select=id,type,score,scoring_version,results,completed_at&practice_id=eq.${encodeURIComponent(access.practice.id)}`,
      { method: "GET" }
    ),
    reports: await supabaseRest<unknown[]>(
      c.env,
      `/rest/v1/reports?select=id,check_id,format_version,scoring_version,content,pdf_url,created_at,input_hash&practice_id=eq.${encodeURIComponent(access.practice.id)}`,
      { method: "GET" }
    ),
    monitoring_events: await supabaseRest<unknown[]>(
      c.env,
      `/rest/v1/monitoring_events?select=*&practice_id=eq.${encodeURIComponent(access.practice.id)}`,
      { method: "GET" }
    ),
    consent_log: await supabaseRest<unknown[]>(
      c.env,
      `/rest/v1/consent_log?select=type,version,accepted,accepted_at,withdrawn_at,created_at&practice_id=eq.${encodeURIComponent(access.practice.id)}`,
      { method: "GET" }
    )
  };
  const signature = await sha256Json(exportData);

  await auditPracticeAccess(c, access, "export", "privacy_data", { format: "json" });

  return c.json({
    data: exportData,
    signature,
    valid_until: addDays(new Date(), 7).toISOString()
  });
}

async function sendDeletionConfirmation(env: Env, email: string | undefined, report: DeletionReport) {
  if (!email) return;

  await supabaseRest(env, "/rest/v1/email_outbox", {
    method: "POST",
    body: {
      recipient: email,
      template: "privacy_deletion_confirmation",
      payload: report,
      status: env.RESEND_API_KEY ? "sending" : "queued"
    }
  });

  if (!env.RESEND_API_KEY) return;

  const response = await fetchWithTimeout(
    "https://api.resend.com/emails",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.RESEND_API_KEY}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        from: env.DELETION_FROM_EMAIL ?? "PraxisShield <privacy@praxisshield.de>",
        to: email,
        subject: "Bestaetigung Ihrer Datenschutz-Loeschanfrage",
        text: [
          "Ihre Loeschanfrage wurde verarbeitet.",
          `Vorgangs-ID: ${report.deletion_id}`,
          `Praxis-ID: ${report.practice_id}`,
          `Aufbewahrungspflichtige Audit-Nachweise werden bis ${report.retention_until} gehalten.`
        ].join("\n")
      })
    },
    { service: "resend", timeoutMs: OUTBOUND_TIMEOUT_MS.resend }
  );

  if (!response.ok) {
    throw new Error("deletion_confirmation_email_failed");
  }
}

async function handleAvvAccept(c: Context<{ Bindings: Env }>) {
  let payload: ConsentRequest;

  try {
    payload = await c.req.json<ConsentRequest>();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const access = await requirePracticeAccess(c, payload.practiceId, "avv_accept", "owner");
  if (access instanceof Response) return access;

  await supabaseRest(c.env, "/rest/v1/data_processing_agreements?on_conflict=practice_id,version", {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=minimal",
    body: {
      practice_id: access.practice.id,
      user_id: access.user.id,
      version: payload.version ?? "2026-06-24",
      status: "accepted",
      accepted_at: new Date().toISOString(),
      metadata: {
        legal_basis: "DSGVO Art. 28",
        data_region: "EU / Frankfurt",
        generated_automatically: true
      }
    }
  });
  await insertConsentLog(c, access, payload.consentTypes ?? ["avv"], payload.version ?? "2026-06-24", true);
  await auditPracticeAccess(c, access, "accept", "data_processing_agreements");

  return c.json({ ok: true });
}

async function handleConsent(c: Context<{ Bindings: Env }>) {
  let payload: ConsentRequest;

  try {
    payload = await c.req.json<ConsentRequest>();
  } catch {
    return c.json({ error: "invalid_json" }, 400);
  }

  const access = await requirePracticeAccess(c, payload.practiceId, "consent_log", "manager");
  if (access instanceof Response) return access;
  const consentType = payload.type;

  if (!consentType) {
    return c.json({ error: "type is required" }, 400);
  }

  await insertConsentLog(c, access, [consentType], payload.version ?? "1.0", payload.accepted === true);
  await auditPracticeAccess(c, access, payload.accepted === true ? "accept" : "withdraw", "consent_log", { type: consentType });

  return c.json({ ok: true });
}

async function insertConsentLog(
  c: Context<{ Bindings: Env }>,
  access: PracticeAccess,
  types: Array<"avv" | "privacy_policy" | "wlan_scan" | "ai_processing">,
  version: string,
  accepted: boolean
) {
  const now = new Date().toISOString();
  const ipHash = await sha256Text(c.req.header("cf-connecting-ip") ?? "unknown");
  const userAgentHash = await sha256Text(c.req.header("user-agent") ?? "unknown");

  await supabaseRest(c.env, "/rest/v1/consent_log", {
    method: "POST",
    body: types.map((type) => ({
      practice_id: access.practice.id,
      user_id: access.user.id,
      type,
      version,
      accepted,
      accepted_at: now,
      ip_hash: ipHash,
      user_agent_hash: userAgentHash,
      withdrawn_at: accepted ? null : now
    }))
  });
}

async function runScheduledMonitoring(cron: string, env: Env) {
  const modules = CRON_MODULES.get(cron) ?? ["ssl_check", "dns_check", "port_scan", "leak_check", "reputation_check"];
  const targets = await fetchMonitoringTargets(env);

  await mapInBatches(
    targets,
    monitoringConcurrencyLimit(env),
    async (target) => {
      const result = await performExternalCheck(target.domain, normalizeEmail(target.email), env);
      const previousSummary = await fetchPreviousMonitoringSummary(env, target.id);
      const comparison = buildMonitoringComparison([result], previousSummary);
      const snapshot = buildMonitoringSnapshot(target.id, result, "scheduled", comparison, [target.domain], target.email ? 1 : 0);
      const events = buildMonitoringEvents(result, modules, comparison);

      await persistMonitoringResult(env, snapshot, events);
    }
  );
}

function monitoringConcurrencyLimit(env: Env) {
  const configuredLimit = Number.parseInt(env.MONITORING_CONCURRENCY_LIMIT ?? "", 10);
  if (!Number.isFinite(configuredLimit) || configuredLimit <= 0) {
    return DEFAULT_MONITORING_CONCURRENCY_LIMIT;
  }
  return Math.min(25, configuredLimit);
}

function buildMonitoringSnapshot(
  practiceId: string,
  result: ExternalCheckResult,
  source: "manual" | "scheduled",
  comparison: MonitoringComparison,
  monitoredTargets: string[],
  approvedEmailCount: number
) {
  const checks = result.checks;

  return {
    id: crypto.randomUUID(),
    practice_id: practiceId,
    source,
    score: result.overall_score,
    category_scores: {
      ssl: scoreSsl(checks.ssl),
      dns: scoreDns(checks.dns),
      email: scoreEmail(checks.email_security),
      ports: scorePorts(checks.ports),
      reputation: scoreReputation(checks.reputation),
      leaks: scoreLeaks(checks.leaks)
    },
    ssl: {
      valid: checks.ssl.valid,
      expires_at: checks.ssl.expires_at,
      days_remaining: checks.ssl.days_remaining,
      issuer: checks.ssl.issuer,
      grade: checks.ssl.grade
    },
    email_security: {
      spf: checks.email_security.spf.exists && checks.email_security.spf.valid,
      dkim: checks.email_security.dkim.exists && checks.email_security.dkim.valid,
      dmarc: checks.email_security.dmarc.exists && checks.email_security.dmarc.policy !== "none"
    },
    devices: {
      known: 0,
      unknown: 0
    },
    checks: {
      ...checks,
      monitoring_targets: monitoredTargets,
      approved_email_count: approvedEmailCount,
      comparison: {
        current: comparison.current,
        previous: comparison.previous,
        states: comparison.states,
        resolved_findings: comparison.resolved_findings
      }
    },
    checked_at: result.timestamp
  };
}

function buildMonitoringEvents(result: ExternalCheckResult, modules: MonitoringModule[], comparison: MonitoringComparison) {
  const events: Array<{
    id: string;
    practice_id: string;
    type: "ssl_expiry" | "dmarc_missing" | "leak_detected" | "port_open" | "domain_blacklisted" | "dns_changed" | "monitoring_run";
    severity: FindingSeverity;
    title: string;
    message: string;
    details: Record<string, unknown>;
    created_at: string;
  }> = [];
  const checks = result.checks;
  const timestamp = result.timestamp;

  if (
    modules.includes("ssl_check") &&
    checks.ssl.days_remaining !== null &&
    checks.ssl.days_remaining <= 14
  ) {
    events.push({
      id: crypto.randomUUID(),
      practice_id: "",
      type: "ssl_expiry",
      severity: "critical",
      title: "SSL-Zertifikat läuft in 14 Tagen ab",
      message: `Das Zertifikat für ${result.domain} läuft in ${checks.ssl.days_remaining} Tagen ab.`,
      details: { days_remaining: checks.ssl.days_remaining, expires_at: checks.ssl.expires_at, risk_state: comparison.states["ssl_expiry"] ?? "new" },
      created_at: timestamp
    });
  }

  if (modules.includes("ssl_check") && comparison.certificate_changed) {
    events.push({
      id: crypto.randomUUID(),
      practice_id: "",
      type: "ssl_expiry",
      severity: "info",
      title: "Zertifikatsänderung erkannt",
      message: `Das TLS-Zertifikat oder der Aussteller für ${result.domain} hat sich gegenüber dem letzten Lauf geändert.`,
      details: { risk_state: "new", current: comparison.current.cert_fingerprint, previous: comparison.previous?.cert_fingerprint ?? null },
      created_at: timestamp
    });
  }

  if (modules.includes("dns_check") && !checks.email_security.dmarc.exists) {
    events.push({
      id: crypto.randomUUID(),
      practice_id: "",
      type: "dmarc_missing",
      severity: "critical",
      title: "DMARC-Eintrag wurde entfernt",
      message: "Für die Praxis-Domain wurde kein DMARC-Eintrag gefunden.",
      details: { domain: result.domain, risk_state: comparison.states["dmarc_missing"] ?? "new" },
      created_at: timestamp
    });
  }

  if (modules.includes("dns_check") && comparison.dmarc_worsened) {
    events.push({
      id: crypto.randomUUID(),
      practice_id: "",
      type: "dmarc_missing",
      severity: "critical",
      title: "DMARC-Verschlechterung erkannt",
      message: "Die DMARC-Policy ist schwächer als im vorherigen Monitoring-Lauf.",
      details: { previous_policy: comparison.previous?.dmarc_policy ?? null, current_policy: comparison.current.dmarc_policy, risk_state: "new" },
      created_at: timestamp
    });
  }

  if (modules.includes("dns_check") && comparison.dns_changed) {
    events.push({
      id: crypto.randomUUID(),
      practice_id: "",
      type: "dns_changed",
      severity: "warning",
      title: "DNS-Änderung erkannt",
      message: "DNS-Antworten für überwachte Domains oder Subdomains haben sich gegenüber dem letzten Lauf geändert.",
      details: { previous_fingerprint: comparison.previous?.dns_fingerprint ?? null, current_fingerprint: comparison.current.dns_fingerprint, risk_state: "new" },
      created_at: timestamp
    });
  }

  if (modules.includes("leak_check") && checks.leaks.email_found) {
    events.push({
      id: crypto.randomUUID(),
      practice_id: "",
      type: "leak_detected",
      severity: "critical",
      title: "Neuer Datenleck mit Praxis-E-Mail gefunden",
      message: `${checks.leaks.breach_count} bekannte Datenleck-Einträge betreffen die geprüfte E-Mail.`,
      details: { breach_count: checks.leaks.breach_count, breaches: checks.leaks.breaches, risk_state: comparison.states["leak_detected"] ?? "new" },
      created_at: timestamp
    });
  }

  if (modules.includes("port_scan")) {
    for (const port of checks.ports.open_ports.filter((item) => item.severity === "critical")) {
      const riskState: RiskHistoryState = comparison.new_ports.includes(port.port)
        ? "new"
        : comparison.recurring_ports.includes(port.port)
          ? "recurring"
          : "unchanged";

      events.push({
        id: crypto.randomUUID(),
        practice_id: "",
        type: "port_open",
        severity: "critical",
        title: riskState === "new" ? "Neuer offener kritischer Port erkannt" : "Kritischer Port weiterhin offen",
        message: `${port.service} ist auf Port ${port.port}/${port.protocol} öffentlich erreichbar.`,
        details: { ...(port as unknown as Record<string, unknown>), risk_state: riskState },
        created_at: timestamp
      });
    }
  }

  if (modules.includes("reputation_check") && checks.reputation.blacklisted) {
    events.push({
      id: crypto.randomUUID(),
      practice_id: "",
      type: "domain_blacklisted",
      severity: "critical",
      title: "Domain auf Blacklist eingetragen",
      message: `${result.domain} ist bei ${checks.reputation.blacklists.length} Reputation-Quelle(n) auffällig.`,
      details: { blacklists: checks.reputation.blacklists, risk_state: comparison.states["domain_blacklisted"] ?? "new" },
      created_at: timestamp
    });
  }

  for (const finding of comparison.resolved_findings) {
    events.push({
      id: crypto.randomUUID(),
      practice_id: "",
      type: "monitoring_run",
      severity: "info",
      title: "Befund behoben",
      message: `Der vorherige Befund ${finding} ist im aktuellen Lauf nicht mehr sichtbar.`,
      details: { finding, risk_state: "resolved" },
      created_at: timestamp
    });
  }

  if (events.length === 0) {
    events.push({
      id: crypto.randomUUID(),
      practice_id: "",
      type: "monitoring_run",
      severity: result.critical_count > 0 ? "warning" : "info",
      title: "Monitoring-Lauf abgeschlossen",
      message: `${result.critical_count} kritische und ${result.warning_count} Warn-Ereignisse im aktuellen Lauf.`,
      details: { score: result.overall_score, risk_state: result.critical_count > 0 || result.warning_count > 0 ? "unchanged" : "unchanged" },
      created_at: timestamp
    });
  }

  return events;
}

function monitoringTargetDomains(payload: MonitoringRunRequest, primaryDomain: string) {
  return uniqueDomains([
    primaryDomain,
    ...(payload.domains ?? []),
    ...(payload.subdomains ?? [])
  ]).slice(0, 25);
}

function aggregateMonitoringResult(results: ExternalCheckResult[]): ExternalCheckResult {
  const [primary, ...additional] = results;
  if (!primary) {
    throw new Error("No monitoring result available");
  }
  const allFindings = results.flatMap((result) =>
    result.findings.map((finding) => ({
      ...finding,
      id: `${result.domain}:${finding.id}`,
      title: result.domain === primary.domain ? finding.title : `${result.domain}: ${finding.title}`
    }))
  );
  const critical_count = allFindings.filter((finding) => finding.severity === "critical").length;
  const warning_count = allFindings.filter((finding) => finding.severity === "warning").length;
  const overall_score = Math.min(primary.overall_score, ...additional.map((result) => result.overall_score));
  const openPorts = results.flatMap((result) =>
    result.checks.ports.open_ports.map((port) => ({
      ...port,
      service: result.domain === primary.domain ? port.service : `${result.domain} ${port.service}`
    }))
  );
  const knownVulnerabilities = results.flatMap((result) =>
    result.checks.ports.known_vulnerabilities.map((vulnerability) => ({
      ...vulnerability,
      summary: result.domain === primary.domain ? vulnerability.summary : `${result.domain}: ${vulnerability.summary}`
    }))
  );

  return {
    ...primary,
    checks: {
      ...primary.checks,
      ports: {
        open_ports: openPorts,
        known_vulnerabilities: knownVulnerabilities
      }
    },
    overall_score,
    critical_count,
    warning_count,
    findings: allFindings,
    scoreImpact: overall_score - 100
  };
}

function buildMonitoringComparison(results: ExternalCheckResult[], previous: MonitoringComparisonSummary | null): MonitoringComparison {
  const current = buildMonitoringComparisonSummary(results);
  const previousFindings = new Set(previous?.findings ?? []);
  const currentFindings = new Set(current.findings);
  const states: Record<string, RiskHistoryState> = {};

  current.findings.forEach((finding) => {
    states[finding] = previousFindings.has(finding) ? "recurring" : "new";
  });
  const resolved_findings = [...previousFindings].filter((finding) => !currentFindings.has(finding));
  resolved_findings.forEach((finding) => {
    states[finding] = "resolved";
  });
  if (previous) {
    ["dns_fingerprint", "cert_fingerprint"].forEach((key) => {
      const stateKey = key === "dns_fingerprint" ? "dns_changed" : "certificate_changed";
      states[stateKey] = previous[key as keyof MonitoringComparisonSummary] === current[key as keyof MonitoringComparisonSummary] ? "unchanged" : "new";
    });
  }
  const previousPorts = new Set(previous?.critical_ports ?? []);
  const currentPorts = new Set(current.critical_ports);

  return {
    previous,
    current,
    states,
    resolved_findings,
    dns_changed: Boolean(previous && previous.dns_fingerprint !== current.dns_fingerprint),
    dmarc_worsened: Boolean(previous && dmarcRank(current.dmarc_policy, current.dmarc_exists) < dmarcRank(previous.dmarc_policy, previous.dmarc_exists)),
    certificate_changed: Boolean(previous && previous.cert_fingerprint !== current.cert_fingerprint),
    new_ports: [...currentPorts].filter((port) => !previousPorts.has(port)),
    recurring_ports: [...currentPorts].filter((port) => previousPorts.has(port))
  };
}

function buildMonitoringComparisonSummary(results: ExternalCheckResult[]): MonitoringComparisonSummary {
  const criticalPorts = new Set<number>();
  const dnsParts: string[] = [];
  const certParts: string[] = [];
  const findings = new Set<string>();
  let weakestDmarcPolicy: EmailSecurityCheck["dmarc"]["policy"] = "reject";
  let dmarcExists = true;

  results.forEach((result) => {
    result.checks.ports.open_ports
      .filter((port) => port.severity === "critical")
      .forEach((port) => criticalPorts.add(port.port));
    dnsParts.push(`${result.domain}:${[
      ...result.checks.dns.a_records,
      ...result.checks.dns.aaaa_records,
      ...result.checks.dns.cname_records,
      ...result.checks.dns.ns_records,
      ...result.checks.email_security.mx_records.records
    ].sort().join(",")}`);
    certParts.push(`${result.domain}:${result.checks.ssl.issuer}:${result.checks.ssl.expires_at}:${result.checks.ssl.grade}`);
    result.findings
      .filter((finding) => finding.severity === "critical" || finding.severity === "warning")
      .forEach((finding) => findings.add(finding.id.includes(":") ? finding.id : `${result.domain}:${finding.id}`));
    dmarcExists = dmarcExists && result.checks.email_security.dmarc.exists;
    if (dmarcRank(result.checks.email_security.dmarc.policy, result.checks.email_security.dmarc.exists) < dmarcRank(weakestDmarcPolicy, true)) {
      weakestDmarcPolicy = result.checks.email_security.dmarc.policy;
    }
  });

  const first = results[0];
  return {
    critical_ports: [...criticalPorts].sort((left, right) => left - right),
    dns_fingerprint: stableFingerprint(dnsParts),
    dmarc_policy: weakestDmarcPolicy,
    dmarc_exists: dmarcExists,
    cert_fingerprint: stableFingerprint(certParts),
    ssl_expires_at: first?.checks.ssl.expires_at ?? null,
    ssl_issuer: first?.checks.ssl.issuer ?? "unknown",
    findings: [...findings].sort()
  };
}

function dmarcRank(policy: EmailSecurityCheck["dmarc"]["policy"], exists: boolean) {
  if (!exists) return 0;
  if (policy === "reject") return 3;
  if (policy === "quarantine") return 2;
  if (policy === "none") return 1;
  return 0;
}

function stableFingerprint(parts: string[]) {
  return parts.sort().join("|");
}

async function persistMonitoringResult(
  env: Env,
  snapshot: ReturnType<typeof buildMonitoringSnapshot>,
  events: ReturnType<typeof buildMonitoringEvents>
) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return;

  const encryptedChecks = await encryptJson(env, snapshot.checks);
  const payloadHash = await sha256Json(snapshot.checks);
  const dbSnapshot = {
    ...snapshot,
    checks: {
      categories: snapshot.category_scores,
      checked_at: snapshot.checked_at,
      comparison: asRecordOrNull(snapshot.checks.comparison)
    },
    encrypted_checks: encryptedChecks,
    payload_sha256: payloadHash
  };

  await supabaseRest(env, "/rest/v1/monitoring_snapshots", {
    method: "POST",
    body: dbSnapshot
  });

  const eventsWithPractice = events.map((event) => ({
    ...event,
    practice_id: snapshot.practice_id
  }));

  await supabaseRest(env, "/rest/v1/monitoring_events", {
    method: "POST",
    body: eventsWithPractice
  });
}

async function fetchMonitoringTargets(env: Env): Promise<PracticeMonitorTarget[]> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return [];

  const data = await supabaseRest<unknown[]>(env, "/rest/v1/practices?select=id,domain,email&domain=not.is.null", {
    method: "GET"
  });

  return data
    .map((item) => asRecordOrNull(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item) => ({
      id: typeof item.id === "string" ? item.id : "",
      domain: typeof item.domain === "string" ? item.domain : "",
      email: typeof item.email === "string" ? item.email : undefined
    }))
    .filter((target) => isUuid(target.id) && Boolean(normalizeDomain(target.domain)));
}

async function fetchPreviousMonitoringSummary(env: Env, practiceId: string): Promise<MonitoringComparisonSummary | null> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !isUuid(practiceId)) return null;

  try {
    const data = await supabaseRest<unknown[]>(
      env,
      `/rest/v1/monitoring_snapshots?select=checks&practice_id=eq.${encodeURIComponent(practiceId)}&order=checked_at.desc&limit=1`,
      { method: "GET" }
    );
    const previous = asRecordOrNull(data[0]);
    const checks = asRecordOrNull(previous?.checks);
    const comparison = asRecordOrNull(checks?.comparison);
    const current = asRecordOrNull(comparison?.current);
    if (!current) return null;
    return readMonitoringComparisonSummary(current);
  } catch (error) {
    rethrowOutboundTimeout(error);
    return null;
  }
}

async function supabaseRest<T>(
  env: Env,
  path: string,
  options: { method: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown; prefer?: string }
): Promise<T> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase service credentials are not configured");
  }

  const response = await fetchWithTimeout(
    `${env.SUPABASE_URL}${path}`,
    {
      method: options.method,
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        "content-type": "application/json",
        prefer: options.prefer ?? "return=minimal"
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    },
    { service: "supabase", timeoutMs: OUTBOUND_TIMEOUT_MS.supabase }
  );

  if (!response.ok) {
    throw new Error(`Supabase request failed with ${response.status}`);
  }

  if (response.status === 204) return undefined as T;
  const text = await response.text();
  if (!text) return undefined as T;

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return text as T;
  return JSON.parse(text) as T;
}

function scoreSsl(ssl: SSLCheck) {
  let score = ssl.valid ? 100 : 30;
  if (ssl.days_remaining !== null && ssl.days_remaining <= 14) score -= 45;
  else if (ssl.days_remaining !== null && ssl.days_remaining <= 30) score -= 20;
  if (!ssl.hsts_enabled) score -= 10;
  if (ssl.vulnerabilities.length > 0 || ssl.grade === "F") score -= 35;
  return clampScore(score);
}

function scoreDns(dns: DNSCheck) {
  let score = 70;
  if (dns.a_records.length > 0 || dns.aaaa_records.length > 0) score += 15;
  if (dns.ns_records.length >= 2) score += 10;
  if (dns.caa_records.length > 0) score += 5;
  return clampScore(score);
}

function scoreEmail(email: EmailSecurityCheck) {
  return clampScore(
    (email.spf.exists && email.spf.valid ? 30 : 0) +
      (email.dkim.exists && email.dkim.valid ? 25 : 0) +
      (email.spf.alignment === "pass" ? 8 : email.spf.alignment === "warning" ? 4 : 0) +
      (email.dkim.alignment === "pass" ? 8 : email.dkim.alignment === "warning" ? 4 : 0) +
      (email.dmarc.exists ? 16 : 0) +
      (email.dmarc.policy === "reject" ? 15 : email.dmarc.policy === "quarantine" ? 10 : 0) +
      (email.dmarc.alignment_ready ? 8 : 0) +
      (email.mta_sts.exists && email.mta_sts.mode === "enforce" ? 8 : 0) +
      (email.tls_rpt.exists ? 4 : 0) +
      (email.caa.exists ? 3 : 0) +
      (email.mx_records.secure ? 10 : 0)
  );
}

function scorePorts(ports: PortCheck) {
  const critical = ports.open_ports.filter((port) => port.severity === "critical").length;
  const warning = ports.open_ports.filter((port) => port.severity === "warning").length;
  return clampScore(100 - critical * 28 - warning * 12 - ports.known_vulnerabilities.length * 16);
}

function scoreReputation(reputation: ReputationCheck) {
  return clampScore(100 - (reputation.blacklisted ? 65 : 0) - (reputation.malware_hosting ? 40 : 0) - reputation.phishing_reports * 8);
}

function scoreLeaks(leaks: LeakCheck) {
  return clampScore(100 - (leaks.email_found ? 55 : 0) - (leaks.domain_found ? 20 : 0) - leaks.paste_count * 5);
}

async function checkSsl(domain: string, context: ProviderExecutionContext): Promise<SSLCheck> {
  const https = await checkHttpsSignal(domain);
  const fallback: SSLCheck = {
    valid: https.reachable,
    issuer: "unknown",
    expires_at: null,
    days_remaining: null,
    protocol: "unknown",
    grade: https.reachable ? "B" : "C",
    hsts_enabled: https.hsts,
    vulnerabilities: []
  };

  try {
    const response = await fetchWithTimeout(
      `https://api.ssllabs.com/api/v3/analyze?host=${encodeURIComponent(domain)}&publish=off&all=done&fromCache=on&maxAge=24`,
      {},
      { service: "ssl-labs", timeoutMs: context.timeoutMs }
    );

    if (!response.ok) return fallback;

    const data = (await response.json()) as {
      status?: string;
      endpoints?: Array<{
        grade?: string;
        details?: {
          protocols?: Array<{ name?: string; version?: string }>;
          cert?: {
            notAfter?: number;
            issuerSubject?: string;
          };
          poodle?: boolean;
          beast?: boolean;
          heartbleed?: boolean;
          drownVulnerable?: boolean;
          freak?: boolean;
          logjam?: boolean;
        };
      }>;
    };
    const endpoint = data.endpoints?.[0];
    const details = endpoint?.details;
    const notAfter = details?.cert?.notAfter;
    const expiresAt = notAfter ? new Date(notAfter).toISOString() : null;
    const daysRemaining = notAfter ? Math.ceil((notAfter - Date.now()) / 86_400_000) : null;
    const vulnerabilities = [
      details?.poodle ? "POODLE" : null,
      details?.beast ? "BEAST" : null,
      details?.heartbleed ? "HEARTBLEED" : null,
      details?.drownVulnerable ? "DROWN" : null,
      details?.freak ? "FREAK" : null,
      details?.logjam ? "LOGJAM" : null
    ].filter(Boolean) as string[];
    const protocol = bestTlsProtocol(details?.protocols ?? []);

    return {
      valid: Boolean(endpoint && !endpoint.grade?.startsWith("T") && (daysRemaining === null || daysRemaining > 0)),
      issuer: details?.cert?.issuerSubject ?? "unknown",
      expires_at: expiresAt,
      days_remaining: daysRemaining,
      protocol,
      grade: normalizeSslGrade(endpoint?.grade),
      hsts_enabled: https.hsts,
      vulnerabilities
    };
  } catch (error) {
    markProviderUnavailable(context, "sslLabs", error);
    return fallback;
  }
}

async function checkHttpsSignal(domain: string) {
  try {
    const response = await fetch(`https://${domain}`, {
      method: "HEAD",
      redirect: "follow"
    });

    return {
      reachable: response.ok,
      hsts: response.headers.has("strict-transport-security")
    };
  } catch {
    return {
      reachable: false,
      hsts: false
    };
  }
}

async function checkDns(domain: string, context: ProviderExecutionContext): Promise<DNSCheck> {
  const [a, aaaa, cname, ns, txt, caa] = await Promise.all([
    queryDns(domain, "A", context),
    queryDns(domain, "AAAA", context),
    queryDns(domain, "CNAME", context),
    queryDns(domain, "NS", context),
    queryDns(domain, "TXT", context),
    queryDns(domain, "CAA", context)
  ]);

  return {
    a_records: a,
    aaaa_records: aaaa,
    cname_records: cname,
    ns_records: ns,
    txt_records: txt,
    caa_records: caa
  };
}

async function checkEmailSecurity(domain: string, context: ProviderExecutionContext): Promise<EmailSecurityCheck> {
  const [txtRecords, mxRecords, dmarcRecords, mtaStsRecords, tlsRptRecords, caaRecords, dkim] = await Promise.all([
    queryDns(domain, "TXT", context),
    queryDns(domain, "MX", context),
    queryDns(`_dmarc.${domain}`, "TXT", context),
    queryDns(`_mta-sts.${domain}`, "TXT", context),
    queryDns(`_smtp._tls.${domain}`, "TXT", context),
    queryDns(domain, "CAA", context),
    findDkim(domain, context)
  ]);
  const spfRecords = txtRecords.filter((record) => record.toLowerCase().startsWith("v=spf1"));
  const spfIssues = getSpfIssues(spfRecords);
  const dmarcRecord = dmarcRecords.find((record) => record.toLowerCase().startsWith("v=dmarc1")) ?? "";
  const policy = getDmarcPolicy(dmarcRecord);
  const rua = getTagValue(dmarcRecord, "rua");
  const spfAlignmentMode = getAlignmentMode(dmarcRecord, "aspf");
  const dkimAlignmentMode = getAlignmentMode(dmarcRecord, "adkim");
  const mtaStsRecord = mtaStsRecords.find((record) => record.toLowerCase().startsWith("v=stsv1")) ?? "";
  const tlsRptRecord = tlsRptRecords.find((record) => record.toLowerCase().startsWith("v=tlsrptv1")) ?? "";
  const mtaStsMode = getTagValue(mtaStsRecord, "mode")?.toLowerCase() ?? null;

  return {
    spf: {
      exists: spfRecords.length > 0,
      valid: spfRecords.length === 1 && spfIssues.length === 0,
      record: spfRecords[0] ?? "",
      issues: spfIssues,
      alignment: spfRecords.length > 0 && Boolean(dmarcRecord) ? "pass" : spfRecords.length > 0 ? "warning" : "fail",
      alignment_mode: spfAlignmentMode
    },
    dkim: {
      ...dkim,
      alignment: dkim.exists && Boolean(dmarcRecord) ? "pass" : dkim.exists ? "warning" : "fail",
      alignment_mode: dkimAlignmentMode
    },
    dmarc: {
      exists: Boolean(dmarcRecord),
      policy,
      rua,
      spf_alignment_mode: spfAlignmentMode,
      dkim_alignment_mode: dkimAlignmentMode,
      alignment_ready: Boolean(dmarcRecord) && (spfRecords.length > 0 || dkim.exists),
      recommendation: getDmarcRecommendation(policy)
    },
    mta_sts: {
      exists: Boolean(mtaStsRecord),
      mode: mtaStsMode === "enforce" || mtaStsMode === "testing" || mtaStsMode === "none" ? mtaStsMode : null,
      record: mtaStsRecord
    },
    tls_rpt: {
      exists: Boolean(tlsRptRecord),
      rua: getTagValue(tlsRptRecord, "rua"),
      record: tlsRptRecord
    },
    caa: {
      exists: caaRecords.length > 0,
      records: caaRecords
    },
    mx_records: {
      exists: mxRecords.length > 0,
      records: mxRecords,
      secure:
        mxRecords.length > 0 &&
        (mtaStsRecord.length > 0 || tlsRptRecord.length > 0)
    }
  };
}

async function checkPorts(domain: string, apiKey: string | undefined, context: ProviderExecutionContext): Promise<PortCheck> {
  if (!apiKey) {
    return { open_ports: [], known_vulnerabilities: [] };
  }

  try {
    const response = await fetchWithTimeout(
      `https://api.shodan.io/shodan/host/search?key=${encodeURIComponent(apiKey)}&query=${encodeURIComponent(
        `hostname:${domain}`
      )}`,
      {},
      { service: "shodan", timeoutMs: context.timeoutMs }
    );

    if (!response.ok) {
      return { open_ports: [], known_vulnerabilities: [] };
    }

    const data = (await response.json()) as {
      matches?: Array<{
        port?: number;
        transport?: string;
        product?: string;
        _shodan?: { module?: string };
        data?: string;
        vulns?: Record<string, { cvss?: number; summary?: string }>;
      }>;
    };
    const ports = new Map<string, OpenPort>();
    const vulnerabilities = new Map<string, ShodanVuln>();

    for (const match of data.matches ?? []) {
      if (!match.port) continue;

      const service = match.product ?? match._shodan?.module ?? "unknown";
      const severity = severityForPort(match.port);
      ports.set(`${match.transport ?? "tcp"}:${match.port}`, {
        port: match.port,
        protocol: match.transport ?? "tcp",
        service,
        severity,
        banner: trimBanner(match.data)
      });

      for (const [id, vuln] of Object.entries(match.vulns ?? {})) {
        vulnerabilities.set(`${id}:${match.port}`, {
          id,
          cvss: typeof vuln.cvss === "number" ? vuln.cvss : null,
          summary: vuln.summary ?? "",
          port: match.port
        });
      }
    }

    return {
      open_ports: [...ports.values()].sort((left, right) => left.port - right.port),
      known_vulnerabilities: [...vulnerabilities.values()].sort((left, right) => (right.cvss ?? 0) - (left.cvss ?? 0))
    };
  } catch (error) {
    markProviderUnavailable(context, "shodan", error);
    return { open_ports: [], known_vulnerabilities: [] };
  }
}

async function checkLeaks(
  domain: string,
  email: string | string[] | null,
  apiKey: string | undefined,
  context: ProviderExecutionContext
): Promise<LeakCheck> {
  const empty: LeakCheck = {
    email_found: false,
    breach_count: 0,
    breaches: [],
    domain_found: false,
    paste_count: 0
  };

  if (!apiKey) return empty;

  const emails = uniqueEmails(Array.isArray(email) ? email : email ? [email] : []);

  try {
    const accountResults = await Promise.all(
      emails.map(async (mail) => {
        const [breachesResponse, pastesResponse] = await Promise.all([
          fetchWithTimeout(
            `https://haveibeenpwned.com/api/v3/breachedaccount/${encodeURIComponent(mail)}?truncateResponse=false`,
            { headers: hibpHeaders(apiKey) },
            { service: "hibp", timeoutMs: context.timeoutMs }
          ),
          fetchWithTimeout(
            `https://haveibeenpwned.com/api/v3/pasteaccount/${encodeURIComponent(mail)}`,
            { headers: hibpHeaders(apiKey) },
            { service: "hibp", timeoutMs: context.timeoutMs }
          )
        ]);
        const breaches =
          breachesResponse.status === 404 || !breachesResponse.ok
            ? []
            : ((await breachesResponse.json()) as Array<{ Name?: string; BreachDate?: string; DataClasses?: string[] }>);
        const pastes = pastesResponse.status === 404 || !pastesResponse.ok ? [] : ((await pastesResponse.json()) as unknown[]);
        return { breaches, pasteCount: pastes.length };
      })
    );
    const domainBreachesResponse = await fetchWithTimeout(
      `https://haveibeenpwned.com/api/v3/breaches?domain=${encodeURIComponent(domain)}`,
      { headers: hibpHeaders(apiKey) },
      { service: "hibp", timeoutMs: context.timeoutMs }
    );
    const breaches = accountResults.flatMap((result) => result.breaches);
    const pasteCount = accountResults.reduce((sum, result) => sum + result.pasteCount, 0);
    const domainBreaches =
      domainBreachesResponse.status === 404 || !domainBreachesResponse.ok
        ? []
        : ((await domainBreachesResponse.json()) as unknown[]);

    return {
      email_found: breaches.length > 0,
      breach_count: breaches.length,
      breaches: breaches.map((breach) => ({
        name: breach.Name ?? "Unknown breach",
        date: breach.BreachDate ?? "",
        data_types: breach.DataClasses ?? []
      })),
      domain_found: domainBreaches.length > 0,
      paste_count: pasteCount
    };
  } catch (error) {
    markProviderUnavailable(context, "hibp", error);
    return empty;
  }
}

async function checkReputation(domain: string, env: Env, context: ProviderExecutionContext): Promise<ReputationCheck> {
  const [virusTotal, securityTrails] = await Promise.all([
    checkVirusTotal(domain, env.VIRUSTOTAL_API_KEY, context),
    checkSecurityTrailsHistory(domain, env.SECURITYTRAILS_API_KEY, context)
  ]);

  return {
    blacklisted: virusTotal.blacklists.length > 0,
    blacklists: virusTotal.blacklists,
    malware_hosting: virusTotal.malicious > 0,
    phishing_reports: virusTotal.phishing,
    dns_history: securityTrails
  };
}

async function checkVirusTotal(domain: string, apiKey: string | undefined, context: ProviderExecutionContext) {
  if (!apiKey) {
    return { blacklists: [] as string[], malicious: 0, phishing: 0 };
  }

  try {
    const response = await fetchWithTimeout(
      `https://www.virustotal.com/api/v3/domains/${encodeURIComponent(domain)}`,
      { headers: { "x-apikey": apiKey } },
      { service: "virus-total", timeoutMs: context.timeoutMs }
    );

    if (!response.ok) {
      return { blacklists: [], malicious: 0, phishing: 0 };
    }

    const data = (await response.json()) as {
      data?: {
        attributes?: {
          last_analysis_stats?: { malicious?: number; suspicious?: number };
          last_analysis_results?: Record<string, { category?: string; result?: string }>;
          popular_threat_classification?: {
            suggested_threat_label?: string;
            popular_threat_category?: Array<{ value?: string; count?: number }>;
          };
        };
      };
    };
    const attributes = data.data?.attributes;
    const results = attributes?.last_analysis_results ?? {};
    const blacklists = Object.entries(results)
      .filter(([, result]) => result.category === "malicious" || result.category === "suspicious")
      .map(([engine, result]) => `${engine}: ${result.result ?? result.category}`);
    const threatCategories = attributes?.popular_threat_classification?.popular_threat_category ?? [];
    const phishing = threatCategories
      .filter((category) => category.value?.toLowerCase().includes("phishing"))
      .reduce((sum, category) => sum + (category.count ?? 0), 0);

    return {
      blacklists,
      malicious: attributes?.last_analysis_stats?.malicious ?? 0,
      phishing
    };
  } catch (error) {
    markProviderUnavailable(context, "virusTotal", error);
    return { blacklists: [], malicious: 0, phishing: 0 };
  }
}

async function checkSecurityTrailsHistory(
  domain: string,
  apiKey: string | undefined,
  context: ProviderExecutionContext
): Promise<DNSHistoryEntry[]> {
  if (!apiKey) return [];

  try {
    const response = await fetchWithTimeout(
      `https://api.securitytrails.com/v1/history/${encodeURIComponent(domain)}/dns/a`,
      { headers: { APIKEY: apiKey } },
      { service: "security-trails", timeoutMs: context.timeoutMs }
    );

    if (!response.ok) return [];

    const data = (await response.json()) as {
      records?: Array<{
        first_seen?: string;
        last_seen?: string;
        values?: Array<{ ip?: string; value?: string }>;
      }>;
    };

    return (data.records ?? []).flatMap((record) =>
      (record.values ?? []).map((value) => ({
        type: "A",
        value: value.ip ?? value.value ?? "",
        first_seen: record.first_seen,
        last_seen: record.last_seen
      }))
    );
  } catch (error) {
    markProviderUnavailable(context, "securityTrails", error);
    return [];
  }
}

async function checkSubdomains(domain: string, env: Env, context: ProviderExecutionContext): Promise<SubdomainDiscoveryCheck> {
  const securityTrails = await discoverSecurityTrailsSubdomains(domain, env.SECURITYTRAILS_API_KEY, context);
  const discovered = securityTrails.length > 0 ? securityTrails : await discoverCommonDnsSubdomains(domain, context);
  const source = securityTrails.length > 0 ? "securitytrails" : discovered.length > 0 ? "cloudflare_dns_common" : "none";
  const evaluated = await Promise.all(
    discovered.slice(0, 12).map(async (subdomain) =>
      evaluateSubdomain(subdomain, source === "securitytrails" ? "securitytrails" : "cloudflare_dns_common", context)
    )
  );

  return {
    status: securityTrails.length > 0 ? "checked" : "partial",
    source: source === "none" ? "cloudflare_dns_common" : source,
    discovered,
    evaluated,
    not_checked_reason: discovered.length === 0 && !env.SECURITYTRAILS_API_KEY ? "SECURITYTRAILS_API_KEY fehlt; nur begrenzte DNS-Fallbacks möglich." : undefined
  };
}

async function discoverSecurityTrailsSubdomains(
  domain: string,
  apiKey: string | undefined,
  context: ProviderExecutionContext
) {
  if (!apiKey) return [];

  try {
    const response = await fetchWithTimeout(
      `https://api.securitytrails.com/v1/domain/${encodeURIComponent(domain)}/subdomains`,
      { headers: { APIKEY: apiKey } },
      { service: "security-trails", timeoutMs: context.timeoutMs }
    );
    if (!response.ok) return [];
    const data = (await response.json()) as { subdomains?: string[] };
    return uniqueDomains((data.subdomains ?? []).map((item) => `${item}.${domain}`));
  } catch (error) {
    markProviderUnavailable(context, "securityTrails", error);
    return [];
  }
}

async function discoverCommonDnsSubdomains(domain: string, context: ProviderExecutionContext) {
  const candidates = ["www", "mail", "webmail", "vpn", "remote", "portal", "app", "cloud", "owa", "autodiscover"].map((item) => `${item}.${domain}`);
  const results = await Promise.all(
    candidates.map(async (candidate) => {
      const [a, aaaa, cname] = await Promise.all([
        queryDns(candidate, "A", context),
        queryDns(candidate, "AAAA", context),
        queryDns(candidate, "CNAME", context)
      ]);
      return a.length > 0 || aaaa.length > 0 || cname.length > 0 ? candidate : null;
    })
  );
  return uniqueDomains(results.filter((item): item is string => Boolean(item)));
}

async function evaluateSubdomain(
  domain: string,
  source: SubdomainSecurityCheck["source"],
  context: ProviderExecutionContext
): Promise<SubdomainSecurityCheck> {
  const [dns, ssl] = await Promise.all([checkDns(domain, context), checkSsl(domain, context)]);
  const findings: SecurityFinding[] = [];
  if (dns.a_records.length === 0 && dns.aaaa_records.length === 0 && dns.cname_records.length === 0) {
    findings.push({ id: `subdomain-dns-${domain}`, severity: "warning", title: `${domain}: no DNS target found` });
  }
  if (!ssl.valid) {
    findings.push({ id: `subdomain-ssl-${domain}`, severity: "warning", title: `${domain}: TLS certificate is not valid or not reachable` });
  }
  if (ssl.vulnerabilities.length > 0 || ssl.grade === "F") {
    findings.push({ id: `subdomain-tls-${domain}`, severity: "critical", title: `${domain}: TLS scan reports weak configuration` });
  }
  return {
    domain,
    source,
    checks: { dns, ssl },
    score: calculateOverallScore(
      findings.filter((finding) => finding.severity === "critical").length,
      findings.filter((finding) => finding.severity === "warning").length,
      findings
    ),
    findings
  };
}

async function queryDns(name: string, type: string, context: ProviderExecutionContext): Promise<string[]> {
  try {
    const response = await fetchWithTimeout(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${encodeURIComponent(type)}`,
      { headers: { accept: "application/dns-json" } },
      { service: "cloudflare-dns", timeoutMs: context.timeoutMs }
    );

    if (!response.ok) return [];

    const data = (await response.json()) as DnsResponse;

    return [
      ...new Set(
        (data.Answer ?? [])
          .filter((answer) => answer.data && answer.type === DNS_TYPE_CODES[type])
          .map((answer) => normalizeDnsValue(type, answer.data))
          .filter(Boolean)
      )
    ];
  } catch (error) {
    markProviderUnavailable(context, "cloudflareDns", error);
    return [];
  }
}

async function findDkim(domain: string, context: ProviderExecutionContext) {
  const selectors = ["selector1", "selector2", "google", "default", "dkim", "k1", "s1", "s2", "mail", "mandrill", "zoho"];
  const results = await Promise.all(
    selectors.map(async (selector) => ({
      selector,
      records: await queryDns(`${selector}._domainkey.${domain}`, "TXT", context)
    }))
  );
  const found = results.find((result) =>
    result.records.some((record) => record.toLowerCase().includes("v=dkim1") || record.toLowerCase().includes("k=rsa"))
  );

  return {
    exists: Boolean(found),
    selector_found: found?.selector ?? null,
    valid: Boolean(found)
  };
}

function createProviderExecutionContext(env: Env): ProviderExecutionContext {
  const configuredTimeout = Number.parseInt(env.SECURITY_PROVIDER_TIMEOUT_MS ?? "", 10);
  return {
    statuses: {},
    timeoutMs:
      Number.isFinite(configuredTimeout) && configuredTimeout > 0
        ? configuredTimeout
        : OUTBOUND_TIMEOUT_MS.securityProvider
  };
}

function markProviderUnavailable(
  context: ProviderExecutionContext,
  provider: ProviderName,
  error: unknown
) {
  context.statuses[provider] = "unavailable";
  if (!(error instanceof OutboundRequestTimeoutError)) {
    console.warn("provider_call_failed", {
      provider,
      failure: safeErrorLog(error)
    });
  }
}

function buildProviderStatuses(
  env: Env,
  runtimeStatuses: Partial<Record<ProviderName, ProviderStatus>>,
  runtime: { sslLabs: boolean }
): Record<ProviderName, ProviderStatus> {
  return {
    shodan: runtimeStatuses.shodan ?? (env.SHODAN_API_KEY ? "active" : "not_configured"),
    hibp: runtimeStatuses.hibp ?? (env.HIBP_API_KEY ? "active" : "not_configured"),
    virusTotal: runtimeStatuses.virusTotal ?? (env.VIRUSTOTAL_API_KEY ? "active" : "not_configured"),
    securityTrails: runtimeStatuses.securityTrails ?? (env.SECURITYTRAILS_API_KEY ? "active" : "not_configured"),
    sslLabs: runtimeStatuses.sslLabs ?? (runtime.sslLabs ? "active" : "unavailable"),
    cloudflareDns: runtimeStatuses.cloudflareDns ?? "active"
  };
}

function buildFindings(checks: ExternalCheckResult["checks"], providers: Record<ProviderName, ProviderStatus>): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  for (const [provider, status] of Object.entries(providers) as Array<[ProviderName, ProviderStatus]>) {
    if (status === "not_configured") {
      findings.push({ id: `not-checked-${provider}`, severity: "info", title: `${providerLabel(provider)} wurde nicht geprüft: API-Key fehlt.` });
    } else if (status === "unavailable") {
      findings.push({ id: `unavailable-${provider}`, severity: "info", title: `${providerLabel(provider)} war technisch nicht verfügbar.` });
    }
  }

  if (!checks.ssl.valid) {
    findings.push({ id: "ssl-invalid", severity: "critical", title: "SSL/TLS certificate is invalid or expired" });
  }

  if (checks.ssl.days_remaining !== null && checks.ssl.days_remaining < 30) {
    findings.push({ id: "ssl-expiring", severity: "warning", title: "SSL/TLS certificate expires within 30 days" });
  }

  if (!checks.ssl.hsts_enabled) {
    findings.push({ id: "hsts-missing", severity: "warning", title: "HTTP Strict Transport Security is not enabled" });
  }

  if (checks.ssl.vulnerabilities.length > 0 || checks.ssl.grade === "F") {
    findings.push({ id: "tls-vulnerable", severity: "critical", title: "TLS scan reports critical vulnerabilities" });
  } else if (checks.ssl.grade === "C") {
    findings.push({ id: "tls-weak-grade", severity: "warning", title: "TLS configuration should be hardened" });
  }

  if (!checks.email_security.spf.exists) {
    findings.push({ id: "spf-missing", severity: "warning", title: "SPF record is missing" });
  } else if (!checks.email_security.spf.valid) {
    findings.push({ id: "spf-invalid", severity: "warning", title: "SPF record has configuration issues" });
  }
  if (checks.email_security.spf.alignment !== "pass") {
    findings.push({ id: "spf-alignment", severity: "warning", title: "SPF alignment is not fully evidenced by DMARC policy" });
  }

  if (!checks.email_security.dkim.exists) {
    findings.push({ id: "dkim-missing", severity: "warning", title: "No common DKIM selector was found" });
  }
  if (checks.email_security.dkim.alignment !== "pass") {
    findings.push({ id: "dkim-alignment", severity: "warning", title: "DKIM alignment is not fully evidenced by DMARC policy" });
  }

  if (!checks.email_security.dmarc.exists) {
    findings.push({ id: "dmarc-missing", severity: "critical", title: "DMARC record is missing" });
  } else if (checks.email_security.dmarc.policy === "none") {
    findings.push({ id: "dmarc-policy", severity: "warning", title: "DMARC policy should be quarantine or reject" });
  }
  if (!checks.email_security.dmarc.alignment_ready) {
    findings.push({ id: "dmarc-alignment", severity: "warning", title: "DMARC alignment cannot be confirmed from SPF/DKIM evidence" });
  }
  if (!checks.email_security.mta_sts.exists || checks.email_security.mta_sts.mode !== "enforce") {
    findings.push({ id: "mta-sts-missing", severity: "warning", title: "MTA-STS is missing or not enforced" });
  }
  if (!checks.email_security.tls_rpt.exists) {
    findings.push({ id: "tls-rpt-missing", severity: "warning", title: "TLS-RPT record is missing" });
  }
  if (!checks.email_security.caa.exists) {
    findings.push({ id: "caa-missing", severity: "warning", title: "CAA record is missing" });
  }

  for (const port of checks.ports.open_ports) {
    if (port.severity !== "info") {
      findings.push({
        id: `open-port-${port.port}`,
        severity: port.severity,
        title: `Externally exposed ${port.service} on port ${port.port}`
      });
    }
  }

  for (const vuln of checks.ports.known_vulnerabilities) {
    findings.push({
      id: `vuln-${vuln.id}`,
      severity: (vuln.cvss ?? 0) >= 7 ? "critical" : "warning",
      title: `Known vulnerability ${vuln.id} is visible externally`
    });
  }

  if (checks.leaks.email_found || checks.leaks.domain_found) {
    findings.push({ id: "data-leak", severity: "critical", title: "Public breach data was found for the checked identity" });
  }

  if (checks.reputation.blacklisted || checks.reputation.malware_hosting) {
    findings.push({ id: "domain-reputation", severity: "critical", title: "Domain has malicious or suspicious reputation signals" });
  }

  if (checks.reputation.phishing_reports > 0) {
    findings.push({ id: "phishing-reports", severity: "warning", title: "Phishing reports exist for this domain" });
  }

  for (const subdomain of checks.subdomains.evaluated) {
    for (const finding of subdomain.findings) {
      findings.push(finding);
    }
  }

  return findings;
}

function calculateOverallScore(criticalCount: number, warningCount: number, findings: SecurityFinding[]) {
  const infoCount = findings.filter((finding) => finding.severity === "info" && !isNotCheckedFinding(finding)).length;

  return Math.max(0, Math.min(100, 100 - criticalCount * 18 - warningCount * 8 - infoCount * 2));
}

function isNotCheckedFinding(finding: SecurityFinding) {
  return finding.id.startsWith("not-checked-") || finding.id.startsWith("unavailable-");
}

function normalizeDomain(value?: string) {
  if (!value) return "";

  const withoutProtocol = value.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0].split(":")[0];

  if (!/^(?!-)(?:[a-z0-9-]{1,63}\.)+[a-z]{2,63}$/.test(withoutProtocol)) {
    return "";
  }

  return withoutProtocol;
}

function normalizeEmail(value?: string) {
  if (!value) return null;

  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function normalizeSslGrade(value?: string): SSLCheck["grade"] {
  if (value === "A+" || value === "A" || value === "B" || value === "C") return value;
  return "F";
}

function bestTlsProtocol(protocols: Array<{ name?: string; version?: string }>) {
  const supported = protocols
    .map((protocol) => `${protocol.name ?? ""} ${protocol.version ?? ""}`.trim())
    .filter((protocol) => protocol.toLowerCase().includes("tls"));

  if (supported.some((protocol) => protocol.includes("1.3"))) return "TLS 1.3";
  if (supported.some((protocol) => protocol.includes("1.2"))) return "TLS 1.2";
  return supported[0] ?? "unknown";
}

function normalizeDnsValue(type: string, value: string) {
  const withoutQuotes = value.replace(/^"|"$/g, "").replace(/"\s+"/g, "");

  if (type === "MX") {
    return withoutQuotes.replace(/^\d+\s+/, "").replace(/\.$/, "");
  }

  return withoutQuotes.replace(/\.$/, "");
}

function getSpfIssues(records: string[]) {
  const issues: string[] = [];

  if (records.length === 0) return ["missing_spf"];
  if (records.length > 1) issues.push("multiple_spf_records");

  const record = records[0]?.toLowerCase() ?? "";

  if (!record.includes(" -all") && !record.endsWith("-all")) {
    issues.push("policy_not_strict");
  }

  if (record.includes("+all")) {
    issues.push("allows_all_senders");
  }

  return issues;
}

function getDmarcPolicy(record: string): EmailSecurityCheck["dmarc"]["policy"] {
  const policy = getTagValue(record, "p");

  if (policy === "none" || policy === "quarantine" || policy === "reject") {
    return policy;
  }

  return null;
}

function getAlignmentMode(record: string, tag: "aspf" | "adkim"): "strict" | "relaxed" | null {
  if (!record) return null;
  const value = getTagValue(record, tag);
  if (value === "s") return "strict";
  return "relaxed";
}

function getTagValue(record: string, tag: string) {
  const match = record.match(new RegExp(`(?:^|;)\\s*${tag}=([^;]+)`, "i"));
  return match?.[1]?.trim() ?? null;
}

function getDmarcRecommendation(policy: EmailSecurityCheck["dmarc"]["policy"]) {
  if (policy === "reject") return "DMARC policy is strong. Keep monitoring reports and maintain SPF/DKIM alignment.";
  if (policy === "quarantine") return "Consider moving DMARC from quarantine to reject after monitoring false positives.";
  if (policy === "none") return "Move DMARC from monitoring-only to quarantine, then reject once legitimate senders align.";
  return "Publish a DMARC record with reporting and at least quarantine enforcement.";
}

function severityForPort(port: number): FindingSeverity {
  const critical = new Set([21, 23, 135, 137, 138, 139, 445, 1433, 1521, 3306, 3389, 5432, 5900, 5985, 6379, 9200, 9300, 11211, 27017]);
  const warning = new Set([22, 25, 53, 110, 143, 389, 465, 587, 993, 995, 8080, 8443]);

  if (critical.has(port)) return "critical";
  if (warning.has(port)) return "warning";
  return "info";
}

function trimBanner(value?: string) {
  if (!value) return undefined;

  return value.replace(/\s+/g, " ").trim().slice(0, 240);
}

function hibpHeaders(apiKey: string) {
  return {
    "hibp-api-key": apiKey,
    "user-agent": "PraxisShield external-check"
  };
}

function uniqueDomains(domains: string[]) {
  return [...new Set(domains.map((domain) => normalizeDomain(domain)).filter(Boolean))].sort();
}

function uniqueEmails(emails: string[]) {
  return [...new Set(emails.map((email) => normalizeEmail(email)).filter((email): email is string => Boolean(email)))].sort();
}

function readMonitoringComparisonSummary(value: Record<string, unknown>): MonitoringComparisonSummary {
  return {
    critical_ports: Array.isArray(value.critical_ports)
      ? value.critical_ports.filter((port): port is number => typeof port === "number")
      : [],
    dns_fingerprint: typeof value.dns_fingerprint === "string" ? value.dns_fingerprint : "",
    dmarc_policy:
      value.dmarc_policy === "none" || value.dmarc_policy === "quarantine" || value.dmarc_policy === "reject"
        ? value.dmarc_policy
        : null,
    dmarc_exists: typeof value.dmarc_exists === "boolean" ? value.dmarc_exists : false,
    cert_fingerprint: typeof value.cert_fingerprint === "string" ? value.cert_fingerprint : "",
    ssl_expires_at: typeof value.ssl_expires_at === "string" ? value.ssl_expires_at : null,
    ssl_issuer: typeof value.ssl_issuer === "string" ? value.ssl_issuer : "unknown",
    findings: Array.isArray(value.findings)
      ? value.findings.filter((finding): finding is string => typeof finding === "string")
      : []
  };
}

function providerLabel(provider: ProviderName) {
  const labels: Record<ProviderName, string> = {
    shodan: "Shodan",
    hibp: "HIBP",
    virusTotal: "VirusTotal",
    securityTrails: "SecurityTrails",
    sslLabs: "SSL Labs",
    cloudflareDns: "Cloudflare DNS"
  };
  return labels[provider];
}

export default {
  fetch: (request: Request, env: Env, ctx: ExecutionContext) => app.fetch(request, env, ctx),
  scheduled: (controller: ScheduledController, env: Env, ctx: ExecutionContext) => {
    ctx.waitUntil(runScheduledMonitoring(controller.cron, env));
  }
};
