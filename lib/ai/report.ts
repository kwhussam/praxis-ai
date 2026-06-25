import { apiRequest } from "@/lib/api/client";
import type { ExternalCheckResult } from "@/lib/security/external";
import type { SecurityFinding } from "@/lib/security/scoring";
import type { WlanScanResult } from "@/lib/security/wlan";

export type OverallRisk = "critical" | "high" | "medium" | "low";
export type AmpelColor = "rot" | "gelb" | "grün";
export type RiskPriority = "sofort" | "diese_woche" | "diesen_monat";
export type DsgvoStatus = "nicht_konform" | "teilweise" | "konform";

export type CheckData = {
  practiceId?: string;
  checkId?: string;
  practiceName?: string;
  domain?: string;
  questionnaire: Record<string, boolean>;
  wlan?: WlanScanResult | null;
  external?: ExternalCheckResult | null;
  score?: number;
};

export type TopRisk = {
  rank: number;
  title: string;
  plain_language: string;
  business_impact: string;
  action: string;
  effort_hours: string;
  cost_estimate: string;
  priority: RiskPriority;
};

export type CategoryScores = {
  access_control: number;
  backup: number;
  email_security: number;
  network: number;
  dsgvo: number;
  updates: number;
};

export type DsgvoCompliance = {
  status: DsgvoStatus;
  missing_documents: string[];
  liability_risk: string;
};

export type QuickWin = {
  action: string;
  time_minutes: number;
  impact: string;
};

export type Report = {
  executive_summary: string;
  overall_risk: OverallRisk;
  security_score: number;
  ampel: AmpelColor;
  top_risks: TopRisk[];
  scores_by_category: CategoryScores;
  dsgvo_compliance: DsgvoCompliance;
  quick_wins: QuickWin[];
  monthly_monitoring_recommendation: boolean;
};

export type AiReportRequest = {
  practiceName: string;
  domain?: string;
  score: number;
  findings: SecurityFinding[];
};

export type AiReportContent = {
  executiveSummary: string;
  riskNarrative: string;
  immediateActions: string[];
  complianceNotes: string[];
};

const riskValues = ["critical", "high", "medium", "low"] as const;
const ampelValues = ["rot", "gelb", "grün"] as const;
const priorityValues = ["sofort", "diese_woche", "diesen_monat"] as const;
const dsgvoValues = ["nicht_konform", "teilweise", "konform"] as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;

export async function generateReport(data: CheckData): Promise<Report> {
  const endpoint = data.practiceId && UUID_RE.test(data.practiceId) ? "/api/report/generate" : "/ai/report";
  const report = await apiRequest<unknown>(endpoint, {
    method: "POST",
    body: data
  });

  return validateReport(report);
}

export async function generateAiReport(input: AiReportRequest): Promise<AiReportContent> {
  const report = await generateReport({
    practiceName: input.practiceName,
    domain: input.domain,
    score: input.score,
    questionnaire: {},
    external: {
      domain: input.domain ?? "",
      timestamp: new Date().toISOString(),
      checks: null,
      overall_score: input.score,
      critical_count: input.findings.filter((finding) => finding.severity === "critical").length,
      warning_count: input.findings.filter((finding) => finding.severity === "warning").length,
      findings: input.findings,
      checkedAt: new Date().toISOString(),
      scoreImpact: input.score - 100,
      providers: {}
    } as unknown as ExternalCheckResult
  });

  return {
    executiveSummary: report.executive_summary,
    riskNarrative: report.top_risks.map((risk) => risk.plain_language).join("\n"),
    immediateActions: report.top_risks.map((risk) => risk.action),
    complianceNotes: [
      report.dsgvo_compliance.liability_risk,
      ...report.dsgvo_compliance.missing_documents
    ].filter(Boolean)
  };
}

