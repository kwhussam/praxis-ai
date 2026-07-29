declare const jest: {
  mock(moduleName: string, factory: () => unknown): void;
};

jest.mock("@/lib/api/client", () => {
  const apiRequest = (...args: unknown[]) => {
    apiRequest.mock.calls.push(args);
    return Promise.resolve({ ok: true, practice_id: "practice-1", membership_id: "m-1", role: "practice_owner", status: "active" });
  };
  apiRequest.mock = { calls: [] as unknown[][] };
  return { apiRequest };
});

import { apiRequest } from "@/lib/api/client";
import { newRedeemIds, redeemInvitation } from "@/lib/api/invitations";

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
});
