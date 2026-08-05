import React from "react";
import renderer, { act, type ReactTestRenderer } from "react-test-renderer";

import { DEFAULT_QUESTIONNAIRE_ANSWERS } from "@/lib/security/questionnaire";
import type { QuestionnaireDraft } from "@/lib/store/questionnaireDraftStorage";
import { useCheckStore } from "@/lib/store/check";

type Deferred<T> = {
  promise: Promise<T>;
  resolve(value: T): void;
};

declare const jest: {
  mock(moduleName: string, factory: () => unknown): void;
  useFakeTimers(): void;
  useRealTimers(): void;
  advanceTimersByTimeAsync(ms: number): Promise<void>;
};
declare function beforeEach(fn: () => void): void;
declare function afterEach(fn: () => void): void;

var mockLoadedDraft: Promise<QuestionnaireDraft | null> = Promise.resolve(null);
var mockSavedDrafts: unknown[][] = [];

jest.mock("react-native", () => {
  const React = require("react");
  const element = (type: string) => ({ children, ...props }: { children?: React.ReactNode }) =>
    React.createElement(type, props, children);
  const refElement = (type: string) => React.forwardRef(
    ({ children, ...props }: { children?: React.ReactNode }, ref: React.Ref<unknown>) =>
      React.createElement(type, { ...props, ref }, children)
  );
  return {
    AccessibilityInfo: { announceForAccessibility: () => undefined, setAccessibilityFocus: () => undefined },
    ActivityIndicator: element("ActivityIndicator"),
    findNodeHandle: () => null,
    Pressable: element("Pressable"),
    ScrollView: refElement("ScrollView"),
    StyleSheet: { create: (styles: unknown) => styles },
    Text: refElement("Text"),
    View: element("View")
  };
});

jest.mock("@expo/vector-icons", () => ({ Ionicons: () => require("react").createElement("Ionicons") }));
jest.mock("expo-router", () => ({ router: { push: () => undefined } }));
jest.mock("@/components/ui/AnimatedButton", () => {
  const React = require("react");
  return { AnimatedButton: ({ label, onPress, testID }: { label: string; onPress: () => void; testID?: string }) =>
    React.createElement("Button", { label, onPress, testID }) };
});
jest.mock("@/components/ui/GlassCard", () => {
  const React = require("react");
  return { GlassCard: ({ children }: { children: React.ReactNode }) => React.createElement("View", null, children) };
});
jest.mock("@/components/ui/Screen", () => {
  const React = require("react");
  return { Screen: ({ children }: { children: React.ReactNode }) => React.createElement("View", null, children) };
});
jest.mock("@/lib/api/client", () => ({ apiRequest: async () => ({ ok: true }) }));
jest.mock("@/lib/store/questionnaireDraftStorage", () => ({
  deleteQuestionnaireDraft: async () => undefined,
  loadQuestionnaireDraft: () => mockLoadedDraft,
  saveQuestionnaireDraft: async (...args: unknown[]) => {
    mockSavedDrafts.push(args);
    return true;
  }
}));
jest.mock("@/lib/store/session", () => ({
  useSessionStore: (selector: (state: unknown) => unknown) => selector({ practice: { id: "practice-a" } })
}));

import QuestionnaireScreen from "../questionnaire";

describe("QuestionnaireScreen draft autosave", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockLoadedDraft = Promise.resolve(null);
    mockSavedDrafts = [];
    useCheckStore.setState({
      answers: { ...DEFAULT_QUESTIONNAIRE_ANSWERS },
      answeredKeys: [],
      assessmentProfile: "general"
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("speichert nicht, bevor ein verzögertes Draft-Load abgeschlossen ist", async () => {
    const loaded = deferred<QuestionnaireDraft | null>();
    mockLoadedDraft = loaded.promise;
    const tree = renderer.create(<QuestionnaireScreen />);

    await act(async () => { await jest.advanceTimersByTimeAsync(1_000); });
    expect(mockSavedDrafts).toHaveLength(0);

    loaded.resolve(draftWithMfa(true));
    await act(async () => { await loaded.promise; });
    await act(async () => { await jest.advanceTimersByTimeAsync(300); });

    expect(mockSavedDrafts).toHaveLength(1);
    expect((mockSavedDrafts[0][1] as Record<string, unknown>).mfa).toBe(true);
    unmount(tree);
  });

  it("debounced schnelle Eingaben und speichert ausschließlich den neuesten Stand", async () => {
    const tree = renderer.create(<QuestionnaireScreen />);
    await act(async () => { await mockLoadedDraft; });
    mockSavedDrafts = [];

    const yes = tree.root.findByProps<{ testID: string; onPress: () => void }>({ testID: "questionnaire-answer-mfa-yes" });
    const no = tree.root.findByProps<{ testID: string; onPress: () => void }>({ testID: "questionnaire-answer-mfa-no" });
    act(() => {
      yes.props.onPress();
      no.props.onPress();
    });
    await act(async () => { await jest.advanceTimersByTimeAsync(299); });
    expect(mockSavedDrafts).toHaveLength(0);
    await act(async () => { await jest.advanceTimersByTimeAsync(1); });

    expect(mockSavedDrafts).toHaveLength(1);
    expect((mockSavedDrafts[0][1] as Record<string, unknown>).mfa).toBe(false);
    unmount(tree);
  });

  it("entfernt den ausstehenden Autosave beim Unmount", async () => {
    const tree = renderer.create(<QuestionnaireScreen />);
    await act(async () => { await mockLoadedDraft; });
    mockSavedDrafts = [];

    act(() => {
      tree.root.findByProps<{ testID: string; onPress: () => void }>({ testID: "questionnaire-answer-mfa-yes" }).props.onPress();
      unmount(tree);
    });
    await act(async () => { await jest.advanceTimersByTimeAsync(300); });

    expect(mockSavedDrafts).toHaveLength(0);
  });
});

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function draftWithMfa(mfa: boolean): QuestionnaireDraft {
  return {
    version: 1,
    practiceId: "practice-a",
    answers: { ...DEFAULT_QUESTIONNAIRE_ANSWERS, mfa },
    answeredKeys: ["mfa"],
    assessmentProfile: "general",
    sectionId: "access_mfa",
    createdAt: "2026-08-05T00:00:00.000Z",
    updatedAt: "2026-08-05T00:00:00.000Z",
    expiresAt: "2026-08-19T00:00:00.000Z"
  };
}

function unmount(tree: ReactTestRenderer): void {
  (tree as unknown as { unmount(): void }).unmount();
}