export function validateReport(value: unknown): Report {
  if (!isObject(value)) throw new Error("Ungültiger KI-Bericht: Antwort ist kein Objekt.");

  const report = value as Record<string, unknown>;
  const scores = requireObject(report.scores_by_category, "scores_by_category");
  const dsgvo = requireObject(report.dsgvo_compliance, "dsgvo_compliance");

  return {
    executive_summary: requireString(report.executive_summary, "executive_summary"),
    overall_risk: requireEnum(report.overall_risk, riskValues, "overall_risk"),
    security_score: clampScore(requireNumber(report.security_score, "security_score")),
    ampel: requireEnum(report.ampel, ampelValues, "ampel"),
    top_risks: requireArray(report.top_risks, "top_risks").map(validateTopRisk),
    scores_by_category: {
      access_control: clampScore(requireNumber(scores.access_control, "scores_by_category.access_control")),
      backup: clampScore(requireNumber(scores.backup, "scores_by_category.backup")),
      email_security: clampScore(requireNumber(scores.email_security, "scores_by_category.email_security")),
      network: clampScore(requireNumber(scores.network, "scores_by_category.network")),
      dsgvo: clampScore(requireNumber(scores.dsgvo, "scores_by_category.dsgvo")),
      updates: clampScore(requireNumber(scores.updates, "scores_by_category.updates"))
    },
    dsgvo_compliance: {
      status: requireEnum(dsgvo.status, dsgvoValues, "dsgvo_compliance.status"),
      missing_documents: requireArray(dsgvo.missing_documents, "dsgvo_compliance.missing_documents").map((item, index) =>
        requireString(item, `dsgvo_compliance.missing_documents.${index}`)
      ),
      liability_risk: requireString(dsgvo.liability_risk, "dsgvo_compliance.liability_risk")
    },
    quick_wins: requireArray(report.quick_wins, "quick_wins").map(validateQuickWin),
    monthly_monitoring_recommendation: requireBoolean(
      report.monthly_monitoring_recommendation,
      "monthly_monitoring_recommendation"
    )
  };
}

function validateTopRisk(value: unknown, index: number): TopRisk {
  const risk = requireObject(value, `top_risks.${index}`);

  return {
    rank: requireNumber(risk.rank, `top_risks.${index}.rank`),
    title: requireString(risk.title, `top_risks.${index}.title`),
    plain_language: requireString(risk.plain_language, `top_risks.${index}.plain_language`),
    business_impact: requireString(risk.business_impact, `top_risks.${index}.business_impact`),
    action: requireString(risk.action, `top_risks.${index}.action`),
    effort_hours: requireString(risk.effort_hours, `top_risks.${index}.effort_hours`),
    cost_estimate: requireString(risk.cost_estimate, `top_risks.${index}.cost_estimate`),
    priority: requireEnum(risk.priority, priorityValues, `top_risks.${index}.priority`)
  };
}

function validateQuickWin(value: unknown, index: number): QuickWin {
  const quickWin = requireObject(value, `quick_wins.${index}`);

  return {
    action: requireString(quickWin.action, `quick_wins.${index}.action`),
    time_minutes: Math.max(5, Math.round(requireNumber(quickWin.time_minutes, `quick_wins.${index}.time_minutes`))),
    impact: requireString(quickWin.impact, `quick_wins.${index}.impact`)
  };
}

function requireObject(value: unknown, field: string): Record<string, unknown> {
  if (!isObject(value)) throw new Error(`Ungültiger KI-Bericht: ${field} fehlt oder ist kein Objekt.`);
  return value;
}

function requireArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`Ungültiger KI-Bericht: ${field} fehlt oder ist keine Liste.`);
  return value;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Ungültiger KI-Bericht: ${field} fehlt oder ist leer.`);
  }
  return value.trim();
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Ungültiger KI-Bericht: ${field} ist keine Zahl.`);
  }
  return value;
}

function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw new Error(`Ungültiger KI-Bericht: ${field} ist kein Boolean.`);
  return value;
}

function requireEnum<const T extends readonly string[]>(value: unknown, values: T, field: string): T[number] {
  if (typeof value !== "string" || !values.includes(value as T[number])) {
    throw new Error(`Ungültiger KI-Bericht: ${field} hat einen unerwarteten Wert.`);
  }
  return value as T[number];
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
