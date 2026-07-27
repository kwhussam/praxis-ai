import { apiRequest } from "@/lib/api/client";
import type { BackofficePracticeSummary, CreatePracticeInput, CreatePracticeResult } from "@/lib/backoffice/types";

export async function listBackofficePractices(): Promise<BackofficePracticeSummary[]> {
  const result = await apiRequest<{ practices: BackofficePracticeSummary[] }>("/api/backoffice/practices");
  return result.practices;
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
