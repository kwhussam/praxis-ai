import React from "react";
import renderer, { act, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";

var mockDashboardQuestionnaireId: string | null = null;
var mockReportHistory: Array<Record<string, unknown>> = [];

declare const jest: {
  mock(moduleName: string, factory: () => unknown): void;
};
declare function beforeEach(fn: () => void): void;

jest.mock("react-native", () => {
  const React = require("react");
  return {
    ActivityIndicator: () => React.createElement("ActivityIndicator"),
    Alert: { alert: () => undefined },
    Pressable: ({ children, ...props }: { children?: React.ReactNode }) =>
      React.createElement("Pressable", props, children),
    StyleSheet: { create: (styles: unknown) => styles },
    Text: ({ children, ...props }: { children?: React.ReactNode }) => React.createElement("Text", props, children),
    View: ({ children, ...props }: { children?: React.ReactNode }) => React.createElement("View", props, children)
  };
});

jest.mock("expo-router", () => ({
  router: { push: () => undefined },
  useLocalSearchParams: () => ({})
}));

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

jest.mock("@/lib/ai/report", () => ({
  generateReport: () => Promise.reject(new Error("not used"))
}));

jest.mock("@/lib/ai/report-pdf", () => ({
  exportReportPdf: () => Promise.reject(new Error("not used"))
}));

jest.mock("@/lib/ai/report-service", () => ({
  loadReports: async () => mockReportHistory
}));

jest.mock("@/lib/config/environment", () => ({
  AppConfig: { isDemoMode: false }
}));

jest.mock("@/lib/dashboard/service", () => ({
  loadDashboardData: async () => ({
    latest: {
      questionnaire: mockDashboardQuestionnaireId ? { id: mockDashboardQuestionnaireId } : null,
      external: null,
      wlanScan: null,
      monitoringSnapshot: null
    },
    history: [],
    hasData: Boolean(mockDashboardQuestionnaireId),
    practiceId: "11111111-1111-4111-8111-111111111111"
  })
}));

jest.mock("@/lib/security/wlan", () => ({
  getLatestWlanScanResult: () => null
}));

jest.mock("@/lib/store/check", () => ({
  useCheckStore: (selector: (state: {
    answers: Record<string, never>;
    assessmentProfile: "general";
    latestQuestionnaireCheckId: null;
  }) => unknown) =>
    selector({ answers: {}, assessmentProfile: "general", latestQuestionnaireCheckId: null })
}));

jest.mock("@/lib/store/report", () => ({
  SAMPLE_STORED_REPORT: {
    id: "sample-report",
    report: { executive_summary: "SAMPLE_STORED_REPORT" }
  },
  useReportStore: (
    selector: (state: {
      latest: null;
      saveReport: () => never;
      setPdfPath: () => void;
    }) => unknown
  ) =>
    selector({
      latest: null,
      saveReport: () => {
        throw new Error("not used");
      },
      setPdfPath: () => undefined
    })
}));

jest.mock("@/lib/store/session", () => ({
  useSessionStore: (
    selector: (state: {
      practice: { id: string; name: string; domain: string; plan: "monitoring" };
    }) => unknown
  ) =>
    selector({
      practice: {
        id: "11111111-1111-4111-8111-111111111111",
        name: "Echte Praxis",
        domain: "praxis.example",
        plan: "monitoring"
      }
    })
}));

import ReportsScreen from "../index";

describe("ReportsScreen", () => {
  beforeEach(() => {
    mockDashboardQuestionnaireId = null;
    mockReportHistory = [];
  });

  it("zeigt fuer eine echte Praxis ohne Bericht den Empty-State statt des Sample-Berichts", () => {
    const tree = renderer.create(<ReportsScreen />);
    const text = allText(tree.root);

    expect(text).toContain("Noch kein Bericht vorhanden");
    expect(text).toContain("Praxis-Check starten");
    expect(text).not.toContain("SAMPLE_STORED_REPORT");
  });

  it("findet nach einem App-Neustart den letzten gespeicherten Fragebogencheck", async () => {
    mockDashboardQuestionnaireId = "22222222-2222-4222-8222-222222222222";
    let tree: ReactTestRenderer;

    await act(async () => {
      tree = renderer.create(<ReportsScreen />);
      await Promise.resolve();
    });

    const text = allText(tree!.root);
    expect(text).toContain("Gespeicherter Check vorhanden");
    expect(text).toContain("KI-Bericht erzeugen");
    expect(text).not.toContain("Praxis-Check starten");
  });

  it("laedt die serverseitige Berichtshistorie nach einem App-Neustart", async () => {
    mockReportHistory = [{
      id: "66666666-6666-4666-8666-666666666666",
      checkId: "22222222-2222-4222-8222-222222222222",
      assessmentManifestId: "77777777-7777-4777-8777-777777777777",
      formatVersion: "1.0.0",
      scoringVersion: "2026.1",
      summary: { security_score: 64 },
      pdfPath: null,
      manifestSha256: "a".repeat(64),
      createdAt: "2026-08-11T10:00:00.000Z"
    }];
    let tree: ReactTestRenderer;

    await act(async () => {
      tree = renderer.create(<ReportsScreen />);
      await Promise.resolve();
    });

    const text = allText(tree!.root);
    expect(text).toContain("Gespeicherte Berichte");
    expect(text).toContain("64/100");
    expect(text).toContain("App-Neustart");
  });
});

function allText(root: ReactTestInstance): string {
  return root
    .findAll((node) => node.type === "Text")
    .map((node) => node.children.join(""))
    .join(" ");
}
