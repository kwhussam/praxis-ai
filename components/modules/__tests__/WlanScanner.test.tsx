import React from "react";
import renderer, { act, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";

type MockFunction = {
  (...args: unknown[]): unknown;
  mockRejectedValue(value: unknown): MockFunction;
  mockResolvedValue(value: unknown): MockFunction;
};

type ConsoleErrorSpy = {
  mock: {
    calls: Array<[string, { error?: unknown; networkName?: string; practiceId?: string }]>;
  };
  mockImplementation(fn: (...args: unknown[]) => unknown): ConsoleErrorSpy;
  mockRestore(): void;
};

declare const jest: {
  fn(): MockFunction;
  mock(moduleName: string, factory: () => unknown): void;
  spyOn(object: Record<string, unknown>, method: string): ConsoleErrorSpy;
};

var mockRunWlanSecurityScan = jest.fn();
var mockSyncWlanScanResultToSupabase = jest.fn();
var mockRecalculate = jest.fn();

jest.mock("react-native", () => {
  const React = require("react");
  return {
    Pressable: ({ children, ...props }: { children: React.ReactNode | ((state: { pressed: boolean }) => React.ReactNode) }) =>
      React.createElement("Pressable", props, typeof children === "function" ? children({ pressed: false }) : children),
    StyleSheet: { create: (styles: unknown) => styles },
    Text: ({ children, ...props }: { children: React.ReactNode }) => React.createElement("Text", props, children),
    View: ({ children, ...props }: { children?: React.ReactNode }) => React.createElement("View", props, children)
  };
});

jest.mock("moti", () => ({
  MotiView: ({ children, ...props }: { children?: React.ReactNode }) => {
    const React = require("react");
    return React.createElement("View", props, children);
  }
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: ({ name }: { name: string }) => {
    const React = require("react");
    const { Text } = require("react-native");
    return React.createElement(Text, null, name);
  }
}));

jest.mock("@/components/ui/AnimatedButton", () => ({
  AnimatedButton: ({ disabled, label, onPress }: { disabled?: boolean; label: string; onPress: () => void }) => {
    const React = require("react");
    const { Pressable, Text } = require("react-native");
    return React.createElement(
      Pressable,
      { accessibilityState: { disabled }, disabled, onPress },
      React.createElement(Text, null, label)
    );
  }
}));

jest.mock("@/components/ui/AmpelBadge", () => ({
  AmpelBadge: ({ label }: { label: string }) => {
    const React = require("react");
    const { Text } = require("react-native");
    return React.createElement(Text, null, label);
  }
}));

jest.mock("@/components/ui/FindingBadge", () => ({
  FindingBadge: () => null
}));

jest.mock("@/components/ui/GlassCard", () => ({
  GlassCard: ({ children }: { children: React.ReactNode }) => {
    const React = require("react");
    const { View } = require("react-native");
    return React.createElement(View, null, children);
  }
}));

jest.mock("@/components/ui/ScanAnimation", () => ({
  ScanAnimation: () => {
    const React = require("react");
    const { View } = require("react-native");
    return React.createElement(View);
  },
  ScanNode: {}
}));

jest.mock("@/components/ui/ScoreRing", () => ({
  ScoreRing: ({ label }: { label: string }) => {
    const React = require("react");
    const { Text } = require("react-native");
    return React.createElement(Text, null, label);
  }
}));

jest.mock("@/components/ui/VulnerabilityCard", () => ({
  VulnerabilityCard: ({ title }: { title: string }) => {
    const React = require("react");
    const { Text } = require("react-native");
    return React.createElement(Text, null, title);
  }
}));

jest.mock("@/lib/api/client", () => ({
  apiRequest: async () => ({ ok: true })
}));

jest.mock("@/lib/store/check", () => ({
  useCheckStore: (selector: (store: unknown) => unknown) =>
    selector({
      answers: {},
      recalculate: mockRecalculate
    })
}));

jest.mock("@/lib/store/inventory", () => ({
  useInventoryStore: (selector: (store: unknown) => unknown) =>
    selector({
      getAccessPoints: () => [],
      getKnownDevices: () => [],
      getRouterFirewallRules: () => []
    })
}));

jest.mock("@/lib/store/session", () => ({
  useSessionStore: (selector: (store: unknown) => unknown) =>
    selector({
      practice: { id: "11111111-1111-4111-8111-111111111111" }
    })
}));

jest.mock("@/lib/security/practiceGuidance", () => ({
  guidanceFromNetworkFindings: () => ({
    actions: ["WLAN-Konfiguration prüfen."],
    headline: "WLAN geprüft",
    summary: "Keine kritischen Auffälligkeiten.",
    tone: "info"
  })
}));

jest.mock("@/lib/security/segmentationAssessment", () => ({
  NETWORK_SEGMENTS: [{ id: "practice_wifi", label: "Praxis-WLAN" }]
}));

jest.mock("@/lib/security/wlan", () => ({
  SCAN_PHASES: [{ label: "Start", checks: ["Router prüfen"] }],
  mapWlanVulnerabilitiesToFindings: () => [],
  runWlanSecurityScan: (...args: unknown[]) => mockRunWlanSecurityScan(...args),
  syncWlanScanResultToSupabase: (...args: unknown[]) => mockSyncWlanScanResultToSupabase(...args)
}));

import { WlanScanner } from "@/components/modules/WlanScanner";

describe("WlanScanner", () => {
  it("shows a visible sync error when saving the finished scan fails", async () => {
    const consoleError = jest.spyOn(console as unknown as Record<string, unknown>, "error").mockImplementation(() => undefined);
    mockRunWlanSecurityScan.mockResolvedValue(minimalScanResult());
    mockSyncWlanScanResultToSupabase.mockRejectedValue(new Error("forced sync failure"));

    let testRenderer: ReactTestRenderer | null = null;
    await act(async () => {
      testRenderer = renderer.create(<WlanScanner />);
    });
    const screen = testRenderer!;

    act(() => pressText(screen.root, "Ich darf dieses Netzwerk prüfen und stimme dem lokalen Scan zu."));
    act(() => pressText(screen.root, "Scan vorbereiten"));

    await act(async () => {
      pressText(screen.root, "WLAN jetzt prüfen");
      await flushPromises();
      await flushPromises();
    });

    await waitForText(screen, "Scan konnte nicht gespeichert werden. Bitte erneut versuchen.");
    expect(findText(screen.root, "Speichern erneut versuchen")).toBeDefined();

    const firstErrorCall = consoleError.mock.calls[0];
    expect(firstErrorCall[0]).toBe("WLAN scan sync threw an unexpected error");
    expect(firstErrorCall[1]).toMatchObject({
      networkName: "Praxis-WLAN",
      practiceId: "11111111-1111-4111-8111-111111111111"
    });
    expect(firstErrorCall[1].error).toBeDefined();

    consoleError.mockRestore();
  });
});

function pressText(root: ReactTestInstance, text: string) {
  let current: ReactTestInstance | null = findText(root, text);

  while (current) {
    const onPress = current.props.onPress;
    if (typeof onPress === "function") {
      onPress();
      return;
    }
    current = current.parent;
  }

  throw new Error(`No pressable parent found for text: ${text}`);
}

function findText(root: ReactTestInstance, text: string) {
  return root.find((node) => node.type === "Text" && node.children.includes(text));
}

async function waitForText(screen: ReactTestRenderer, text: string) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      return findText(screen.root, text);
    } catch {
      await act(async () => {
        await flushPromises();
      });
    }
  }

  throw new Error(`Text not found: ${text}\nRendered text: ${allText(screen.root).join(" | ")}`);
}

