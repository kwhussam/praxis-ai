import React from "react";
import renderer, { act, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";

import type { DashboardData } from "@/lib/dashboard/types";

type MockFunction = {
  (...args: unknown[]): unknown;
  mockResolvedValue(value: unknown): MockFunction;
};

declare const jest: {
  fn(): MockFunction;
  mock(moduleName: string, factory: () => unknown): void;
};

var mockLoadDashboardData = jest.fn();

jest.mock("react-native", () => {
  const React = require("react");
  return {
    ActivityIndicator: () => React.createElement("ActivityIndicator"),
    Pressable: ({ children, ...props }: { children?: React.ReactNode }) => React.createElement("Pressable", props, children),
    StyleSheet: { create: (styles: unknown) => styles },
    Text: ({ children, ...props }: { children?: React.ReactNode }) => React.createElement("Text", props, children),
    View: ({ children, ...props }: { children?: React.ReactNode }) => React.createElement("View", props, children)
  };
});

jest.mock("expo-router", () => ({
  router: {
    push: () => undefined
  }
}));

jest.mock("lucide-react-native", () => ({
  BellRing: () => {
    const React = require("react");
    return React.createElement("BellRing");
  }
}));

jest.mock("@/components/ui/Screen", () => ({
  Screen: ({ children }: { children: React.ReactNode }) => {
    const React = require("react");
    const { View } = require("react-native");
    return React.createElement(View, null, children);
  }
}));

jest.mock("@/components/ui/ScoreRing", () => ({
  ScoreRing: ({ score, label }: { score: number; label: string }) => {
    const React = require("react");
    const { Text } = require("react-native");
    return React.createElement(Text, null, `${label}: ${score}`);
  }
}));

jest.mock("@/components/charts/ScoreHistory", () => ({
  ScoreHistory: ({ data }: { data: Array<{ day: string; score: number }> }) => {
    const React = require("react");
    const { Text } = require("react-native");
    return React.createElement(Text, null, `History: ${data.map((point) => `${point.day}:${point.score}`).join(",")}`);
  }
}));

jest.mock("@/components/modules/EvidenceCoveragePanel", () => ({
  EvidenceCoveragePanel: () => {
    const React = require("react");
    const { Text } = require("react-native");
    return React.createElement(Text, null, "EvidenceCoveragePanel");
  }
}));

jest.mock("@/components/modules/PracticeGuidanceCard", () => ({
  PracticeGuidanceCard: () => {
    const React = require("react");
    const { Text } = require("react-native");
    return React.createElement(Text, null, "PracticeGuidanceCard");
  }
}));

jest.mock("@/lib/dashboard/service", () => ({
  loadDashboardData: (practiceId: string) => mockLoadDashboardData(practiceId)
}));

jest.mock("@/lib/security/practiceGuidance", () => ({
  guidanceFromScoreReport: () => ({ tone: "info", title: "Guidance", summary: "Guidance", actions: [] })
}));

jest.mock("@/lib/store/session", () => ({
  useSessionStore: (selector: (store: unknown) => unknown) =>
    selector({
      practice: {
        id: "11111111-1111-4111-8111-111111111111",
        name: "Praxis Test",
        plan: "free"
      }
    })
}));

import DashboardScreen from "../index";

describe("DashboardScreen", () => {
  it("zeigt ohne echte Checks den Keine-Daten-Zustand statt Demo-Werte", async () => {
    mockLoadDashboardData.mockResolvedValue(emptyDashboard());
    let tree: ReactTestRenderer;

    await act(async () => {
      tree = renderer.create(<DashboardScreen />);
      await Promise.resolve();
    });

    const text = allText(tree!.root);
    expect(text.includes("Noch keine echten Prüfdaten vorhanden.")).toBe(true);
    expect(text.includes("Starten Sie den Fragebogen oder WLAN-Scan.")).toBe(true);
    expect(text.includes("Mo")).toBe(false);
    expect(text.includes("62")).toBe(false);
    expect(text.includes("Vorläufige Einschätzung")).toBe(false);
  });

  it("zeigt nach einem Fragebogen-Abschluss den echten Score und keine Demo-History", async () => {
    mockLoadDashboardData.mockResolvedValue(questionnaireDashboard(83));
    let tree: ReactTestRenderer;

    await act(async () => {
      tree = renderer.create(<DashboardScreen />);
      await Promise.resolve();
    });

    const text = allText(tree!.root);
    expect(text.includes("Echter Fragebogen-Score: 83")).toBe(true);
    expect(text.includes("Fragebogen")).toBe(true);
    expect(text.includes("83/100")).toBe(true);
    expect(text.includes("History:")).toBe(true);
    expect(text.includes("Mo:62")).toBe(false);
    expect(text.includes("Di:66")).toBe(false);
    expect(text.includes("Vorläufige Einschätzung")).toBe(false);
  });
});

function emptyDashboard(): DashboardData {
  return {
    practiceId: "11111111-1111-4111-8111-111111111111",
    hasData: false,
    latest: {
      questionnaire: null,
      external: null,
      wlanScan: null,
      monitoringSnapshot: null
    },
    history: []
  };
}

function questionnaireDashboard(score: number): DashboardData {
  return {
    practiceId: "11111111-1111-4111-8111-111111111111",
    hasData: true,
    latest: {
      questionnaire: {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        type: "questionnaire",
        score,
        checkedAt: "2026-07-14T08:15:00.000Z",
        scoreReport: {
          score,
          ampel: "gelb",
          scoring_version: "test",
          calculated_at: "2026-07-14T08:15:00.000Z",
          ampel_reasons: [],
          evidence_confidence: 50,
          evidence_coverage_score: 50,
          scores_by_category: {},
          rule_results: [],
          category_minimums: {},
          review_status: "ready",
          total_points: 0,
          max_points: 0
        } as any,
        summary: {}
      },
      external: null,
      wlanScan: null,
      monitoringSnapshot: null
    },
    history: [
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        source: "security_check",
        type: "questionnaire",
        score,
        checkedAt: "2026-07-14T08:15:00.000Z"
      }
    ]
  };
}

function allText(root: ReactTestInstance): string {
  return root.findAll((node) => node.type === "Text").map((node) => node.children.join("")).join(" ");
}
