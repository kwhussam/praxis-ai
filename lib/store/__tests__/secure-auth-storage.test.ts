declare const jest: {
  mock(moduleName: string, factory: () => unknown): void;
  resetModules(): void;
};
declare const __dirname: string;
declare function require(moduleName: string): unknown;

declare function afterEach(fn: () => void): void;

const { readFileSync } = require("fs") as { readFileSync(path: string, encoding: "utf8"): string };
const { resolve } = require("path") as { resolve(...parts: string[]): string };

const mockSecureStoreValues = new Map<string, string>();
let mockSecureStoreAvailable = true;
let mockSecureStoreSetCalls = 0;
// Keychain access can fail per operation even when the module reports itself as available.
let mockGetItemError: Error | null = null;
let mockSetItemError: Error | null = null;
let mockDeleteItemError: Error | null = null;

jest.mock(
  "expo-secure-store",
  () => ({
    isAvailableAsync: async () => mockSecureStoreAvailable,
    getItemAsync: async (key: string) => {
      if (mockGetItemError) throw mockGetItemError;
      return mockSecureStoreValues.get(key) ?? null;
    },
    setItemAsync: async (key: string, value: string) => {
      if (mockSetItemError) throw mockSetItemError;
      mockSecureStoreSetCalls += 1;
      mockSecureStoreValues.set(key, value);
    },
    deleteItemAsync: async (key: string) => {
      if (mockDeleteItemError) throw mockDeleteItemError;
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
    mockGetItemError = null;
    mockSetItemError = null;
    mockDeleteItemError = null;
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

  // isAvailableAsync() only proves the native module is linked. These cases cover a store that
  // reports itself as available and still refuses every real Keychain operation.
  it("keeps auth volatile when a linked SecureStore denies reads with errSecMissingEntitlement", async () => {
    mockSecureStoreAvailable = true;
    mockGetItemError = new Error("errSecMissingEntitlement");
    const storage = createSecureAuthStorage("praxisshield-auth");

    await storage.setItem("supabase.auth.token", "refresh-token");

    // The operational probe fails, so nothing is written and the session survives in RAM only.
    expect(await storage.getItem("supabase.auth.token")).toBe("refresh-token");
    expect(mockSecureStoreSetCalls).toBe(0);
    expect(Array.from(mockSecureStoreValues.values())).toEqual([]);
  });

  it("keeps auth volatile when writing throws after a successful probe", async () => {
    const storage = createSecureAuthStorage("praxisshield-auth");
    mockSetItemError = new Error("errSecInteractionNotAllowed");

    // A failing write must not reject: the caller keeps a working, volatile session.
    await storage.setItem("supabase.auth.token", "refresh-token");

    expect(await storage.getItem("supabase.auth.token")).toBe("refresh-token");
    expect(Array.from(mockSecureStoreValues.values())).toEqual([]);
  });

  it("still signs out when deleting throws", async () => {
    const storage = createSecureAuthStorage("praxisshield-auth");
    await storage.setItem("supabase.auth.token", "refresh-token");
    mockDeleteItemError = new Error("errSecInteractionNotAllowed");

    // Must not reject: a failing Keychain delete may not break sign-out.
    await storage.removeItem("supabase.auth.token");

    // The volatile copy is gone even though the Keychain delete failed.
    mockGetItemError = new Error("errSecMissingEntitlement");
    expect(await storage.getItem("supabase.auth.token")).toBeNull();
  });

  it("loses the volatile token on the next app start", async () => {
    mockSecureStoreAvailable = false;
    const storage = createSecureAuthStorage("praxisshield-auth");
    await storage.setItem("supabase.auth.token", "refresh-token");
    expect(await storage.getItem("supabase.auth.token")).toBe("refresh-token");

    // A fresh module registry is the closest equivalent of restarting the app: the in-memory
    // fallback map is recreated empty, so no token outlives the process.
    jest.resetModules();
    const restarted = require("@/lib/store/secureAuthStorage") as {
      createSecureAuthStorage(namespace: string): { getItem(key: string): Promise<string | null> };
    };

    expect(await restarted.createSecureAuthStorage("praxisshield-auth").getItem("supabase.auth.token"))
      .toBeNull();
  });

  it("never routes tokens through AsyncStorage, SQLite, files or logging", () => {
    // Strip comments first: prose that merely names a forbidden store (for example a comment
    // explaining that AsyncStorage is never used) must not make this check fail, and a comment
    // must never be able to satisfy it either.
    const source = readFileSync(resolve(__dirname, "../secureAuthStorage.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");

    for (const forbidden of [
      "async-storage",
      "AsyncStorage",
      "expo-sqlite",
      "expo-file-system",
      "openDatabaseAsync",
      "writeAsStringAsync",
      "console."
    ]) {
      expect(source).not.toContain(forbidden);
    }
    // sessionStorage is the deliberate web-only path and is not a persistent store.
    expect(source).toContain("sessionStorage");
  });
});
