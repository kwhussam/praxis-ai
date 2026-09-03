const mockValues = new Map<string, string>();
let mockAvailable = true;
let mockManifestDelays: number[] = [];
let mockOperationError: Error | null = null;

declare const jest: {
  mock(moduleName: string, factory: () => unknown): void;
};
declare function beforeEach(fn: () => void): void;

jest.mock("expo-secure-store", () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: "WHEN_UNLOCKED_THIS_DEVICE_ONLY",
  isAvailableAsync: async () => mockAvailable,
  getItemAsync: async (key: string) => {
    if (mockOperationError) throw mockOperationError;
    return mockValues.get(key) ?? null;
  },
  setItemAsync: async (key: string, value: string) => {
    if (mockOperationError) throw mockOperationError;
    if (key.endsWith(".manifest")) {
      const delay = mockManifestDelays.shift() ?? 0;
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    }
    mockValues.set(key, value);
  },
  deleteItemAsync: async (key: string) => {
    if (mockOperationError) throw mockOperationError;
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
    mockManifestDelays = [];
    mockOperationError = null;
  });

  it("round-trips a practice-bound draft through SecureStore chunks", async () => {
    const answers = { ...DEFAULT_QUESTIONNAIRE_ANSWERS, mfaEmail: true };
    expect(await saveQuestionnaireDraft("practice-a", answers, "access_mfa", ["mfaEmail"], "health")).toBe(true);

    const draft = await loadQuestionnaireDraft("practice-a");
    expect(draft?.answers.mfaEmail).toBe(true);
    expect(draft?.sectionId).toBe("access_mfa");
    expect(draft?.answeredKeys).toEqual(["mfaEmail"]);
    expect(draft?.assessmentProfile).toBe("health");
    expect(Array.from(mockValues.keys()).some((key) => key.includes("manifest"))).toBe(true);
  });

  it("never persists when SecureStore is unavailable", async () => {
    mockAvailable = false;
    expect(await saveQuestionnaireDraft("practice-a", DEFAULT_QUESTIONNAIRE_ANSWERS)).toBe(false);
    expect(mockValues.size).toBe(0);
  });

  it("keeps the draft volatile when a linked SecureStore denies real operations", async () => {
    mockOperationError = new Error("errSecMissingEntitlement");

    expect(await saveQuestionnaireDraft("practice-a", DEFAULT_QUESTIONNAIRE_ANSWERS)).toBe(false);
    expect(await loadQuestionnaireDraft("practice-a")).toBeNull();
    await deleteQuestionnaireDraft("practice-a");
    expect(mockValues.size).toBe(0);
  });

  it("isolates drafts by practice and deletes all active chunks", async () => {
    await saveQuestionnaireDraft("practice-a", { ...DEFAULT_QUESTIONNAIRE_ANSWERS, mfa: true });
    await saveQuestionnaireDraft("practice-b", { ...DEFAULT_QUESTIONNAIRE_ANSWERS, mfa: false });
    await deleteQuestionnaireDraft("practice-a");

    expect(await loadQuestionnaireDraft("practice-a")).toBeNull();
    expect((await loadQuestionnaireDraft("practice-b"))?.answers.mfa).toBe(false);
  });

  it("serialisiert schnelle Autosaves, sodass der neueste Entwurf gewinnt", async () => {
    mockManifestDelays = [25, 0];
    const first = saveQuestionnaireDraft(
      "practice-a",
      { ...DEFAULT_QUESTIONNAIRE_ANSWERS, mfa: true },
      "access_mfa",
      ["mfa"]
    );
    const second = saveQuestionnaireDraft(
      "practice-a",
      { ...DEFAULT_QUESTIONNAIRE_ANSWERS, mfa: false },
      "backup_restore",
      ["mfa"]
    );

    await Promise.all([first, second]);
    const draft = await loadQuestionnaireDraft("practice-a");
    expect(draft?.answers.mfa).toBe(false);
    expect(draft?.sectionId).toBe("backup_restore");
  });

  it("bereinigt registrierte verwaiste Generationen beim nächsten Speichern", async () => {
    await saveQuestionnaireDraft("practice-a", DEFAULT_QUESTIONNAIRE_ANSWERS);
    const registryKey = Array.from(mockValues.keys()).find((key) => key.endsWith(".generations"));
    expect(registryKey).toBeDefined();
    const registry = JSON.parse(mockValues.get(registryKey ?? "") ?? "{}") as {
      version: number;
      generations: Array<{ version: number; generation: string; chunkCount: number }>;
    };
    registry.generations.push({ version: 1, generation: "orphan-generation", chunkCount: 2 });
    mockValues.set(registryKey ?? "", JSON.stringify(registry));
    const keyPrefix = (registryKey ?? "").replace(/\.generations$/, "");
    mockValues.set(`${keyPrefix}.orphan-generation.0`, "orphan-a");
    mockValues.set(`${keyPrefix}.orphan-generation.1`, "orphan-b");

    await saveQuestionnaireDraft("practice-a", DEFAULT_QUESTIONNAIRE_ANSWERS);

    expect(mockValues.has(`${keyPrefix}.orphan-generation.0`)).toBe(false);
    expect(mockValues.has(`${keyPrefix}.orphan-generation.1`)).toBe(false);
    const cleaned = JSON.parse(mockValues.get(registryKey ?? "") ?? "{}") as {
      generations: Array<{ generation: string }>;
    };
    expect(cleaned.generations).toHaveLength(1);
    expect(cleaned.generations[0].generation).not.toBe("orphan-generation");
  });

  it("reiht das Löschen hinter ein laufendes Autosave ein und hinterlässt keinen Draft", async () => {
    mockManifestDelays = [20];
    const saving = saveQuestionnaireDraft(
      "practice-a",
      { ...DEFAULT_QUESTIONNAIRE_ANSWERS, mfa: true },
      "access_mfa",
      ["mfa"]
    );
    const deleting = deleteQuestionnaireDraft("practice-a");

    await Promise.all([saving, deleting]);
    expect(await loadQuestionnaireDraft("practice-a")).toBeNull();
    expect(
      Array.from(mockValues.keys()).filter((key) => key.includes("practice-a"))
    ).toEqual([]);
  });
});
