declare const jest: { mock(moduleName: string, factory: () => unknown): void };

const mockRows: Record<string, unknown[]> = { practices: [], practice_memberships: [] };
function mockBuilder(table: string) {
  const state: { filters: Record<string, unknown> } = { filters: {} };
  const api = {
    select: () => api,
    eq: (key: string, value: unknown) => { state.filters[key] = value; return api; },
    order: () => api,
    limit: async () => ({ data: mockRows[table].filter((row) => Object.entries(state.filters).every(([key, value]) => (row as Record<string, unknown>)[key] === value)).slice(0, 1), error: null }),
    maybeSingle: async () => ({ data: mockRows[table].find((row) => Object.entries(state.filters).every(([key, value]) => (row as Record<string, unknown>)[key] === value)) ?? null, error: null })
  };
  return api;
}

jest.mock("@/lib/supabase/client", () => ({ supabase: {
  from: (table: string) => mockBuilder(table),
  auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }) }
} }));
jest.mock("@/lib/store/localData", () => ({ clearLocalTenantCaches: () => {} }));

import { loadAccessiblePracticeForUser } from "@/lib/store/session";

describe("membership-aware session practice resolution", () => {
  it("loads an active member practice when the user is not owner", async () => {
    mockRows.practices = [{ id: "practice-1", owner_id: "owner-1", name: "Kanzlei", domain: null, email: null, plan: "free", white_label_partner_id: null }];
    mockRows.practice_memberships = [{ user_id: "member-1", practice_id: "practice-1", status: "active", granted_at: "2026-07-29" }];
    expect(await loadAccessiblePracticeForUser("member-1")).toMatchObject({ id: "practice-1", name: "Kanzlei" });
  });

  it("does not resolve a revoked membership", async () => {
    mockRows.practice_memberships = [{ user_id: "member-1", practice_id: "practice-1", status: "revoked", granted_at: "2026-07-29" }];
    expect(await loadAccessiblePracticeForUser("member-1")).toBeNull();
  });
});
