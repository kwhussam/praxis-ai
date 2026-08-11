import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import renderer, { act, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";

import type { DashboardData } from "@/lib/dashboard/types";
import type { ScoreReport } from "@/lib/security/scoring";

type MockFunction = {
  (...args: unknown[]): unknown;
  mockResolvedValue(value: unknown): MockFunction;
  mockClear(): void;
  mock: { calls: unknown[][] };
};

declare const jest: {
  fn(): MockFunction;
  mock(moduleName: string, factory: () => unknown): void;
};

var mockLoadDashboardData = jest.fn();

function renderDashboard(client: QueryClient): ReactTestRenderer {
  return renderer.create(
    React.createElement(QueryClientProvider, { client }, React.createElement(DashboardScreen, { queryGcTime: Infinity }))
  );
}

function unmountRenderer(tree: ReactTestRenderer): void {
  (tree as unknown as { unmount(): void }).unmount();
}

function newQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

async function flushQuery(): Promise<void> {
  // React Query settles the query + notifies subscribers over several microtasks plus a
  // scheduler tick; flush both microtask and macrotask queues so the resolved state is committed.
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

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
  Settings: () => {
    const React = require("react");
    return React.createElement("Settings");
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
  PracticeGuidanceCard: ({ guidance }: { guidance: { actions: string[] } }) => {
    const React = require("react");
    const { Text } = require("react-native");
    return React.createElement(Text, null, `PracticeGuidanceCard ${guidance.actions.join(" | ")}`);
  }
}));

jest.mock("@/lib/dashboard/service", () => ({
  loadDashboardData: (practiceId: string) => mockLoadDashboardData(practiceId)
}));

