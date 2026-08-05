declare const jest: { mock(moduleName: string, factory: () => unknown): void };

const mockValues = new Map<string, string>();
let mockAvailable = true;
jest.mock("expo-secure-store", () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: "device-only",
  isAvailableAsync: async () => mockAvailable,
  getItemAsync: async (key: string) => mockValues.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => { mockValues.set(key, value); },
  deleteItemAsync: async (key: string) => { mockValues.delete(key); }
}));

import { clearPendingInvitationCode, getPendingInvitationCode, normalizeInvitationCode, savePendingInvitationCode } from "@/lib/auth/pending-invitation";

describe("pending invitation handoff", () => {
  it("normalizes and persists only a valid device-bound Crockford code", async () => {
    await savePendingInvitationCode("abcd-efgh-jk");
    expect(normalizeInvitationCode("abcd efgh-jk")).toBe("ABCDEFGHJK");
    expect(await getPendingInvitationCode()).toBe("ABCDEFGHJK");
    expect(Array.from(mockValues.values())).toEqual(["ABCDEFGHJK"]);
    await clearPendingInvitationCode();
    expect(await getPendingInvitationCode()).toBeNull();
  });

  it("rejects malformed codes and uses only volatile memory when SecureStore is unavailable", async () => {
    await expect(savePendingInvitationCode("bad-code")).rejects.toThrow("invalid_invitation_code");
    mockAvailable = false;
    await savePendingInvitationCode("ABCDEFGHJK");
    expect(await getPendingInvitationCode()).toBe("ABCDEFGHJK");
    expect(mockValues.size).toBe(0);
    await clearPendingInvitationCode();
    mockAvailable = true;
  });

  it("removes a malformed persisted value instead of repeatedly loading it", async () => {
    mockValues.set("praxisshield.pending-invitation.v1", "not-a-valid-code");

    expect(await getPendingInvitationCode()).toBeNull();
    expect(mockValues.size).toBe(0);
  });
});
