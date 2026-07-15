import { apiRequest } from "@/lib/api/client";
import type { DashboardData } from "@/lib/dashboard/types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class DashboardFetchError extends Error {
  constructor(message: string, public readonly context: { practiceId: string }) {
    super(message);
    this.name = "DashboardFetchError";
  }
}

export async function loadDashboardData(practiceId: string): Promise<DashboardData> {
  if (!UUID_RE.test(practiceId)) {
    throw new DashboardFetchError("Ungültige Practice-ID für Dashboard.", { practiceId });
  }

  return apiRequest<DashboardData>(`/api/dashboard?practiceId=${encodeURIComponent(practiceId)}`);
}