jest.mock("@/lib/security/practiceGuidance", () => ({
  guidanceFromScoreReport: () => ({
    tone: "warning",
    headline: "Handlungsbedarf",
    summary: "Keine vollständige Entwarnung",
    actions: ["Maßnahme eins", "Maßnahme zwei", "Maßnahme drei"]
  })
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
    mockLoadDashboardData.mockClear();
    mockLoadDashboardData.mockResolvedValue(emptyDashboard());
    const client = newQueryClient();
    let tree: ReactTestRenderer;

    await act(async () => {
      tree = renderDashboard(client);
      await flushQuery();
    });

    const text = allText(tree!.root);
    expect(text.includes("Noch keine Prüfdaten vorhanden.")).toBe(true);
    expect(text.includes("Starten Sie den Fragebogen oder WLAN-Scan.")).toBe(true);
    expect(text.includes("Mo")).toBe(false);
    expect(text.includes("62")).toBe(false);
    expect(text.includes("Vorläufige Einschätzung")).toBe(false);

    await act(async () => {
      unmountRenderer(tree!);
      client.clear();
    });
  });

  it("zeigt standardmäßig die Praxisansicht ohne missverständlichen Gesamtscore", async () => {
    mockLoadDashboardData.mockClear();
    mockLoadDashboardData.mockResolvedValue(questionnaireDashboard(83));
    const client = newQueryClient();
    let tree: ReactTestRenderer;

    await act(async () => {
      tree = renderDashboard(client);
      await flushQuery();
    });

    const text = allText(tree!.root);
    expect(text.includes("PracticeGuidanceCard Maßnahme eins | Maßnahme zwei | Maßnahme drei")).toBe(true);
    expect(text.includes("50 % Evidenzabdeckung")).toBe(true);
    expect(text.includes("keine vollständige Entwarnung")).toBe(true);
    expect(text.includes("Fragebogen")).toBe(true);
    expect(text.includes("Ergebnis vorhanden")).toBe(true);
    expect(text.includes("Fragebogen-Teilwert: 83")).toBe(false);
    expect(text.includes("History:")).toBe(false);
    expect(text.includes("Mo:62")).toBe(false);
    expect(text.includes("Di:66")).toBe(false);
    expect(text.includes("Vorläufige Einschätzung")).toBe(false);

    await act(async () => {
      unmountRenderer(tree!);
      client.clear();
    });
  });

  it("ersetzt den Fragebogenstand nicht durch einen neueren WLAN- oder Monitoring-Teilscore", async () => {
    mockLoadDashboardData.mockClear();
    const data = questionnaireDashboard(83);
    data.latest.wlanScan = {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      checkedAt: "2026-07-15T08:15:00.000Z",
      riskScore: 12,
      riskLevel: "critical",
      devicesFound: 3,
      networkName: "Praxis",
      securityProtocol: "WPA2",
      coverage: {
        score: 67,
        status: "insufficient",
        active: 2,
        total: 3,
        missing: ["localDevices"],
        unsupported: ["visibleWifiNetworks"]
      }
    };
    data.latest.monitoringSnapshot = {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      score: 99,
      checkedAt: "2026-07-16T08:15:00.000Z",
      source: "manual",
      categoryScores: {}
    };
    data.history.push(
      {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        source: "security_check",
        type: "wlan",
        score: 12,
        checkedAt: "2026-07-15T08:15:00.000Z"
      },
      {
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        source: "monitoring_snapshot",
        type: "monitoring",
        score: 99,
        checkedAt: "2026-07-16T08:15:00.000Z"
      }
    );
    mockLoadDashboardData.mockResolvedValue(data);
    const client = newQueryClient();
    let tree: ReactTestRenderer;

    await act(async () => {
      tree = renderDashboard(client);
      await flushQuery();
    });

    await act(async () => {
      press(technicalTab(tree!.root));
    });

    const text = allText(tree!.root);
    expect(text.includes("Fragebogen-Teilwert: 83")).toBe(true);
    expect(text.includes("Fragebogen-Teilwert: 99")).toBe(false);
    expect(text.includes("Fragebogen-Teilwert: 12")).toBe(false);
    expect(text.includes("WLAN-Scan")).toBe(true);
    expect(text.includes("Monitoring")).toBe(true);
    expect(text.includes("1 plattformbedingt nicht unterstützt")).toBe(true);
    expect(text.includes(" W:12")).toBe(false);
    expect(text.includes(" M:99")).toBe(false);

    await act(async () => {
      unmountRenderer(tree!);
      client.clear();
    });
  });

  it("macht Praxis- und Techniksicht barrierefrei unterscheidbar und zeigt Technikmetriken erst nach Auswahl", async () => {
    mockLoadDashboardData.mockClear();
    mockLoadDashboardData.mockResolvedValue(questionnaireDashboard(83));
    const client = newQueryClient();
    let tree: ReactTestRenderer;

    await act(async () => {
      tree = renderDashboard(client);
      await flushQuery();
    });

    const practice = tree!.root.findByProps({ testID: "dashboard-view-practice" });
    const technical = technicalTab(tree!.root);
    expect(testProps(practice).accessibilityRole).toBe("tab");
    expect(testProps(practice).accessibilityState).toEqual({ selected: true });
    expect(testProps(technical).accessibilityState).toEqual({ selected: false });
    expect(findAllByTestId(tree!.root, "dashboard-technical-metrics").length).toBe(0);

    await act(async () => {
      press(technical);
    });

    expect(testProps(tree!.root.findByProps({ testID: "dashboard-view-practice" })).accessibilityState).toEqual({ selected: false });
    expect(testProps(technicalTab(tree!.root)).accessibilityState).toEqual({ selected: true });
    const text = allText(tree!.root);
    expect(text.includes("Fragebogen-Teilwert: 83")).toBe(true);
    expect(text.includes("Evidenzabdeckung")).toBe(true);
    expect(text.includes("Evidenzvertrauen")).toBe(true);
    expect(text.includes("Evidenzfrische")).toBe(true);
    expect(text.includes("EvidenceCoveragePanel")).toBe(true);
    expect(text.includes("History:")).toBe(true);

    await act(async () => {
      unmountRenderer(tree!);
      client.clear();
    });
  });

  it("hält die Praxisansicht als semantischen Snapshot stabil", async () => {
    mockLoadDashboardData.mockClear();
    mockLoadDashboardData.mockResolvedValue(questionnaireDashboard(83));
    const client = newQueryClient();
    let tree: ReactTestRenderer;

    await act(async () => {
      tree = renderDashboard(client);
      await flushQuery();
    });

    expect(dashboardSemanticSnapshot(tree!.root)).toMatchSnapshot();

    await act(async () => {
      press(technicalTab(tree!.root));
    });
    expect(dashboardSemanticSnapshot(tree!.root)).toMatchSnapshot();

    await act(async () => {
      unmountRenderer(tree!);
      client.clear();
    });
  });

  // PERF-05: a fast unmount+remount against the same QueryClient must not re-fetch — the cached
  // (fresh, within staleTime) result is reused, so loadDashboardData is called exactly once.
  it("löst bei schnellem Remount keinen zweiten Netzwerk-Call aus", async () => {
    mockLoadDashboardData.mockClear();
    mockLoadDashboardData.mockResolvedValue(questionnaireDashboard(83));
    const client = newQueryClient();
    let second: ReactTestRenderer;

    await act(async () => {
      const first = renderDashboard(client);
      await flushQuery();
      unmountRenderer(first);
      second = renderDashboard(client);
      await flushQuery();
    });

    expect(mockLoadDashboardData.mock.calls.length).toBe(1);
    await act(async () => {
      unmountRenderer(second!);
      client.clear();
    });
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
          scoreReport: scoreReportFixture(score),
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

function scoreReportFixture(score: number): ScoreReport {
  return {
    score,
    ampel: "gelb",
    scoring_version: "test",
    calculated_at: "2026-07-14T08:15:00.000Z",
    ampel_reasons: [],
    evidence_confidence: 50,
    evidence_coverage_score: 50,
    scores_by_category: {
      access_control: score,
      backup: score,
      email_security: score,
      network: score,
      dsgvo: score,
      updates: score
    },
    rule_results: [],
    category_minimums: {},
    review_status: "ok",
    total_points: score,
    max_points: 100
  };
}

function allText(root: ReactTestInstance): string {
  return root.findAll((node) => node.type === "Text").map((node) => node.children.join("")).join(" ");
}

function technicalTab(root: ReactTestInstance): ReactTestInstance {
  return root.findByProps({ testID: "dashboard-view-technical" });
}

function dashboardSemanticSnapshot(root: ReactTestInstance) {
  return {
    text: root.findAll((node) => node.type === "Text").map((node) => node.children.join("")),
    tabs: ["practice", "technical"].map((mode) => {
      const tab = root.findByProps({ testID: `dashboard-view-${mode}` });
      const props = testProps(tab);
      return { mode, role: props.accessibilityRole, state: props.accessibilityState };
    }),
    coverageSummaryVisible: findAllByTestId(root, "dashboard-coverage-summary").length > 0,
    technicalMetricsVisible: findAllByTestId(root, "dashboard-technical-metrics").length > 0
  };
}

function testProps(node: ReactTestInstance): Record<string, unknown> {
  return node.props as Record<string, unknown>;
}

function press(node: ReactTestInstance) {
  const onPress = testProps(node).onPress;
  if (typeof onPress !== "function") throw new Error("Pressable has no onPress handler");
  onPress();
}

function findAllByTestId(root: ReactTestInstance, testID: string) {
  return root.findAll((node) => testProps(node).testID === testID);
}
