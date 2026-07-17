import React from "react";
import renderer, { act, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";

declare const jest: {
  mock(moduleName: string, factory: () => unknown): void;
};

let mockLoadMode: "success" | "not-found" | "error" = "success";
const mockLoadCalls: Array<{ practiceId: string; reportId: string }> = [];

jest.mock("react-native", () => {
  const React = require("react");
  return {
    ActivityIndicator: () => React.createElement("ActivityIndicator"),
    StyleSheet: { create: (styles: unknown) => styles },
    Text: ({ children, ...props }: { children?: React.ReactNode }) => React.createElement("Text", props, children),
    View: ({ children, ...props }: { children?: React.ReactNode }) => React.createElement("View", props, children)
  };
});

jest.mock("expo-router", () => ({
  router: { push: () => undefined },
  useLocalSearchParams: () => ({ id: "66666666-6666-4666-8666-666666666666" })
}));

jest.mock("@/components/charts/BarChart", () => ({ BarChart: () => null }));
jest.mock("@/components/charts/RadarChart", () => ({ RadarChart: () => null }));
jest.mock("@/components/modules/ReportFindings", () => ({ ReportFindings: () => null }));

jest.mock("@/components/modules/AiReport", () => ({
  AiReport: ({ report }: { report: { executive_summary: string } }) => {
    const React = require("react");
    const { Text } = require("react-native");
    return React.createElement(Text, null, report.executive_summary);
  }
}));

jest.mock("@/components/ui/AnimatedButton", () => ({
  AnimatedButton: ({ label }: { label: string }) => {
    const React = require("react");
    const { Text } = require("react-native");
    return React.createElement(Text, null, label);
  }
}));

jest.mock("@/components/ui/GlassCard", () => ({
  GlassCard: ({ children }: { children: React.ReactNode }) => {
    const React = require("react");
    const { View } = require("react-native");
    return React.createElement(View, null, children);
  }
}));

jest.mock("@/components/ui/Screen", () => ({
  Screen: ({ children }: { children: React.ReactNode }) => {
    const React = require("react");
    const { View } = require("react-native");
    return React.createElement(View, null, children);
  }
}));

jest.mock("@/lib/ai/report-findings", () => ({
  buildReportScore: () => null
}));

jest.mock("@/lib/ai/report-service", () => {
  class ReportNotFoundError extends Error {}
  return {
    ReportNotFoundError,
    loadReportById: (practiceId: string, reportId: string) => {
      mockLoadCalls.push({ practiceId, reportId });
      if (mockLoadMode === "not-found") return Promise.reject(new ReportNotFoundError());
      if (mockLoadMode === "error") return Promise.reject(new Error("network unavailable"));
      return Promise.resolve({
        id: reportId,
        report: mockValidReport(),
        createdAt: "2026-07-17T10:00:00.000Z"
      });
    }
  };
});

jest.mock("@/lib/config/environment", () => ({
  AppConfig: { isDemoMode: false }
}));

jest.mock("@/lib/store/report", () => ({
  SAMPLE_STORED_REPORT: {
    id: "sample-report",
    report: { executive_summary: "SAMPLE_STORED_REPORT" },
    source: {}
  },
  useReportStore: (selector: (state: { latest: null }) => unknown) => selector({ latest: null })
}));

jest.mock("@/lib/store/session", () => ({
  useSessionStore: (
    selector: (state: { practice: { id: string; name: string; plan: "monitoring" } }) => unknown
  ) =>
    selector({
      practice: {
        id: "11111111-1111-4111-8111-111111111111",
        name: "Echte Praxis",
        plan: "monitoring"
      }
    })
}));

import ReportDetailScreen from "../[id]";

describe("ReportDetailScreen", () => {
  it("laedt einen echten Bericht per ID vom Backend und zeigt keinen Sample-Inhalt", async () => {
    mockLoadMode = "success";
    mockLoadCalls.length = 0;
    let tree: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<ReportDetailScreen />);
      await Promise.resolve();
    });

    const text = allText(tree!.root);
    expect(mockLoadCalls).toEqual([
      {
        practiceId: "11111111-1111-4111-8111-111111111111",
        reportId: "66666666-6666-4666-8666-666666666666"
      }
    ]);
    expect(text.includes("ECHTER SERVERBERICHT")).toBe(true);
    expect(text.includes("SAMPLE_STORED_REPORT")).toBe(false);
  });

  it("zeigt fuer eine nicht vorhandene Report-ID den Nicht-gefunden-Zustand", async () => {
    mockLoadMode = "not-found";
    mockLoadCalls.length = 0;
    let tree: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<ReportDetailScreen />);
      await Promise.resolve();
    });

    expect(allText(tree!.root).includes("Bericht nicht gefunden")).toBe(true);
  });

  it("zeigt bei einem Ladefehler einen Retry-Zustand", async () => {
    mockLoadMode = "error";
    mockLoadCalls.length = 0;
    let tree: ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<ReportDetailScreen />);
      await Promise.resolve();
    });

    const text = allText(tree!.root);
    expect(text.includes("Bericht konnte nicht geladen werden")).toBe(true);
    expect(text.includes("Erneut versuchen")).toBe(true);
  });
});

function allText(root: ReactTestInstance): string {
  return root
    .findAll((node) => node.type === "Text")
    .map((node) => node.children.join(""))
    .join(" ");
}

function mockValidReport() {
  return {
    executive_summary: "ECHTER SERVERBERICHT",
    overall_risk: "medium",
    security_score: 50,
    ampel: "gelb",
    top_risks: [
      {
        rank: 1,
        title: "MFA fehlt",
        plain_language: "Zweite Bestätigung fehlt.",
        business_impact: "Konten sind schwächer geschützt.",
        action: "MFA aktivieren.",
        effort_hours: "1 Stunde",
        cost_estimate: "0-100 EUR",
        priority: "diese_woche",
        evidence_source: "self_reported",
        reliability: "medium"
      }
    ],
    scores_by_category: {
      access_control: 50,
      backup: 50,
      email_security: 50,
      network: 50,
      dsgvo: 50,
      updates: 50
    },
    dsgvo_compliance: {
      status: "teilweise",
      missing_documents: [],
      liability_risk: "Nachweise fehlen."
    },
    quick_wins: [{ action: "MFA aktivieren", time_minutes: 30, impact: "Besserer Kontoschutz." }],
    not_checked_limitations: [],
    monthly_monitoring_recommendation: true
  };
}