function flushPromises() {
  return new Promise<void>((resolve) => setImmediate(() => resolve()));
}

function allText(root: ReactTestInstance) {
  return root.findAll((node) => node.type === "Text").map((node) => node.children.join(""));
}

function minimalScanResult() {
  return {
    connectedDevices: [],
    dnsServers: ["192.168.1.1"],
    findings: {
      connectedDevices: { source: "network_probe" },
      dnsServers: { source: "network_probe" },
      gatewayIp: { source: "network_probe" },
      ipAddress: { source: "network_probe" },
      networkName: { source: "device" },
      openPorts: { source: "network_probe", value: [] },
      securityProtocol: { source: "device" }
    },
    gatewayIp: "192.168.1.1",
    ipAddress: "192.168.1.10",
    methodology: [],
    networkName: "Praxis-WLAN",
    riskScore: 80,
    scanMode: "standard",
    scanSegment: "practice_wifi",
    securityFindings: [],
    securityProtocol: "WPA2",
    subnetMask: "255.255.255.0",
    subnetScan: {
      candidateHosts: 0,
      mode: "standard",
      scannedEntireRecognizedSubnet: false,
      scannedHosts: 0
    },
    timestamp: new Date("2026-07-14T12:00:00.000Z"),
    vulnerabilities: [],
    wifiSecurity: { protocol: "WPA2" }
  };
}
