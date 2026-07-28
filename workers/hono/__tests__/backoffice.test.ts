import worker from "../src/index";

// This repo declares jest lifecycle hooks per test module (see the ambient
// describe/it/expect in global.d.ts and the local declares in other suites).
declare const beforeEach: (fn: () => void | Promise<void>) => void;
declare const afterEach: (fn: () => void | Promise<void>) => void;

// ---------------------------------------------------------------------------
// Test harness: the Worker talks to GoTrue (/auth/v1/user) and PostgREST
// (/rest/v1/*). We mock globalThis.fetch and route by URL, capturing every
// outbound call so we can assert on the RPC bodies (e.g. that p_actor is the
// session identity, never the request body).
// ---------------------------------------------------------------------------

const SUPABASE_URL = "https://example.supabase.co";

const baseEnv = {
  ANTHROPIC_API_KEY: "test",
  DATA_ENCRYPTION_KEY: "0".repeat(64),
  SUPABASE_URL,
  SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  // Must be >= 32 bytes (BACKOFFICE_INVITE_MIN_SECRET_BYTES) or the code endpoint fails closed.
  BACKOFFICE_INVITE_HMAC_SECRET: "unit-test-secret-0123456789-abcdef-01"
};

type OutboundCall = { url: string; method: string; body: unknown };

type World = {
  calls: OutboundCall[];
  user: { id: string; email?: string } | null;
  staffRole: "platform_admin" | "security_consultant" | "support" | null;
  assignments: string[];
  rateLimitAllowed: boolean;
  rpcResults: Record<string, unknown>;
  restRows: Record<string, unknown[]>;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function base64url(value: string) {
  // btoa is a Workers/global runtime primitive (typed via @cloudflare/workers-types).
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function makeToken(claims: Record<string, unknown>) {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify(claims));
  return `${header}.${payload}.signature`;
}

const nowSeconds = () => Math.floor(Date.now() / 1000);

function installWorld(overrides: Partial<World> = {}): World {
  const world: World = {
    calls: [],
    user: { id: "11111111-1111-4111-8111-111111111111", email: "staff@example.test" },
    staffRole: "platform_admin",
    assignments: [],
    rateLimitAllowed: true,
    rpcResults: {},
    restRows: {},
    ...overrides
  };

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";
    let body: unknown = undefined;
    if (typeof init?.body === "string") {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    world.calls.push({ url, method, body });

    if (url.includes("/auth/v1/user")) {
      return world.user ? jsonResponse(world.user) : jsonResponse({ error: "unauthorized" }, 401);
    }
    if (url.includes("/rest/v1/rpc/backoffice_consume_rate_limit")) {
      return jsonResponse(world.rateLimitAllowed);
    }
    const rpcMatch = url.match(/\/rest\/v1\/rpc\/(backoffice_[a-z_]+)/);
    if (rpcMatch) {
      const fn = rpcMatch[1];
      return jsonResponse(world.rpcResults[fn] ?? { ok: true });
    }
    if (url.includes("/rest/v1/platform_staff")) {
      return jsonResponse(world.staffRole ? [{ role: world.staffRole }] : []);
    }
    if (url.includes("/rest/v1/staff_practice_assignments")) {
      return jsonResponse(world.assignments.map((practice_id) => ({ practice_id })));
    }
    const restMatch = url.match(/\/rest\/v1\/([a-z_]+)\?/);
    if (restMatch) {
      return jsonResponse(world.restRows[restMatch[1]] ?? []);
    }
    return jsonResponse({ error: "unexpected", url }, 500);
  }) as typeof fetch;

  return world;
}

