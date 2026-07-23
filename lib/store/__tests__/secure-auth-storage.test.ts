declare const jest: {
  mock(moduleName: string, factory: () => unknown): void;
};

declare function afterEach(fn: () => void): void;

const mockSecureStoreValues = new Map<string, string>();
let mockSecureStoreAvailable = true;
let mockSecureStoreSetCalls = 0;

jest.mock(
  "expo-secure-store",
  () => ({
    isAvailableAsync: async () => mockSecureStoreAvailable,
    getItemAsync: async (key: string) => mockSecureStoreValues.get(key) ?? null,
    setItemAsync: async (key: string, value: string) => {
      mockSecureStoreSetCalls += 1;
      mockSecureStoreValues.set(key, value);
    },
    deleteItemAsync: async (key: string) => {
      mockSecureStoreValues.delete(key);
    }
  })
);

import { createSecureAuthStorage } from "@/lib/store/secureAuthStorage";

describe("createSecureAuthStorage", () => {
  afterEach(() => {
    mockSecureStoreValues.clear();
    mockSecureStoreAvailable = true;
    mockSecureStoreSetCalls = 0;
  });

  it("persists Supabase auth values in SecureStore", async () => {
    const storage = createSecureAuthStorage("praxisshield-auth");

    await storage.setItem("supabase.auth.token", "refresh-token");

    expect(await storage.getItem("supabase.auth.token")).toBe("refresh-token");
    expect(Array.from(mockSecureStoreValues.values())).toEqual(["refresh-token"]);
  });

  it("falls back only to non-persistent memory when SecureStore is unavailable", async () => {
    mockSecureStoreAvailable = false;
    const storage = createSecureAuthStorage("praxisshield-auth");

    await storage.setItem("supabase.auth.token", "refresh-token");

    expect(await storage.getItem("supabase.auth.token")).toBe("refresh-token");
    expect(mockSecureStoreSetCalls).toBe(0);
    expect(Array.from(mockSecureStoreValues.values())).toEqual([]);
  });

  it("splits large Supabase sessions across bounded SecureStore entries", async () => {
    const storage = createSecureAuthStorage("praxisshield-auth");
    const session = "session-value-".repeat(240);

    await storage.setItem("supabase.auth.token", session);

    expect(await storage.getItem("supabase.auth.token")).toBe(session);
    expect(mockSecureStoreSetCalls).toBeGreaterThan(1);
    expect(Array.from(mockSecureStoreValues.values()).every((value) => value.length <= 500)).toBe(true);
  });

  it("removes every chunk of a large Supabase session", async () => {
    const storage = createSecureAuthStorage("praxisshield-auth");

    await storage.setItem("supabase.auth.token", "large-session-".repeat(240));
    await storage.removeItem("supabase.auth.token");

    expect(mockSecureStoreValues.size).toBe(0);
  });
});
