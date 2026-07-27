import { apiRequest } from "@/lib/api/client";
import type { BackofficePracticeSummary, CreatePracticeInput, CreatePracticeResult } from "@/lib/backoffice/types";

export async function listBackofficePractices(): Promise<BackofficePracticeSummary[]> {
  const result = await apiRequest<{ practices: BackofficePracticeSummary[] }>("/api/backoffice/practices");
  return result.practices;
}

export async function createBackofficePractice(input: CreatePracticeInput) {
  return apiRequest<CreatePracticeResult>("/api/backoffice/practices", {
    method: "POST",
    body: input,
    headers: {
      "Idempotency-Key": crypto.randomUUID(),
      "X-Request-Id": crypto.randomUUID()
    }
  });
}
