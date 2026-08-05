import type { AuthMFAListFactorsResponse } from "@supabase/supabase-js";

declare const jest: { mock(moduleName: string, factory: () => unknown): void };
jest.mock("@/lib/api/supabase", () => ({ supabase: {} }));

import { firstVerifiedTotpFactor, hasVerifiedTotpFactor } from "@/lib/backoffice/auth";

function factors(statuses: Array<"verified" | "unverified">): AuthMFAListFactorsResponse {
  return {
    data: {
      all: statuses.map((status, index) => ({ id: `factor-${index}`, status, factor_type: "totp" as const })),
      totp: statuses.map((status, index) => ({ id: `factor-${index}`, status, factor_type: "totp" as const })),
      phone: [],
      webauthn: []
    },
    error: null
  } as unknown as AuthMFAListFactorsResponse;
}

describe("Backoffice TOTP factor selection", () => {
  it("offers enrollment when no verified TOTP factor exists", () => {
    expect(hasVerifiedTotpFactor(factors([]))).toBe(false);
    expect(hasVerifiedTotpFactor(factors(["unverified"]))).toBe(false);
  });

  it("selects an existing verified factor instead of offering another enrollment", () => {
    const result = factors(["unverified", "verified"]);
    expect(hasVerifiedTotpFactor(result)).toBe(true);
    expect(firstVerifiedTotpFactor(result)?.id).toBe("factor-1");
  });
});
