import { buildResetTargets, resetMessageForStatus, shouldRotateResetKey } from "@/lib/backoffice/password-reset-ui";
import type { BackofficeMembership } from "@/lib/backoffice/types";

function membership(overrides: Partial<BackofficeMembership> = {}): BackofficeMembership {
  return {
    id: overrides.id ?? "m1",
    user_id: overrides.user_id ?? "u-member",
    role: overrides.role ?? "practice_manager",
    status: overrides.status ?? "active",
    granted_at: overrides.granted_at ?? "2026-08-01T00:00:00.000Z",
    revoked_at: overrides.revoked_at ?? null
  };
}

describe("buildResetTargets", () => {
  it("stellt den Inhaber zusätzlich voran, wenn er keine Membership hat (P1-1)", () => {
    const targets = buildResetTargets("owner-1", [membership({ user_id: "member-1", role: "assessor" })]);
    expect(targets).toEqual([
      { userId: "owner-1", role: null },
      { userId: "member-1", role: "assessor" }
    ]);
  });

  it("zeigt den Inhaber nicht doppelt, wenn er bereits aktives Mitglied ist", () => {
    const targets = buildResetTargets("owner-1", [membership({ user_id: "owner-1", role: "practice_owner" })]);
    expect(targets).toEqual([{ userId: "owner-1", role: "practice_owner" }]);
  });

  it("ignoriert widerrufene Mitgliedschaften", () => {
    const targets = buildResetTargets(null, [
      membership({ user_id: "active-1", status: "active" }),
      membership({ user_id: "revoked-1", status: "revoked" })
    ]);
    expect(targets).toEqual([{ userId: "active-1", role: "practice_manager" }]);
  });

  it("liefert für fehlenden Inhaber nur aktive Mitglieder", () => {
    const targets = buildResetTargets(null, [membership({ user_id: "member-1" })]);
    expect(targets.some((target) => target.role === null)).toBe(false);
    expect(targets).toHaveLength(1);
  });
});

describe("resetMessageForStatus", () => {
  it("markiert 403 als Step-up-Bedarf", () => {
    const out = resetMessageForStatus(403);
    expect(out.needsStepUp).toBe(true);
    expect(out.alreadyIssued).toBe(false);
  });

  it("markiert 409 als bereits ausgelöst (P1-2)", () => {
    const out = resetMessageForStatus(409);
    expect(out.alreadyIssued).toBe(true);
    expect(out.needsStepUp).toBe(false);
  });

  it("liefert für 429/404/400 feste Meldungen ohne Sonderflags", () => {
    for (const status of [429, 404, 400]) {
      const out = resetMessageForStatus(status);
      expect(out.needsStepUp).toBe(false);
      expect(out.alreadyIssued).toBe(false);
      expect(out.text.length > 0).toBe(true);
    }
  });

  it("fällt für unbekannte oder fehlende Status auf eine generische Meldung zurück", () => {
    expect(resetMessageForStatus(null).text).toBe(resetMessageForStatus(500).text);
  });
});

describe("shouldRotateResetKey", () => {
  it("behält den Key bei gewöhnlichem Retry desselben Ziels (kein Doppel-Reset)", () => {
    expect(shouldRotateResetKey({ fingerprint: "u1 in_person" }, "u1 in_person", false)).toBe(false);
  });

  it("rotiert bei bewusster Neuanforderung (forceNew) trotz gleichem Ziel", () => {
    expect(shouldRotateResetKey({ fingerprint: "u1 in_person" }, "u1 in_person", true)).toBe(true);
  });

  it("rotiert beim ersten Versuch und bei gewechseltem Ziel", () => {
    expect(shouldRotateResetKey(null, "u1 in_person", false)).toBe(true);
    expect(shouldRotateResetKey({ fingerprint: "u1 in_person" }, "u2 phone_verified", false)).toBe(true);
  });
});
