import { apiRequest } from "@/lib/api/client";
import type {
  BackofficePracticeDetailResponse,
  BackofficePracticePage,
  BackofficeInvitation,
  BackofficeAuditEvent,
  BackofficeMembership,
  CreateInvitationResult,
  CreatePracticeInput,
  CreatePracticeResult,
  OnboardingStatus,
  PracticeMemberRole,
  UpdatePracticeInput
} from "@/lib/backoffice/types";

export async function listBackofficePractices(options: { search?: string; offset?: number; limit?: number } = {}) {
  const params = new URLSearchParams();
  if (options.search?.trim()) params.set("search", options.search.trim());
  params.set("offset", String(options.offset ?? 0));
  params.set("limit", String(options.limit ?? 25));
  return apiRequest<BackofficePracticePage>(`/api/backoffice/practices?${params.toString()}`);
}

export async function getBackofficePractice(practiceId: string) {
  return apiRequest<BackofficePracticeDetailResponse>(`/api/backoffice/practices/${practiceId}`);
}

export type BackofficeMutationIds = {
  idempotencyKey: string;
  requestId: string;
};

export async function createBackofficePractice(input: CreatePracticeInput, ids: BackofficeMutationIds) {
  return apiRequest<CreatePracticeResult>("/api/backoffice/practices", {
    method: "POST",
    body: input,
    headers: {
      "Idempotency-Key": ids.idempotencyKey,
      "X-Request-Id": ids.requestId
    }
  });
}

export async function updateBackofficePractice(
  practiceId: string,
  input: UpdatePracticeInput,
  ids: BackofficeMutationIds,
  newStatus?: OnboardingStatus
) {
  return apiRequest<CreatePracticeResult>(`/api/backoffice/practices/${practiceId}`, {
    method: "PATCH",
    body: {
      patch: {
        legal_name: input.legalName,
        display_name: input.displayName,
        contact_first_name: input.contactFirstName,
        contact_last_name: input.contactLastName,
        contact_email: input.contactEmail,
        contact_phone: input.contactPhone,
        street: input.street,
        postal_code: input.postalCode,
        city: input.city,
        country_code: input.countryCode,
        domain: input.domain ?? ""
      },
      newStatus
    },
    headers: {
      "Idempotency-Key": ids.idempotencyKey,
      "X-Request-Id": ids.requestId
    }
  });
}

export async function listBackofficeInvitations(practiceId: string) {
  return apiRequest<{ invitations: BackofficeInvitation[] }>(`/api/backoffice/practices/${practiceId}/invitations`);
}

export async function listBackofficeMemberships(practiceId: string) {
  return apiRequest<{ memberships: BackofficeMembership[] }>(`/api/backoffice/practices/${practiceId}/memberships`);
}

export async function createBackofficeInvitation(
  practiceId: string,
  targetEmail: string,
  intendedRole: PracticeMemberRole,
  expiresAt: string,
  ids: BackofficeMutationIds
) {
  return apiRequest<CreateInvitationResult>(`/api/backoffice/practices/${practiceId}/invitations`, {
    method: "POST",
    body: { targetEmail, intendedRole, deliveryChannel: "in_person_code", expiresAt },
    headers: { "Idempotency-Key": ids.idempotencyKey, "X-Request-Id": ids.requestId }
  });
}

export async function revokeBackofficeInvitation(invitationId: string, ids: BackofficeMutationIds) {
  return apiRequest<{ ok: true }>(`/api/backoffice/invitations/${invitationId}/revoke`, {
    method: "POST",
    headers: { "Idempotency-Key": ids.idempotencyKey, "X-Request-Id": ids.requestId }
  });
}

export async function listBackofficeAuditEvents() {
  return apiRequest<{ events: BackofficeAuditEvent[] }>("/api/backoffice/audit");
}
