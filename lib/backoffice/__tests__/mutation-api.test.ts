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
import {
  createBackofficeInvitation,
  createBackofficePractice,
  getBackofficePractice,
  listBackofficeInvitations,
  listBackofficeAuditEvents,
  listBackofficeMemberships,
  listBackofficePractices,
  revokeBackofficeInvitation,
  updateBackofficePractice,
  type BackofficeMutationIds
} from "@/lib/backoffice/api";
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

  it("encodes server-side list search and pagination parameters", async () => {
    const callsBefore = getCalls().length;
    await listBackofficePractices({ search: "Praxis Berlin", offset: 25, limit: 25 });
    const [path] = getCalls()[callsBefore];
    expect(path).toBe("/api/backoffice/practices?search=Praxis+Berlin&offset=25&limit=25");
  });

  it("uses the scoped detail endpoint and maps update fields to the Worker contract", async () => {
    const callsBefore = getCalls().length;
    const ids: BackofficeMutationIds = { idempotencyKey: "update-1", requestId: "request-update-1" };
    await getBackofficePractice("practice-1");
    await updateBackofficePractice("practice-1", input, ids, "suspended");

    expect(getCalls()[callsBefore][0]).toBe("/api/backoffice/practices/practice-1");
    const [path, options] = getCalls()[callsBefore + 1];
    expect(path).toBe("/api/backoffice/practices/practice-1");
    expect(options?.headers).toEqual({ "Idempotency-Key": "update-1", "X-Request-Id": "request-update-1" });
    expect(options?.body).toMatchObject({
      newStatus: "suspended",
      patch: { legal_name: "Muster GmbH", display_name: "Muster", contact_email: "mina@example.test" }
    });
  });

  it("uses scoped invitation and membership endpoints without exposing server secrets", async () => {
    const callsBefore = getCalls().length;
    const ids = { idempotencyKey: "invite-1", requestId: "request-invite-1" };
    await listBackofficeInvitations("practice-1");
    await listBackofficeMemberships("practice-1");
    await createBackofficeInvitation("practice-1", "owner@example.test", "practice_owner", "2026-08-04T00:00:00.000Z", ids);
    await revokeBackofficeInvitation("invitation-1", ids);

    expect(getCalls()[callsBefore][0]).toBe("/api/backoffice/practices/practice-1/invitations");
    expect(getCalls()[callsBefore + 1][0]).toBe("/api/backoffice/practices/practice-1/memberships");
    const [invitePath, inviteOptions] = getCalls()[callsBefore + 2];
    expect(invitePath).toBe("/api/backoffice/practices/practice-1/invitations");
    expect(inviteOptions?.method).toBe("POST");
    expect(inviteOptions?.body).toMatchObject({ targetEmail: "owner@example.test", intendedRole: "practice_owner", deliveryChannel: "in_person_code" });
    expect(inviteOptions?.headers).toEqual({ "Idempotency-Key": "invite-1", "X-Request-Id": "request-invite-1" });
    expect(getCalls()[callsBefore + 3][0]).toBe("/api/backoffice/invitations/invitation-1/revoke");
  });

  it("loads audit events only through the server-authorized endpoint", async () => {
    const callsBefore = getCalls().length;
    await listBackofficeAuditEvents();
    expect(getCalls()[callsBefore]).toEqual(["/api/backoffice/audit"]);
  });
});

function getCalls() {
  return (apiRequest as unknown as {
    mock: { calls: Array<[string, { method?: string; headers?: Record<string, string>; body?: Record<string, unknown> }?]> };
  }).mock.calls;
}
