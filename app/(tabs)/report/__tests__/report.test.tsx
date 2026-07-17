import React from "react";
import renderer, { type ReactTestInstance } from "react-test-renderer";

declare const jest: {
  mock(moduleName: string, factory: () => unknown): void;
};

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

jest.mock("@/lib/config/environment", () => ({
  AppConfig: { isDemoMode: false }
}));

jest.mock("@/lib/security/wlan", () => ({
  getLatestWlanScanResult: () => null
}));

jest.mock("@/lib/store/check", () => ({
  useCheckStore: (selector: (state: { answers: Record<string, never>; currentScore: number }) => unknown) =>
    selector({ answers: {}, currentScore: 0 })
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
  it("zeigt fuer eine echte Praxis ohne Bericht den Empty-State statt des Sample-Berichts", () => {
    const tree = renderer.create(<ReportsScreen />);
    const text = allText(tree.root);

    expect(text).toContain("Noch kein Bericht vorhanden");
    expect(text).toContain("Praxis-Check starten");
    expect(text).not.toContain("SAMPLE_STORED_REPORT");
  });
});

function allText(root: ReactTestInstance): string {
  return root
    .findAll((node) => node.type === "Text")
    .map((node) => node.children.join(""))
    .join(" ");
}
