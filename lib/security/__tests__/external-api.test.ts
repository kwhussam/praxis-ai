declare const jest: {
  mock(moduleName: string, factory: () => unknown): void;
};

const mockApiRequestCalls: Array<{ path: string; options: unknown }> = [];

jest.mock("@/lib/api/client", () => ({
  apiRequest: async (path: string, options: unknown) => {
    mockApiRequestCalls.push({ path, options });
    return {
      domain: "praxis.de",
      timestamp: new Date().toISOString(),
      checks: {},
      overall_score: 80,
      critical_count: 0,
      warning_count: 0,
      findings: [],
      checkedAt: new Date().toISOString(),
      scoreImpact: -20,
      providers: {},
      provider_statuses: {}
    };
  }
}));

import { runExternalCheck } from "@/lib/security/external";

describe("runExternalCheck", () => {
  it("rejects missing practiceId before calling the Worker", async () => {
    mockApiRequestCalls.length = 0;

    await expectAsyncError(runExternalCheck("praxis.de", "kontakt@praxis.de"), /Praxis-ID/);

    expect(mockApiRequestCalls).toEqual([]);
  });

  it("rejects invalid practiceId before calling the Worker", async () => {
    mockApiRequestCalls.length = 0;

    await expectAsyncError(runExternalCheck("praxis.de", "kontakt@praxis.de", "demo-practice"), /Praxis-ID/);

    expect(mockApiRequestCalls).toEqual([]);
  });

  it("uses the authenticated practice endpoint for valid practiceId", async () => {
    mockApiRequestCalls.length = 0;

    await runExternalCheck("praxis.de", "kontakt@praxis.de", "11111111-1111-4111-8111-111111111111");

    expect(mockApiRequestCalls).toHaveLength(1);
    expect(mockApiRequestCalls[0]).toMatchObject({
      path: "/api/check/external",
      options: {
        method: "POST",
        body: {
          domain: "praxis.de",
          email: "kontakt@praxis.de",
          practiceId: "11111111-1111-4111-8111-111111111111",
          consent: true
        }
      }
    });
  });
});

async function expectAsyncError(promise: Promise<unknown>, pattern: RegExp) {
  try {
    await promise;
    throw new Error("Expected async operation to fail");
  } catch (error) {
    expect(error instanceof Error ? error.message : String(error)).toMatch(pattern);
  }
}
