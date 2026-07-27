import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Jest lifecycle hooks are declared per test module in this repo (global.d.ts
// provides the ambient describe/it/expect only).
declare const beforeAll: (fn: () => void | Promise<void>) => void;
declare const afterAll: (fn: () => void | Promise<void>) => void;

// ---------------------------------------------------------------------------
// Final B2 acceptance gate: a REAL two-connection idempotency test.
//
// pgTAP runs single-connection and cannot prove the reserve-first
// ON-CONFLICT serialization under concurrency. Here two concurrent PostgREST
// .rpc() calls (separate DB backends, exactly how the Worker calls the RPCs)
// exercise the race:
//   * same idempotency key + same payload  -> exactly ONE mutation and ONE
//     success audit; the loser replays the winner's identical result.
//   * same idempotency key + different payload -> exactly ONE mutation; the
//     other request is rejected with idempotency_conflict (no second mutation).
//
// This is an opt-in integration test: it mutates the target database (creates a
// staff actor + practices, then cleans up), so it must never auto-run against an
// arbitrary shared/hosted project. Enable it explicitly and point it at a
// migrated Supabase instance (locally: `supabase status` for the two values):
//
//   RUN_BACKOFFICE_IDEMPOTENCY_IT=1 \
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//   npx jest supabase/__tests__/backoffice_idempotency.test.ts --runInBand
//
// When the flag or configuration is absent, the suite is skipped (never a CI
// failure), so it stays safe inside the default `npm test` run.
// ---------------------------------------------------------------------------

const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const optedIn = process.env.RUN_BACKOFFICE_IDEMPOTENCY_IT === "1";

const enabled = optedIn && Boolean(url) && Boolean(serviceRoleKey);
const describeIfConfigured = enabled ? describe : describe.skip;

if (optedIn && (!url || !serviceRoleKey)) {
  console.warn(
    "RUN_BACKOFFICE_IDEMPOTENCY_IT is set but SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY are missing; skipping."
  );
}

const nonce = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

function createPracticeArgs(admin: string, key: string, legalNonce: string) {
  return {
    p_actor: admin,
    p_request_id: `req-${legalNonce}`,
    p_idempotency_key: key,
    p_practice_kind: "general",
    p_legal_name: `Idem ${legalNonce}`,
    p_display_name: "Idempotency Test",
    p_contact_first_name: "Test",
    p_contact_last_name: "Actor",
    p_contact_email: "idem@example.test",
    p_contact_phone: "+49 30 1234567",
    p_street: "Teststrasse 1",
    p_postal_code: "10115",
    p_city: "Berlin",
    p_country_code: "DE",
    p_domain: null
  };
}

type RpcResult = { ok: boolean; error?: string; practice_id?: string };

describeIfConfigured("B2 backoffice RPC idempotency under concurrency", () => {
  let admin: SupabaseClient;
  let actorId = "";
  const createdPractices = new Set<string>();

  beforeAll(async () => {
    admin = createClient(url!, serviceRoleKey!, { auth: { persistSession: false } });
    const created = await admin.auth.admin.createUser({
      email: `bo-idem-${nonce}@example.test`,
      password: `Pw-${nonce}-Aa1!`,
      email_confirm: true
    });
    if (created.error || !created.data.user) {
      throw new Error(`could not create test actor: ${created.error?.message}`);
    }
    actorId = created.data.user.id;
    const staff = await admin.from("platform_staff").insert({ user_id: actorId, role: "platform_admin", status: "active" });
    if (staff.error) throw new Error(`could not seed platform_staff: ${staff.error.message}`);
  });

  afterAll(async () => {
    if (!admin) return;
    for (const id of createdPractices) {
      await admin.from("practices").delete().eq("id", id);
    }
    if (actorId) {
      await admin.from("platform_staff").delete().eq("user_id", actorId);
      // Deleting the auth user cascades idempotency-key and rate-limit rows.
      await admin.auth.admin.deleteUser(actorId).catch(() => undefined);
    }
  });

  it("same key + same payload: exactly one mutation and one success audit, identical replay", async () => {
    const key = `same-${nonce}`;
    const legalNonce = `same-${nonce}`;
    const args = createPracticeArgs(actorId, key, legalNonce);

    const [first, second] = await Promise.all([
      admin.rpc("backoffice_create_practice", args),
      admin.rpc("backoffice_create_practice", args)
    ]);

    const r1 = first.data as RpcResult;
    const r2 = second.data as RpcResult;
    expect(first.error).toBeNull();
    expect(second.error).toBeNull();
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    // The loser replays the winner's stored result verbatim.
    expect(r1.practice_id).toBe(r2.practice_id);
    if (r1.practice_id) createdPractices.add(r1.practice_id);

    // Exactly one practice was actually inserted.
    const practices = await admin.from("practices").select("id").eq("legal_name", `Idem ${legalNonce}`);
    expect(practices.error).toBeNull();
    expect(practices.data).toHaveLength(1);

    // Exactly one success audit — the replay must NOT audit again.
    const audits = await admin
      .from("backoffice_audit_events")
      .select("id")
      .eq("practice_id", r1.practice_id!)
      .eq("action", "practice.create")
      .eq("result", "success");
    expect(audits.error).toBeNull();
    expect(audits.data).toHaveLength(1);
  });

  it("same key + different payload: exactly one mutation, the other rejected with idempotency_conflict", async () => {
    const key = `diff-${nonce}`;
    const legalA = `diffA-${nonce}`;
    const legalB = `diffB-${nonce}`;

    const [first, second] = await Promise.all([
      admin.rpc("backoffice_create_practice", createPracticeArgs(actorId, key, legalA)),
      admin.rpc("backoffice_create_practice", createPracticeArgs(actorId, key, legalB))
    ]);

    const results = [first.data as RpcResult, second.data as RpcResult];
    const successes = results.filter((r) => r.ok === true);
    const conflicts = results.filter((r) => r.ok === false && r.error === "idempotency_conflict");

    expect(successes).toHaveLength(1);
    expect(conflicts).toHaveLength(1);
    if (successes[0].practice_id) createdPractices.add(successes[0].practice_id);

    // Only the winner's practice exists; the conflicting request performed no mutation.
    const practices = await admin
      .from("practices")
      .select("id,legal_name")
      .in("legal_name", [`Idem ${legalA}`, `Idem ${legalB}`]);
    expect(practices.error).toBeNull();
    expect(practices.data).toHaveLength(1);
  });
});
