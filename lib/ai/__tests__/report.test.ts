declare const jest: {
  mock(moduleName: string, factory: () => unknown): void;
};

const mockApiRequestCalls: Array<{ path: string; options: unknown }> = [];
let mockApiRequestResult: unknown;

jest.mock("@/lib/api/client", () => ({
  apiRequest: async (path: string, options: unknown) => {
    mockApiRequestCalls.push({ path, options });
    return mockApiRequestResult;
  }
}));

import { generateReport, validateReport } from "@/lib/ai/report";

const validReport = {
  executive_summary:
    "Die Bewertung beruht auf gemessenen und angegebenen Kontrollen. Nicht geprüfte Bereiche werden gesondert als Einschränkung geführt.",
  overall_risk: "medium",
  security_score: 68,
  ampel: "gelb",
  top_risks: [
    {
      rank: 1,
      title: "DMARC ist nur teilweise belastbar",
      plain_language: "Die Mail-Schutzbewertung basiert auf DNS-Daten und ist deshalb gut nachvollziehbar.",
      business_impact: "Angreifer könnten gefälschte E-Mails glaubwürdiger erscheinen lassen.",
      action: "DMARC auf Quarantine oder Reject umstellen und Versandquellen prüfen.",
      effort_hours: "1-2 Stunden",
      cost_estimate: "IT-Dienstleister, 1-2 Stunden",
      priority: "diese_woche",
      evidence_source: "measured",
      reliability: "high"
    }
  ],
  scores_by_category: {
    access_control: 70,
    backup: 55,
    email_security: 65,
    network: 60,
    dsgvo: 75,
    updates: 80
  },
  dsgvo_compliance: {
    status: "teilweise",
    missing_documents: ["Löschkonzept"],
    liability_risk: "Dokumentationslücken erschweren die Nachweisführung."
  },
  quick_wins: [
    {
      action: "DMARC-Berichte auswerten",
      time_minutes: 30,
      impact: "Verbessert die Erkennung fehlerhafter Mailquellen."
    }
  ],
  not_checked_limitations: [
    {
      area: "Lokales Netzwerk/WLAN",
      reason: "Es wurde kein lokaler Scan übergeben.",
      impact: "Client-Isolation und lokale Ports können nicht als sicher bewertet werden."
    }
  ],
  monthly_monitoring_recommendation: true
};

describe("validateReport", () => {
  it("requires evidence and limitation metadata for AI reports", () => {
    const report = validateReport(validReport);

    expect(report.top_risks[0].evidence_source).toBe("measured");
    expect(report.top_risks[0].reliability).toBe("high");
    expect(report.not_checked_limitations[0].area).toBe("Lokales Netzwerk/WLAN");
  });

  it("formuliert Quick Wins mit Verantwortlichem und Frist", () => {
    const report = validateReport(validReport);

    expect(report.quick_wins[0].action).toMatch(/^Bitten Sie Ihren IT-Partner bis Freitag,/);
    expect(report.quick_wins[0].action.includes("DMARC")).toBe(false);
  });

  it("rejects top risks without evidence metadata", () => {
    const invalidReport = {
      ...validReport,
      top_risks: validReport.top_risks.map((risk) => ({
        rank: risk.rank,
        title: risk.title,
        plain_language: risk.plain_language,
        business_impact: risk.business_impact,
        action: risk.action,
        effort_hours: risk.effort_hours,
        cost_estimate: risk.cost_estimate,
        priority: risk.priority,
        reliability: risk.reliability
      }))
    };

    expectValidationError(invalidReport, /evidence_source/);
  });

  it("rejects reports without a limitations section", () => {
    const invalidReport = {
      executive_summary: validReport.executive_summary,
      overall_risk: validReport.overall_risk,
      security_score: validReport.security_score,
      ampel: validReport.ampel,
      top_risks: validReport.top_risks,
      scores_by_category: validReport.scores_by_category,
      dsgvo_compliance: validReport.dsgvo_compliance,
      quick_wins: validReport.quick_wins,
      monthly_monitoring_recommendation: validReport.monthly_monitoring_recommendation
    };

    expectValidationError(invalidReport, /not_checked_limitations/);
  });
});

describe("generateReport", () => {
  it("rejects missing practiceId before calling the Worker", async () => {
    mockApiRequestCalls.length = 0;

    await expectAsyncError(generateReport({
      practiceName: "Praxis",
      questionnaire: {},
      score: 80
    }), /Praxis-ID/);

    expect(mockApiRequestCalls).toEqual([]);
  });

  it("rejects invalid practiceId before calling the Worker", async () => {
    mockApiRequestCalls.length = 0;

    await expectAsyncError(generateReport({
      practiceId: "demo-practice",
      practiceName: "Praxis",
      questionnaire: {},
      score: 80
    }), /Praxis-ID/);

    expect(mockApiRequestCalls).toEqual([]);
  });

  it("uses the authenticated report endpoint for valid practiceId", async () => {
    mockApiRequestCalls.length = 0;
    mockApiRequestResult = validReport;

    await generateReport({
      practiceId: "11111111-1111-4111-8111-111111111111",
      practiceName: "Praxis",
      questionnaire: {},
      score: 80
    });

    expect(mockApiRequestCalls).toHaveLength(1);
    expect(mockApiRequestCalls[0]).toMatchObject({
      path: "/api/report/generate",
      options: {
        method: "POST",
        body: {
          practiceId: "11111111-1111-4111-8111-111111111111",
          practiceName: "Praxis",
          questionnaire: {},
          score: 80
        }
      }
    });
  });
});

async function expectAsyncError(promise: Promise<unknown>, pattern: RegExp) {
  try {
    await promise;
    throw new Error("Expected async operation to fail");
  } catch (error) {
    expect(error instanceof Error ? error.message : String(error)).toMatch(pattern);
  }
}

function expectValidationError(value: unknown, pattern: RegExp) {
  try {
    validateReport(value);
    throw new Error("Expected validateReport to fail");
  } catch (error) {
    expect(error instanceof Error ? error.message : String(error)).toMatch(pattern);
  }
}
