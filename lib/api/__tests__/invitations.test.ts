declare const jest: {
  mock(moduleName: string, factory: () => unknown): void;
};

jest.mock("@/lib/api/client", () => {
  class ApiError extends Error {
    readonly status: number;
    constructor(...mockArgs: [string, number]) { super(mockArgs[0]); this.status = mockArgs[1]; }
  }
  class ApiTimeoutError extends Error {
    constructor(...mockArgs: [number]) { super(String(mockArgs[0])); }
  }
  const apiRequest = (...args: unknown[]) => {
    apiRequest.mock.calls.push(args);
    return Promise.resolve({ ok: true, practice_id: "practice-1", membership_id: "m-1", role: "practice_owner", status: "active" });
  };
  apiRequest.mock = { calls: [] as unknown[][] };
  return { apiRequest, ApiError, ApiTimeoutError };
});

import { apiRequest } from "@/lib/api/client";
import { ApiError, ApiTimeoutError } from "@/lib/api/client";
import { newRedeemIds, redeemInvitation, shouldResetRedeemAttempt } from "@/lib/api/invitations";

function getCalls() {
  return (apiRequest as unknown as { mock: { calls: unknown[][] } }).mock.calls;
}

describe("invitation redeem client", () => {
  it("posts the code to the server-authorized redeem endpoint with idempotency headers", async () => {
    const before = getCalls().length;
    await redeemInvitation("ABCDEFGHJK", { idempotencyKey: "redeem-1", requestId: "request-redeem-1" });
    const call = getCalls()[before];
    expect(call[0]).toBe("/api/invitations/redeem");
    expect(call[1]).toMatchObject({
      method: "POST",
      body: { code: "ABCDEFGHJK" },
      headers: { "Idempotency-Key": "redeem-1", "X-Request-Id": "request-redeem-1" }
    });
  });

  it("mints unique, non-empty idempotency identifiers per attempt", () => {
    const a = newRedeemIds();
    const b = newRedeemIds();
    expect(a.idempotencyKey.length).toBeGreaterThan(0);
    expect(a.requestId.length).toBeGreaterThan(0);
    expect(a.idempotencyKey).not.toBe(b.idempotencyKey);
  });

  it("keeps retry identifiers after ambiguous transport/server failures", () => {
    expect(shouldResetRedeemAttempt(new ApiTimeoutError(20_000))).toBe(false);
    expect(shouldResetRedeemAttempt(new Error("network"))).toBe(false);
    expect(shouldResetRedeemAttempt(new ApiError("rate limited", 429))).toBe(false);
    expect(shouldResetRedeemAttempt(new ApiError("server", 500))).toBe(false);
    expect(shouldResetRedeemAttempt(new ApiError("terminal", 400))).toBe(true);
  });
});