function request(
  path: string,
  options: { method?: string; token?: string; body?: unknown; headers?: Record<string, string> } = {}
) {
  const headers: Record<string, string> = { "content-type": "application/json", ...(options.headers ?? {}) };
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  return new Request(`http://localhost${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined
  });
}

const aal2Token = () => makeToken({ aal: "aal2", amr: [{ method: "totp", timestamp: nowSeconds() }], iat: nowSeconds() });
const aal1Token = () => makeToken({ aal: "aal1", amr: [{ method: "password", timestamp: nowSeconds() }], iat: nowSeconds() });
// AAL2 but the only fresh factor is a password (no MFA) — must NOT satisfy step-up.
const aal2PasswordOnlyToken = () =>
  makeToken({ aal: "aal2", amr: [{ method: "password", timestamp: nowSeconds() }], iat: nowSeconds() });
// AAL2 with no amr at all — a bare iat must NOT satisfy step-up.
const aal2NoAmrToken = () => makeToken({ aal: "aal2", iat: nowSeconds() });

let originalFetch: typeof fetch;
let originalConsoleError: typeof console.error;

beforeEach(() => {
  originalFetch = globalThis.fetch;
  originalConsoleError = console.error;
  console.error = () => {};
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  console.error = originalConsoleError;
});

const call = (req: Request, env: Record<string, unknown> = baseEnv) =>
  worker.fetch(req, env as never, {} as never);

describe("Backoffice auth gating", () => {
  it("rejects requests without a bearer token as 401", async () => {
    installWorld({ user: null });
    const res = await call(request("/api/backoffice/practices"));
    expect(res.status).toBe(401);
  });

  it("rejects an AAL1 session with 403 aal2_required", async () => {
    installWorld();
    const res = await call(request("/api/backoffice/practices", { token: aal1Token() }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "aal2_required" });
  });

  it("allows an AAL2 admin session to list practices", async () => {
    installWorld({ restRows: { practices: [{ id: "p1" }] } });
    const res = await call(request("/api/backoffice/practices", { token: aal2Token() }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      practices: [{ id: "p1" }],
      page: { offset: 0, limit: 25, hasMore: false, nextOffset: null },
      permissions: { canCreate: true }
    });
  });

  it("applies bounded server-side search and pagination to the practice query", async () => {
    const world = installWorld({ restRows: { practices: Array.from({ length: 26 }, (_, id) => ({ id })) } });
    const res = await call(
      request("/api/backoffice/practices?search=Berlin&limit=25&offset=50", { token: aal2Token() })
    );
    expect(res.status).toBe(200);
    const practicesCall = world.calls.find((entry) => entry.url.includes("/rest/v1/practices?"));
    expect(practicesCall?.url).toContain("limit=26&offset=50");
    expect(practicesCall?.url).toContain("or=");
    const payload = (await res.json()) as { practices: unknown[]; page: Record<string, unknown> };
    expect(payload.practices).toHaveLength(25);
    expect(payload.page).toEqual({ offset: 50, limit: 25, hasMore: true, nextOffset: 75 });
  });

  it("rejects unsafe or out-of-range practice-list query parameters", async () => {
    const world = installWorld();
    const res = await call(
      request("/api/backoffice/practices?search=Berlin%2Cowner_id.eq.not-null&limit=500", { token: aal2Token() })
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_query" });
    expect(world.calls.some((entry) => entry.url.includes("/rest/v1/practices?"))).toBe(false);
  });
});

describe("Actor identity", () => {
  it("derives p_actor from the session and ignores a spoofed body value", async () => {
    const world = installWorld({
      rpcResults: { backoffice_create_practice: { ok: true, practice_id: "new" } }
    });
    const res = await call(
      request("/api/backoffice/practices", {
        method: "POST",
        token: aal2Token(),
        body: { p_actor: "99999999-9999-4999-8999-999999999999", legalName: "X" }
      })
    );
    expect(res.status).toBe(201);
    const rpc = world.calls.find((c) => c.url.includes("backoffice_create_practice"));
    expect((rpc?.body as Record<string, unknown>).p_actor).toBe(world.user?.id);
  });
});

describe("Rate limiting", () => {
  it("returns 429 when the per-actor limit is exhausted, before calling the mutation RPC", async () => {
    const world = installWorld({ rateLimitAllowed: false });
    const res = await call(
      request("/api/backoffice/practices", { method: "POST", token: aal2Token(), body: { legalName: "X" } })
    );
    expect(res.status).toBe(429);
    expect(world.calls.some((c) => c.url.includes("backoffice_create_practice"))).toBe(false);
  });
});

describe("Invitation code minting", () => {
  const invitationsPath = "/api/backoffice/practices/22222222-2222-4222-8222-222222222222/invitations";
  const expiresAt = "2026-08-01T00:00:00.000Z";
  const inviteBody = (overrides: Record<string, unknown> = {}) => ({
    targetEmail: "Owner@Example.test",
    intendedRole: "practice_owner",
    expiresAt,
    ...overrides
  });

  it("fails closed with 500 when the HMAC secret is not configured", async () => {
    installWorld();
    const { BACKOFFICE_INVITE_HMAC_SECRET, ...envWithoutSecret } = baseEnv;
    void BACKOFFICE_INVITE_HMAC_SECRET;
    const res = await call(
      request(invitationsPath, {
        method: "POST",
        token: aal2Token(),
        headers: { "idempotency-key": "k-nosecret" },
        body: inviteBody()
      }),
      envWithoutSecret
    );
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: "backoffice_not_configured" });
  });

  it("fails closed with 500 when the HMAC secret is too short", async () => {
    installWorld();
    const res = await call(
      request(invitationsPath, {
        method: "POST",
        token: aal2Token(),
        headers: { "idempotency-key": "k-short" },
        body: inviteBody()
      }),
      { ...baseEnv, BACKOFFICE_INVITE_HMAC_SECRET: "too-short" }
    );
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: "backoffice_not_configured" });
  });

  it("requires an idempotency key (400 without one, no DB call)", async () => {
    const world = installWorld();
    const res = await call(request(invitationsPath, { method: "POST", token: aal2Token(), body: inviteBody() }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "idempotency_key_required" });
    expect(world.calls.some((c) => c.url.includes("backoffice_create_invitation"))).toBe(false);
  });

  it("requires an explicit expires_at (400 without one)", async () => {
    installWorld();
    const res = await call(
      request(invitationsPath, {
        method: "POST",
        token: aal2Token(),
        headers: { "idempotency-key": "k-noexp" },
        body: inviteBody({ expiresAt: undefined })
      })
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "invalid_expiry" });
  });

  it("mints a v1 HMAC proof, keeps the plaintext code out of the DB call, and returns the code once", async () => {
    const world = installWorld({
      rpcResults: {
        backoffice_create_invitation: { ok: true, invitation_id: "inv1", expires_at: expiresAt }
      }
    });
    const res = await call(
      request(invitationsPath, {
        method: "POST",
        token: aal2Token(),
        headers: { "idempotency-key": "k-mint" },
        body: inviteBody()
      })
    );
    expect(res.status).toBe(201);
    const payload = (await res.json()) as { code: string; invitation_id: string };
    expect(payload.code).toMatch(/^[0-9A-HJKMNP-TV-Z]{10}$/); // Crockford alphabet, 10 chars
    expect(payload.invitation_id).toBe("inv1");

    const rpc = world.calls.find((c) => c.url.includes("backoffice_create_invitation"));
    const rpcBody = rpc?.body as Record<string, unknown>;
    expect(rpcBody.p_proof_reference).toMatch(/^hmac:v1:[0-9a-f]{64}$/);
    expect(rpcBody.p_idempotency_key).toBe("k-mint");
    // The plaintext code must never appear in the DB payload.
    expect(JSON.stringify(rpcBody)).not.toContain(payload.code);
    // Email is normalized to lowercase before it reaches the DB.
    expect(rpcBody.p_target_email).toBe("owner@example.test");
  });

  it("derives the same code for the same key + payload (idempotent retry re-delivers the secret)", async () => {
    const rpcResults = {
      backoffice_create_invitation: { ok: true, invitation_id: "inv1", expires_at: expiresAt }
    };
    installWorld({ rpcResults });
    const first = await call(
      request(invitationsPath, {
        method: "POST",
        token: aal2Token(),
        headers: { "idempotency-key": "k-repeat" },
        body: inviteBody()
      })
    );
    installWorld({ rpcResults });
    const second = await call(
      request(invitationsPath, {
        method: "POST",
        token: aal2Token(),
        headers: { "idempotency-key": "k-repeat" },
        body: inviteBody()
      })
    );
    const p1 = (await first.json()) as { code: string };
    const p2 = (await second.json()) as { code: string };
    expect(p1.code).toBe(p2.code);
  });
});

describe("Ownership transfer step-up", () => {
  const practicePath = "/api/backoffice/practices/33333333-3333-4333-8333-333333333333/transfer-ownership";

  it("rejects a stale MFA step-up with 403 stepup_required", async () => {
    installWorld();
    const staleToken = makeToken({
      aal: "aal2",
      amr: [{ method: "totp", timestamp: nowSeconds() - 3600 }],
      iat: nowSeconds() - 3600
    });
    const res = await call(request(practicePath, { method: "POST", token: staleToken, body: { newOwner: "u" } }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "stepup_required" });
  });

  it("rejects a fresh password-only AAL2 session (no MFA factor) with 403 stepup_required", async () => {
    installWorld();
    const res = await call(
      request(practicePath, { method: "POST", token: aal2PasswordOnlyToken(), body: { newOwner: "u" } })
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "stepup_required" });
  });

  it("rejects an AAL2 session with no amr (no iat fallback) with 403 stepup_required", async () => {
    installWorld();
    const res = await call(request(practicePath, { method: "POST", token: aal2NoAmrToken(), body: { newOwner: "u" } }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "stepup_required" });
  });

  it("proceeds with a fresh MFA step-up", async () => {
    installWorld({
      rpcResults: { backoffice_transfer_ownership: { ok: true, practice_id: "p", owner_id: "u" } }
    });
    const res = await call(
      request(practicePath, {
        method: "POST",
        token: aal2Token(),
        body: { newOwner: "44444444-4444-4444-8444-444444444444" }
      })
    );
    expect(res.status).toBe(200);
    expect(((await res.json()) as { ok: boolean }).ok).toBe(true);
  });
});

describe("Anti-enumeration", () => {
  it("collapses a DB 'forbidden' on a targeted mutation into a uniform 404 not_found", async () => {
    installWorld({
      rpcResults: { backoffice_update_practice: { ok: false, error: "forbidden" } }
    });
    const res = await call(
      request("/api/backoffice/practices/55555555-5555-4555-8555-555555555555", {
        method: "PATCH",
        token: aal2Token(),
        body: { patch: { city: "Berlin" } }
      })
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ ok: false, error: "not_found" });
  });
});

describe("Server-side read scoping", () => {
  it("restricts a consultant's practice list to their active assignments via an id filter", async () => {
    const assigned = "66666666-6666-4666-8666-666666666666";
    const world = installWorld({
      staffRole: "security_consultant",
      assignments: [assigned],
      restRows: { practices: [{ id: assigned }] }
    });
    const res = await call(request("/api/backoffice/practices", { token: aal2Token() }));
    expect(res.status).toBe(200);
    const practicesCall = world.calls.find((c) => c.url.includes("/rest/v1/practices?"));
    expect(practicesCall?.url).toContain(`id=in.(${assigned})`);
  });

  it("returns an empty list for a consultant with no assignments without querying practices", async () => {
    const world = installWorld({ staffRole: "security_consultant", assignments: [] });
    const res = await call(request("/api/backoffice/practices", { token: aal2Token() }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      practices: [],
      page: { offset: 0, limit: 25, hasMore: false, nextOffset: null },
      permissions: { canCreate: true }
    });
    expect(world.calls.some((c) => c.url.includes("/rest/v1/practices?"))).toBe(false);
  });

  it("forbids support from reading the audit log (only practice.read capability)", async () => {
    installWorld({ staffRole: "support" });
    const res = await call(request("/api/backoffice/audit", { token: aal2Token() }));
    expect(res.status).toBe(403);
  });

  it("returns read-only UI permissions to support for assigned practices", async () => {
    const assigned = "77777777-7777-4777-8777-777777777777";
    installWorld({
      staffRole: "support",
      assignments: [assigned],
      restRows: { practices: [{ id: assigned, display_name: "Support view" }] }
    });
    const list = await call(request("/api/backoffice/practices", { token: aal2Token() }));
    expect(((await list.json()) as { permissions: unknown }).permissions).toEqual({ canCreate: false });

    const detail = await call(request(`/api/backoffice/practices/${assigned}`, { token: aal2Token() }));
    expect(detail.status).toBe(200);
    expect(((await detail.json()) as { permissions: unknown }).permissions).toEqual({ canManage: false });
  });
});
