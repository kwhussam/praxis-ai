const mockValues = new Map<string, string>();
let mockAvailable = true;

declare const jest: {
  mock(moduleName: string, factory: () => unknown): void;
};
declare function beforeEach(fn: () => void): void;

jest.mock("expo-secure-store", () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: "WHEN_UNLOCKED_THIS_DEVICE_ONLY",
  isAvailableAsync: async () => mockAvailable,
  getItemAsync: async (key: string) => mockValues.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    mockValues.set(key, value);
  },
  deleteItemAsync: async (key: string) => {
    mockValues.delete(key);
  }
}));

import { DEFAULT_QUESTIONNAIRE_ANSWERS } from "@/lib/security/questionnaire";
import {
  deleteQuestionnaireDraft,
  loadQuestionnaireDraft,
  saveQuestionnaireDraft
} from "@/lib/store/questionnaireDraftStorage";

describe("questionnaireDraftStorage", () => {
  beforeEach(() => {
    mockValues.clear();
    mockAvailable = true;
  });

  it("round-trips a practice-bound draft through SecureStore chunks", async () => {
    const answers = { ...DEFAULT_QUESTIONNAIRE_ANSWERS, mfaEmail: true };
    expect(await saveQuestionnaireDraft("practice-a", answers, "access_mfa")).toBe(true);

    const draft = await loadQuestionnaireDraft("practice-a");
    expect(draft?.answers.mfaEmail).toBe(true);
    expect(draft?.sectionId).toBe("access_mfa");
    expect(Array.from(mockValues.keys()).some((key) => key.includes("manifest"))).toBe(true);
  });

  it("never persists when SecureStore is unavailable", async () => {
    mockAvailable = false;
    expect(await saveQuestionnaireDraft("practice-a", DEFAULT_QUESTIONNAIRE_ANSWERS)).toBe(false);
    expect(mockValues.size).toBe(0);
  });

  it("isolates drafts by practice and deletes all active chunks", async () => {
    await saveQuestionnaireDraft("practice-a", { ...DEFAULT_QUESTIONNAIRE_ANSWERS, mfa: true });
    await saveQuestionnaireDraft("practice-b", { ...DEFAULT_QUESTIONNAIRE_ANSWERS, mfa: false });
    await deleteQuestionnaireDraft("practice-a");

    expect(await loadQuestionnaireDraft("practice-a")).toBeNull();
    expect((await loadQuestionnaireDraft("practice-b"))?.answers.mfa).toBe(false);
  });
});
