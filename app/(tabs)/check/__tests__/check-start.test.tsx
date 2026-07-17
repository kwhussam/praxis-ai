import React from "react";
import renderer, { act, type ReactTestInstance } from "react-test-renderer";

type MockFunction = {
  (...args: unknown[]): unknown;
};

declare const jest: {
  fn(): MockFunction;
  mock(moduleName: string, factory: () => unknown): void;
};

var mockRunExternalCheck = jest.fn();
var mockPushedRoutes: unknown[] = [];

jest.mock("react-native", () => {
  const React = require("react");
  return {
    StyleSheet: { create: (styles: unknown) => styles },
    Text: ({ children, ...props }: { children?: React.ReactNode }) => React.createElement("Text", props, children),
    View: ({ children, ...props }: { children?: React.ReactNode }) => React.createElement("View", props, children)
  };
});

jest.mock("expo-router", () => ({
  router: {
    push: (route: unknown) => mockPushedRoutes.push(route)
  }
}));

jest.mock("@/components/ui/AnimatedButton", () => ({
  AnimatedButton: ({ label, onPress }: { label: string; onPress: () => void }) => {
    const React = require("react");
    return React.createElement("Button", { label, onPress });
  }
}));

jest.mock("@/components/ui/GlassCard", () => ({
  GlassCard: ({ children }: { children: React.ReactNode }) => {
    const React = require("react");
    return React.createElement("View", null, children);
  }
}));

jest.mock("@/components/ui/Screen", () => ({
  Screen: ({ children }: { children: React.ReactNode }) => {
    const React = require("react");
    return React.createElement("View", null, children);
  }
}));

jest.mock("@/lib/config/environment", () => ({
  AppConfig: {
    features: { externalCheckEnabled: false }
  }
}));

jest.mock("@/lib/security/external", () => ({
  runExternalCheck: (...args: unknown[]) => mockRunExternalCheck(...args)
}));

import CheckStartScreen from "../index";

describe("CheckStartScreen", () => {
  it("startet bei deaktiviertem Flag keinen externen Check", () => {
    mockPushedRoutes = [];
    const tree = renderer.create(<CheckStartScreen />);
    const text = allText(tree.root);

    expect(text).toContain("3. Externer Check");
    expect(text).toContain("IN VORBEREITUNG");
    expect(text).not.toContain("bekannte Datenleck-Hinweise");

    const startButton = tree.root.findByProps<{ label: string; onPress: () => void }>({ label: "Check starten" });
    act(() => startButton.props.onPress());

    expect(mockPushedRoutes).toEqual(["/(tabs)/check/questionnaire"]);
    expect(mockRunExternalCheck).not.toHaveBeenCalled();
  });
});

function allText(root: ReactTestInstance): string {
  return root
    .findAll((node) => node.type === "Text")
    .map((node) => node.children.join(""))
    .join(" ");
}
