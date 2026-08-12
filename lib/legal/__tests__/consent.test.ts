declare const jest: { mock(moduleName: string, factory: () => unknown): void };
declare const beforeEach: (callback: () => void) => void;

const calls: Array<{ path: string; options?: Record<string, unknown> }> = [];

jest.mock("@/lib/config/environment", () => ({ AppConfig: { isDemoMode: false } }));
jest.mock("@/lib/api/client", () => ({
  apiRequest: async (path: string, options?: Record<string, unknown>) => {
    calls.push({ path, options });
    return {
      practiceId: "11111111-1111-4111-8111-111111111111",
      consents: {}
    };
  }
}));

import { loadConsentRegistry, setRegistryConsent } from "@/lib/legal/consent";

const practiceId = "11111111-1111-4111-8111-111111111111";

describe("Consent Registry client", () => {
  beforeEach(() => {
    calls.length = 0;
  });

  it("lädt den tenantgebundenen serverseitigen Registry-Status", async () => {
    await loadConsentRegistry(practiceId);
    expect(calls).toEqual([{
      path: `/api/legal/consent/status?practiceId=${practiceId}`,
      options: undefined
    }]);
  });

  it("sendet nur Zweck und Entscheidung; Scope, Version und Ablauf bleiben serverautoritativ", async () => {
    await setRegistryConsent(practiceId, "hibp_email_leak_check", true);
    expect(calls).toEqual([{
      path: "/api/legal/consent",
      options: {
        method: "POST",
        body: { practiceId, type: "hibp_email_leak_check", accepted: true }
      }
    }]);
  });

  it("lehnt ungültige Praxis-IDs vor einem Request ab", async () => {
    await expect(loadConsentRegistry("foreign-practice")).rejects.toThrow("Praxis-ID");
    expect(calls).toEqual([]);
  });
});
