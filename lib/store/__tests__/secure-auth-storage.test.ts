declare const jest: {
  mock(moduleName: string, factory: () => unknown): void;
};

declare function afterEach(fn: () => void): void;

const mockSecureStoreValues = new Map<string, string>();
const mockMmkvWrites: string[] = [];
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

jest.mock("react-native-mmkv", () => ({
  MMKV: class {
    set(key: string) {
      mockMmkvWrites.push(key);
    }
  }
}));

import { createSecureAuthStorage } from "@/lib/store/secureAuthStorage";

describe("createSecureAuthStorage", () => {
  afterEach(() => {
    mockSecureStoreValues.clear();
    mockMmkvWrites.length = 0;
    mockSecureStoreAvailable = true;
    mockSecureStoreSetCalls = 0;
  });

  it("persists Supabase auth values in SecureStore without writing to MMKV", async () => {
    const storage = createSecureAuthStorage("praxisshield-auth");

    await storage.setItem("supabase.auth.token", "refresh-token");

    expect(await storage.getItem("supabase.auth.token")).toBe("refresh-token");
    expect(Array.from(mockSecureStoreValues.values())).toEqual(["refresh-token"]);
    expect(mockMmkvWrites).toEqual([]);
  });

  it("falls back only to non-persistent memory when SecureStore is unavailable", async () => {
    mockSecureStoreAvailable = false;
    const storage = createSecureAuthStorage("praxisshield-auth");

    await storage.setItem("supabase.auth.token", "refresh-token");

    expect(await storage.getItem("supabase.auth.token")).toBe("refresh-token");
    expect(mockSecureStoreSetCalls).toBe(0);
    expect(Array.from(mockSecureStoreValues.values())).toEqual([]);
    expect(mockMmkvWrites).toEqual([]);
  });
});
