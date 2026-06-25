import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");
const anthropicModel = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-4-6";

const SYSTEM_PROMPT = `
Du bist ein Cybersecurity-Experte für Arztpraxen in Deutschland.
Du analysierst Sicherheitsdaten und erstellst verständliche Berichte für Ärzte ohne IT-Kenntnisse.

TONALITÄT:
- Klar, direkt, ohne Fachjargon
- Ernst aber nicht alarmistisch
- Lösungsorientiert - immer konkrete nächste Schritte
- Sensibel für den Praxiskontext (Patientendaten, DSGVO, Haftung)

AUSGABEFORMAT: Antworte ausschließlich als valides JSON gemäß ReportSchema. Keine Markdown-Blöcke.
`;

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (!anthropicApiKey) {
    return Response.json({ error: "ANTHROPIC_API_KEY is not configured" }, { status: 500 });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": anthropicApiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: anthropicModel,
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildReportPrompt(payload) }]
    })
  });

  const data = await response.json();

  if (!response.ok) {
    return Response.json({ error: "anthropic_request_failed", details: data }, { status: 502 });
  }

  try {
    return Response.json(validateReport(parseAnthropicJson(data)));
  } catch (error) {
    return Response.json(
      {
        error: "invalid_ai_report",
        message: error instanceof Error ? error.message : "Claude response did not match Report schema"
      },
      { status: 502 }
    );
  }
});

function buildReportPrompt(data: unknown) {
  const payload = isRecord(data) ? data : {};

  return `
Analysiere folgende Sicherheitsdaten einer Arztpraxis und erstelle einen strukturierten Bericht:

FRAGEBOGEN-ANTWORTEN:
${JSON.stringify(payload.questionnaire ?? {}, null, 2)}

WLAN-SCAN-ERGEBNISSE:
${JSON.stringify(payload.wlan ?? null, null, 2)}

EXTERNER CHECK:
${JSON.stringify(payload.external ?? null, null, 2)}

Erstelle einen Bericht gemäß diesem Schema:
{
  "executive_summary": "2-3 Sätze für den Praxisinhaber",
  "overall_risk": "critical|high|medium|low",
  "security_score": 0-100,
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
      "priority": "sofort|diese_woche|diesen_monat"
    }
  ],
  "scores_by_category": {
    "access_control": 0-100,
    "backup": 0-100,
    "email_security": 0-100,
    "network": 0-100,
    "dsgvo": 0-100,
    "updates": 0-100
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
  "monthly_monitoring_recommendation": true|false
}
`;
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
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");

  if (start < 0 || end <= start) throw new Error("No JSON object found in Claude response");
  return JSON.parse(text.slice(start, end + 1));
}

function validateReport(value: unknown) {
  const report = asRecord(value);
  const scores = requireRecord(report.scores_by_category, "scores_by_category");
  const dsgvo = requireRecord(report.dsgvo_compliance, "dsgvo_compliance");

  return {
    executive_summary: requireString(report.executive_summary, "executive_summary"),
    overall_risk: requireEnum(report.overall_risk, ["critical", "high", "medium", "low"], "overall_risk"),
    security_score: clampScore(requireNumber(report.security_score, "security_score")),
    ampel: requireEnum(report.ampel, ["rot", "gelb", "grün"], "ampel"),
    top_risks: requireArray(report.top_risks, "top_risks").slice(0, 5).map((item, index) => {
      const risk = requireRecord(item, `top_risks.${index}`);
      return {
        rank: Math.max(1, Math.round(requireNumber(risk.rank, `top_risks.${index}.rank`))),
        title: requireString(risk.title, `top_risks.${index}.title`),
        plain_language: requireString(risk.plain_language, `top_risks.${index}.plain_language`),
        business_impact: requireString(risk.business_impact, `top_risks.${index}.business_impact`),
        action: requireString(risk.action, `top_risks.${index}.action`),
        effort_hours: requireString(risk.effort_hours, `top_risks.${index}.effort_hours`),
        cost_estimate: requireString(risk.cost_estimate, `top_risks.${index}.cost_estimate`),
        priority: requireEnum(risk.priority, ["sofort", "diese_woche", "diesen_monat"], `top_risks.${index}.priority`)
      };
    }),
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
    quick_wins: requireArray(report.quick_wins, "quick_wins").map((item, index) => {
      const quickWin = requireRecord(item, `quick_wins.${index}`);
      return {
        action: requireString(quickWin.action, `quick_wins.${index}.action`),
        time_minutes: Math.max(5, Math.round(requireNumber(quickWin.time_minutes, `quick_wins.${index}.time_minutes`))),
        impact: requireString(quickWin.impact, `quick_wins.${index}.impact`)
      };
    }),
    monthly_monitoring_recommendation: requireBoolean(
      report.monthly_monitoring_recommendation,
      "monthly_monitoring_recommendation"
    )
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
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Expected object");
  return value as Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
