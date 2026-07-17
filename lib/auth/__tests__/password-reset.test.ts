declare const jest: {
  mock(moduleName: string, factory: () => unknown): void;
};

const mockResetCalls: string[] = [];
let mockResetError: Error | null = null;

jest.mock("@/lib/supabase/client", () => ({
  supabase: {
    auth: {
      resetPasswordForEmail: async (email: string) => {
        mockResetCalls.push(email);
        return { data: {}, error: mockResetError };
      }
    }
  }
}));

import { requestPasswordReset } from "@/lib/auth/password-reset";

describe("requestPasswordReset", () => {
  it("normalisiert die E-Mail vor dem Supabase-Aufruf", async () => {
    mockResetCalls.length = 0;
    mockResetError = null;

    await requestPasswordReset("  Team@Praxis.DE  ");

    expect(mockResetCalls).toEqual(["team@praxis.de"]);
  });

  it("gibt Supabase-Fehler an den UI-Fehlerzustand weiter", async () => {
    mockResetCalls.length = 0;
    mockResetError = new Error("Supabase reset failed");

    await expect(requestPasswordReset("team@praxis.de")).rejects.toThrow(/Supabase reset failed/);
  });
});
