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
    mockRows.practices = [{ id: "practice-1", owner_id: "owner-1", name: "Kanzlei", domain: null, email: null, plan: "free", white_label_partner_id: null, onboarding_status: "active" }];
    mockRows.practice_memberships = [{ user_id: "member-1", practice_id: "practice-1", status: "active", granted_at: "2026-07-29" }];
    expect(await loadAccessiblePracticeForUser("member-1")).toMatchObject({ id: "practice-1", name: "Kanzlei" });
  });

  it("does not resolve a revoked membership", async () => {
    mockRows.practice_memberships = [{ user_id: "member-1", practice_id: "practice-1", status: "revoked", granted_at: "2026-07-29" }];
    expect(await loadAccessiblePracticeForUser("member-1")).toBeNull();
  });

  // B4c (E-039): Nur eine aktive Praxis gewährt Zugang.
  it("gibt eine aktive eigene Praxis zurück", async () => {
    mockRows.practices = [{ id: "practice-9", owner_id: "owner-9", name: "Aktive Praxis", domain: null, email: null, plan: "free", white_label_partner_id: null, onboarding_status: "active" }];
    mockRows.practice_memberships = [];
    expect(await loadAccessiblePracticeForUser("owner-9")).toMatchObject({ id: "practice-9", name: "Aktive Praxis" });
  });

  it("sperrt den Zugang, solange die eigene Praxis nur ein deaktivierter Entwurf ist", async () => {
    mockRows.practices = [{ id: "practice-draft", owner_id: "owner-draft", name: "Entwurf", domain: null, email: null, plan: "free", white_label_partner_id: null, onboarding_status: "draft" }];
    mockRows.practice_memberships = [];
    expect(await loadAccessiblePracticeForUser("owner-draft")).toBeNull();
  });

  it("gewährt keinen Zugang über eine aktive Mitgliedschaft an einer noch nicht aktivierten Praxis", async () => {
    mockRows.practices = [{ id: "practice-inv", owner_id: null, name: "Eingeladen", domain: null, email: null, plan: "free", white_label_partner_id: null, onboarding_status: "invited" }];
    mockRows.practice_memberships = [{ user_id: "member-2", practice_id: "practice-inv", status: "active", granted_at: "2026-08-01" }];
    expect(await loadAccessiblePracticeForUser("member-2")).toBeNull();
  });

  it("lädt nach Invitation-Redeem gezielt die autorisierte Zielpraxis eines Multi-Praxis-Nutzers", async () => {
    mockRows.practices = [
      { id: "practice-old", owner_id: "member-3", name: "Eigene Praxis", domain: null, email: null, plan: "free", white_label_partner_id: null, onboarding_status: "active" },
      { id: "practice-target", owner_id: "owner-target", name: "Zielpraxis", domain: null, email: null, plan: "monitoring", white_label_partner_id: null, onboarding_status: "active" }
    ];
    mockRows.practice_memberships = [
      { user_id: "member-3", practice_id: "practice-target", status: "active", granted_at: "2026-08-05" }
    ];

    expect(await loadAccessiblePracticeForUser("member-3", "practice-target")).toMatchObject({
      id: "practice-target",
      name: "Zielpraxis",
      plan: "monitoring"
    });
  });

  it("verweigert eine angeforderte Zielpraxis ohne Ownership oder aktive Mitgliedschaft", async () => {
    mockRows.practices = [
      { id: "practice-other", owner_id: "owner-other", name: "Fremde Praxis", domain: null, email: null, plan: "free", white_label_partner_id: null, onboarding_status: "active" }
    ];
    mockRows.practice_memberships = [];

    expect(await loadAccessiblePracticeForUser("member-4", "practice-other")).toBeNull();
  });
});
