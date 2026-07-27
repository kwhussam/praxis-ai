declare const jest: {
  mock(moduleName: string, factory: () => unknown): void;
};

jest.mock("@/lib/api/client", () => {
  const apiRequest = (...args: unknown[]) => {
    apiRequest.mock.calls.push(args);
    return Promise.resolve({ ok: true, practice_id: "practice-1", onboarding_status: "draft" });
  };
  apiRequest.mock = { calls: [] as unknown[][] };
  return { apiRequest };
});

import { apiRequest } from "@/lib/api/client";
import { createBackofficePractice, type BackofficeMutationIds } from "@/lib/backoffice/api";
import type { CreatePracticeInput } from "@/lib/backoffice/types";

const input: CreatePracticeInput = {
  practiceKind: "general",
  legalName: "Muster GmbH",
  displayName: "Muster",
  contactFirstName: "Mina",
  contactLastName: "Muster",
  contactEmail: "mina@example.test",
  contactPhone: "+49 30 123456",
  street: "Markt 1",
  postalCode: "10115",
  city: "Berlin",
  countryCode: "DE"
};

describe("B3 create-practice idempotency", () => {
  it("uses caller-owned identifiers unchanged across retries", async () => {
    const ids: BackofficeMutationIds = { idempotencyKey: "attempt-1", requestId: "request-1" };

    await createBackofficePractice(input, ids);
    await createBackofficePractice(input, ids);

    const calls = (apiRequest as unknown as { mock: { calls: Array<[string, { headers?: Record<string, string> }]> } }).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][1]?.headers).toEqual({ "Idempotency-Key": "attempt-1", "X-Request-Id": "request-1" });
    expect(calls[1][1]?.headers).toEqual(calls[0][1]?.headers);
  });
});
