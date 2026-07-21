import worker, { fetchWithTimeout, mapInBatches, OutboundRequestTimeoutError } from "../src/index";
import { calculateScore } from "@/lib/security/scoring";
import { questionnaireAnswersToCheckData, type QuestionnaireAnswerValue } from "@/lib/security/questionnaire";

const baseEnv = {
  ANTHROPIC_API_KEY: "test",
  DATA_ENCRYPTION_KEY: "0000000000000000000000000000000000000000000000000000000000000000",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service"
};

describe("fetchWithTimeout", () => {
  it("bricht einen verzögerten Request nach dem konfigurierten Timeout ab", async () => {
    const originalFetch = globalThis.fetch;
    const originalConsoleError = console.error;
    const observedSignals: AbortSignal[] = [];
    const errors: unknown[][] = [];

    globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.signal) observedSignals.push(init.signal);
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
      });
    }) as typeof fetch;
    console.error = (...args: unknown[]) => {
      errors.push(args);
    };

    try {
      let thrown: unknown;
      try {
        await fetchWithTimeout("https://example.test/slow", {}, { service: "test-provider", timeoutMs: 10 });
      } catch (error) {
        thrown = error;
      }

      expect(thrown instanceof OutboundRequestTimeoutError).toBe(true);
      expect(observedSignals[0]?.aborted).toBe(true);
      expect(errors[0]?.[0]).toBe("outbound_timeout");
    } finally {
      globalThis.fetch = originalFetch;
      console.error = originalConsoleError;
    }
  });
});

describe("mapInBatches", () => {
  it("begrenzt parallele Domain-Aufgaben auf die konfigurierte Batch-Groesse", async () => {
    let active = 0;
    let maxActive = 0;

    const results = await mapInBatches([1, 2, 3, 4, 5, 6, 7], 3, async (value) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active -= 1;
      return value * 2;
    });

    expect(maxActive).toBe(3);
    expect(results).toEqual([2, 4, 6, 8, 10, 12, 14]);
  });
});

describe("POST /api/check/external", () => {
  it("lehnt fehlende Authentifizierung im Praxis-Endpunkt ab", async () => {
    const res = await worker.fetch(
      new Request("http://localhost/api/check/external", {
        method: "POST",
        body: JSON.stringify({ domain: "praxis.de", consent: true })
      }),
      baseEnv,
      {} as ExecutionContext
    );

    expect(res.status).toBe(400);
  });

  it("lehnt fehlende Domain im authentifizierten Praxis-Endpunkt ab", async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("https://example.supabase.co/auth/v1/user")) {
        return Response.json({ id: "22222222-2222-4222-8222-222222222222", email: "owner@praxis.de" });
      }
      if (url.startsWith("https://example.supabase.co/rest/v1/practices")) {
        return Response.json([
          {
            id: "11111111-1111-4111-8111-111111111111",
            owner_id: "22222222-2222-4222-8222-222222222222",
            name: "Praxis",
            domain: null,
            email: "kontakt@praxis.de",
            plan: "free"
          }
        ]);
      }
      if (url.startsWith("https://example.supabase.co/rest/v1/rpc/can_access_practice")) {
        return Response.json(true);
      }
      if (url.startsWith("https://example.supabase.co/rest/v1/practice_access_audit")) {
        return new Response(null, { status: 204 });
      }
      return Response.json({}, { status: 404 });
    }) as typeof fetch;

    try {
      const res = await worker.fetch(
        new Request("http://localhost/api/check/external", {
          method: "POST",
          headers: { authorization: "Bearer user-token" },
          body: JSON.stringify({
            practiceId: "11111111-1111-4111-8111-111111111111",
            consent: true
          })
        }),
        baseEnv,
        {} as ExecutionContext
      );

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "domain is required" });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("liefert 500 statt 401, wenn Supabase Auth nicht erreichbar ist", async () => {
    const originalFetch = globalThis.fetch;
    const originalConsoleError = console.error;
    const requestedUrls: string[] = [];
    const errors: unknown[] = [];

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url.startsWith("https://example.supabase.co/auth/v1/user")) {
        return Response.json({ message: "auth unavailable" }, { status: 503 });
      }
      return Response.json({}, { status: 404 });
    }) as typeof fetch;
    console.error = (...args: unknown[]) => {
      errors.push(args);
    };

    try {
      const res = await worker.fetch(
        new Request("http://localhost/api/check/external", {
          method: "POST",
          headers: { authorization: "Bearer user-token" },
          body: JSON.stringify({
            practiceId: "11111111-1111-4111-8111-111111111111",
            domain: "praxis.de",
            consent: true
          })
        }),
        baseEnv,
        {} as ExecutionContext
      );

      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: "internal_server_error" });
      expect(requestedUrls.some((url) => url.startsWith("https://example.supabase.co/rest/v1/practices"))).toBe(false);
      expect((errors[0] as unknown[])[0]).toBe("supabase_auth_unavailable");
      expect((errors[1] as unknown[])[0]).toBe("practice_access_auth_failed");
    } finally {
      globalThis.fetch = originalFetch;
      console.error = originalConsoleError;
    }
  });

  it("fordert Consent vor dem Praxis-Check", async () => {
    const res = await worker.fetch(
      new Request("http://localhost/api/check/external", {
        method: "POST",
        body: JSON.stringify({ practiceId: "11111111-1111-4111-8111-111111111111", domain: "praxis.de" })
      }),
      baseEnv,
      {} as ExecutionContext
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "consent_required" });
  });

  it("lehnt fehlendes JWT vor jedem Service-Role-DB-Zugriff mit 401 ab", async () => {
    const originalFetch = globalThis.fetch;
    const requestedUrls: string[] = [];

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      requestedUrls.push(String(input));
      return Response.json({}, { status: 500 });
    }) as typeof fetch;

    try {
      const res = await worker.fetch(
        new Request("http://localhost/api/check/external", {
          method: "POST",
          body: JSON.stringify({
            practiceId: "11111111-1111-4111-8111-111111111111",
            domain: "praxis.de",
            consent: true
          })
        }),
        baseEnv,
        {} as ExecutionContext
      );

      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "unauthorized" });
      expect(requestedUrls).toEqual([]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("lehnt gueltiges JWT mit fremder practiceId mit 403 ab", async () => {
    const originalFetch = globalThis.fetch;
    const requestedUrls: string[] = [];

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url.startsWith("https://example.supabase.co/auth/v1/user")) {
        return Response.json({ id: "22222222-2222-4222-8222-222222222222", email: "owner@praxis.de" });
      }
      if (url.startsWith("https://example.supabase.co/rest/v1/practices")) {
        return Response.json([
          {
            id: "11111111-1111-4111-8111-111111111111",
            owner_id: "33333333-3333-4333-8333-333333333333",
            name: "Fremde Praxis",
            domain: "fremd.de",
            email: "kontakt@fremd.de",
            plan: "free"
          }
        ]);
      }
      if (url.startsWith("https://example.supabase.co/rest/v1/partner_practices")) {
        return Response.json([]);
      }
      return Response.json({}, { status: 404 });
    }) as typeof fetch;

    try {
      const res = await worker.fetch(
        new Request("http://localhost/api/check/external", {
          method: "POST",
          headers: { authorization: "Bearer user-token" },
          body: JSON.stringify({
            practiceId: "11111111-1111-4111-8111-111111111111",
            domain: "praxis.de",
            consent: true
          })
        }),
        baseEnv,
        {} as ExecutionContext
      );

      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "forbidden" });
      expect(requestedUrls.some((url) => url.startsWith("https://api.ssllabs.com"))).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("nutzt den Service-Role-Key nicht als Fallback, wenn der Supabase Anon Key fehlt", async () => {
    const originalFetch = globalThis.fetch;
    const originalConsoleError = console.error;
    const requestedUrls: string[] = [];
    const errors: unknown[] = [];

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      requestedUrls.push(String(input));
      return Response.json({}, { status: 200 });
    }) as typeof fetch;
    console.error = (...args: unknown[]) => {
      errors.push(args);
    };

    try {
      const res = await worker.fetch(
        new Request("http://localhost/api/check/external", {
          method: "POST",
          headers: { authorization: "Bearer user-token" },
          body: JSON.stringify({
            practiceId: "11111111-1111-4111-8111-111111111111",
            domain: "praxis.de",
            consent: true
          })
        }),
        { ...baseEnv, SUPABASE_ANON_KEY: undefined },
        {} as ExecutionContext
      );

      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: "internal_server_error" });
      expect(requestedUrls).toEqual([]);
      expect(errors[0]).toEqual(["worker_misconfigured_supabase_auth"]);
      expect((errors[1] as unknown[])[0]).toBe("practice_access_auth_failed");
      expect(errors).toHaveLength(2);
    } finally {
      globalThis.fetch = originalFetch;
      console.error = originalConsoleError;
    }
  });

  it("gibt Quota-Fehler nur als generische Antwort zurück", async () => {
    const originalFetch = globalThis.fetch;
    const originalConsoleError = console.error;
    const errors: unknown[] = [];

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("https://example.supabase.co/auth/v1/user")) {
        return Response.json({ id: "22222222-2222-4222-8222-222222222222", email: "owner@praxis.de" });
      }
      if (url.startsWith("https://example.supabase.co/rest/v1/practices")) {
        return Response.json([
          {
            id: "11111111-1111-4111-8111-111111111111",
            owner_id: "22222222-2222-4222-8222-222222222222",
            name: "Praxis",
            domain: "praxis.de",
            email: "kontakt@praxis.de",
            plan: "free"
          }
        ]);
      }
      if (url.startsWith("https://example.supabase.co/rest/v1/rpc/can_access_practice")) {
        return Response.json(true);
      }
      if (url.startsWith("https://example.supabase.co/rest/v1/practice_access_audit")) {
        return new Response(null, { status: 204 });
      }
      if (url.startsWith("https://example.supabase.co/rest/v1/rpc/consume_external_check_quota")) {
        return Response.json({ message: "internal database detail" }, { status: 500 });
      }
      return Response.json({}, { status: 404 });
    }) as typeof fetch;
    console.error = (...args: unknown[]) => {
      errors.push(args);
    };

    try {
      const res = await worker.fetch(
        new Request("http://localhost/api/check/external", {
          method: "POST",
          headers: { authorization: "Bearer user-token" },
          body: JSON.stringify({
            practiceId: "11111111-1111-4111-8111-111111111111",
            domain: "praxis.de",
            consent: true
          })
        }),
        baseEnv,
        {} as ExecutionContext
      );

      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: "internal_server_error" });
      const loggedError = errors[0] as [string, { action: string; failure: { message: string } }];
      expect(loggedError[0]).toBe("external_quota_check_failed");
      expect(loggedError[1].action).toBe("external_check");
      expect(loggedError[1].failure.message).toBe("Supabase request failed with 500");
      expect(JSON.stringify(errors).includes("internal database detail")).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
      console.error = originalConsoleError;
    }
  });

  it("gibt bei ueberschrittener External-Check-Quota 429 zurueck", async () => {
    const originalFetch = globalThis.fetch;
    const requestedUrls: string[] = [];

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url.startsWith("https://example.supabase.co/auth/v1/user")) {
        return Response.json({ id: "22222222-2222-4222-8222-222222222222", email: "owner@praxis.de" });
      }
      if (url.startsWith("https://example.supabase.co/rest/v1/practices")) {
        return Response.json([
          {
            id: "11111111-1111-4111-8111-111111111111",
            owner_id: "22222222-2222-4222-8222-222222222222",
            name: "Praxis",
            domain: "praxis.de",
            email: "kontakt@praxis.de",
            plan: "free"
          }
        ]);
      }
      if (url.startsWith("https://example.supabase.co/rest/v1/rpc/can_access_practice")) {
        return Response.json(true);
      }
      if (url.startsWith("https://example.supabase.co/rest/v1/practice_access_audit")) {
        return new Response(null, { status: 204 });
      }
      if (url.startsWith("https://example.supabase.co/rest/v1/rpc/consume_external_check_quota")) {
        return Response.json(false);
      }
      return Response.json({}, { status: 404 });
    }) as typeof fetch;

    try {
      const res = await worker.fetch(
        new Request("http://localhost/api/check/external", {
          method: "POST",
          headers: { authorization: "Bearer user-token" },
          body: JSON.stringify({
            practiceId: "11111111-1111-4111-8111-111111111111",
            domain: "praxis.de",
            consent: true
          })
        }),
        baseEnv,
        {} as ExecutionContext
      );

      expect(res.status).toBe(429);
      expect(await res.json()).toEqual({ error: "daily_limit_reached", limit: 3, plan: "free" });
      expect(requestedUrls.some((url) => url.startsWith("https://api.ssllabs.com"))).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("lehnt fremde checkId im Report-Pfad vor Anthropic und Report-Write ab", async () => {
    const originalFetch = globalThis.fetch;
    const requestedUrls: string[] = [];

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url.startsWith("https://example.supabase.co/auth/v1/user")) {
        return Response.json({ id: "22222222-2222-4222-8222-222222222222", email: "owner@praxis.de" });
      }
      if (url.startsWith("https://example.supabase.co/rest/v1/practices")) {
        return Response.json([
          {
            id: "11111111-1111-4111-8111-111111111111",
            owner_id: "22222222-2222-4222-8222-222222222222",
            name: "Praxis",
            domain: "praxis.de",
            email: "kontakt@praxis.de",
            plan: "free"
          }
        ]);
      }
      if (url.startsWith("https://example.supabase.co/rest/v1/rpc/can_access_practice")) {
        return Response.json(true);
      }
      if (url.startsWith("https://example.supabase.co/rest/v1/practice_access_audit")) {
        return new Response(null, { status: 204 });
      }
      if (url.startsWith("https://example.supabase.co/rest/v1/security_checks")) {
        return Response.json([]);
      }
      return Response.json({}, { status: 404 });
    }) as typeof fetch;

    try {
      const res = await worker.fetch(
        new Request("http://localhost/api/report/generate", {
          method: "POST",
          headers: { authorization: "Bearer user-token" },
          body: JSON.stringify({
            practiceId: "11111111-1111-4111-8111-111111111111",
            checkId: "44444444-4444-4444-8444-444444444444",
            domain: "praxis.de",
            score: 80
          })
        }),
        baseEnv,
        {} as ExecutionContext
      );

      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "forbidden" });
      expect(requestedUrls.some((url) => url.startsWith("https://api.anthropic.com"))).toBe(false);
      expect(requestedUrls.some((url) => url.startsWith("https://example.supabase.co/rest/v1/reports"))).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("gibt bei ueberschrittener AI-Report-Quota 429 vor Anthropic zurueck", async () => {
    const originalFetch = globalThis.fetch;
    const requestedUrls: string[] = [];

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url.startsWith("https://example.supabase.co/auth/v1/user")) {
        return Response.json({ id: "22222222-2222-4222-8222-222222222222", email: "owner@praxis.de" });
      }
      if (url.startsWith("https://example.supabase.co/rest/v1/practices")) {
        return Response.json([
          {
            id: "11111111-1111-4111-8111-111111111111",
            owner_id: "22222222-2222-4222-8222-222222222222",
            name: "Praxis",
            domain: "praxis.de",
            email: "kontakt@praxis.de",
            plan: "free"
          }
        ]);
      }
      if (url.startsWith("https://example.supabase.co/rest/v1/rpc/can_access_practice")) {
        return Response.json(true);
      }
      if (url.startsWith("https://example.supabase.co/rest/v1/practice_access_audit")) {
        return new Response(null, { status: 204 });
      }
      if (url.startsWith("https://example.supabase.co/rest/v1/rpc/consume_ai_report_quota")) {
        return Response.json(false);
      }
      return Response.json({}, { status: 404 });
    }) as typeof fetch;

    try {
      const res = await worker.fetch(
        new Request("http://localhost/api/report/generate", {
          method: "POST",
          headers: { authorization: "Bearer user-token" },
          body: JSON.stringify({
            practiceId: "11111111-1111-4111-8111-111111111111",
            domain: "praxis.de",
            score: 80
          })
        }),
        baseEnv,
        {} as ExecutionContext
      );

      expect(res.status).toBe(429);
      expect(await res.json()).toEqual({ error: "daily_ai_report_limit_reached", limit: 3, plan: "free" });
      expect(requestedUrls.some((url) => url.startsWith("https://api.anthropic.com"))).toBe(false);
      expect(requestedUrls.some((url) => url.startsWith("https://example.supabase.co/rest/v1/reports"))).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("ueberschreibt manipulierte Client-Scores im Report-Pfad vor Anthropic serverseitig", async () => {
    const originalFetch = globalThis.fetch;
    let anthropicPrompt = "";

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("https://example.supabase.co/auth/v1/user")) {
        return Response.json({ id: "22222222-2222-4222-8222-222222222222", email: "owner@praxis.de" });
      }
      if (url.startsWith("https://example.supabase.co/rest/v1/practices")) {
        return Response.json([
          {
            id: "11111111-1111-4111-8111-111111111111",
            owner_id: "22222222-2222-4222-8222-222222222222",
            name: "Praxis",
            domain: "praxis.de",
            email: "kontakt@praxis.de",
            plan: "free"
          }
        ]);
      }
      if (url.startsWith("https://example.supabase.co/rest/v1/rpc/can_access_practice")) {
        return Response.json(true);
      }
      if (url.startsWith("https://example.supabase.co/rest/v1/rpc/consume_ai_report_quota")) {
        return Response.json(true);
      }
      if (url.startsWith("https://api.anthropic.com/v1/messages")) {
        const body = JSON.parse(String(init?.body ?? "{}")) as { messages?: Array<{ content?: string }> };
        anthropicPrompt = body.messages?.[0]?.content ?? "";
        return Response.json({
          content: [{ type: "text", text: JSON.stringify(validAiReport()) }]
        });
      }
      if (url.startsWith("https://example.supabase.co/rest/v1/reports")) {
        return new Response(null, { status: 201 });
      }
      if (url.startsWith("https://example.supabase.co/rest/v1/practice_access_audit")) {
        return new Response(null, { status: 204 });
      }
      return Response.json({}, { status: 404 });
    }) as typeof fetch;

    try {
      const res = await worker.fetch(
        new Request("http://localhost/api/report/generate", {
          method: "POST",
          headers: { authorization: "Bearer user-token" },
          body: JSON.stringify({
            practiceId: "11111111-1111-4111-8111-111111111111",
            domain: "praxis.de",
            score: 100,
            questionnaire: {
              mfa: false,
              backups: false,
              patching: false
            }
          })
        }),
        baseEnv,
        {} as ExecutionContext
      );

      expect(res.status).toBe(200);
      expect(anthropicPrompt.includes("Vorberechneter Score: 0")).toBe(true);
      expect(anthropicPrompt.includes("Vorberechneter Score: 100")).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("kennzeichnet fehlende Provider-Keys als nicht geprüft und bewertet Subdomains separat", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("https://example.supabase.co/auth/v1/user")) {
        return Response.json({ id: "22222222-2222-4222-8222-222222222222", email: "owner@praxis.de" });
      }
      if (url.startsWith("https://example.supabase.co/rest/v1/practices")) {
        return Response.json([
          {
            id: "11111111-1111-4111-8111-111111111111",
            owner_id: "22222222-2222-4222-8222-222222222222",
            name: "Praxis",
            domain: "praxis.de",
            email: "kontakt@praxis.de",
            plan: "free"
          }
        ]);
      }
      if (url.startsWith("https://example.supabase.co/rest/v1/rpc/can_access_practice")) {
        return Response.json(true);
      }
      if (url.startsWith("https://example.supabase.co/rest/v1/practice_access_audit")) {
        return new Response(null, { status: 204 });
      }
      if (url.startsWith("https://example.supabase.co/rest/v1/rpc/consume_external_check_quota")) {
        return Response.json(true);
      }
      if (url.startsWith("https://example.supabase.co/rest/v1/security_checks")) {
        return new Response(null, { status: 201 });
      }
      if (url.startsWith("https://praxis.de") || url.startsWith("https://www.praxis.de")) {
        return new Response(null, { status: 200, headers: { "strict-transport-security": "max-age=31536000" } });
      }
      if (url.startsWith("https://api.ssllabs.com")) {
        return Response.json({
          endpoints: [
            {
              grade: "A",
              details: {
                protocols: [{ name: "TLS", version: "1.3" }],
                cert: { notAfter: Date.now() + 60 * 86_400_000, issuerSubject: "CN=Test CA" }
              }
            }
          ]
        });
      }
      if (url.startsWith("https://cloudflare-dns.com/dns-query")) {
        const requestUrl = new URL(url);
        const name = requestUrl.searchParams.get("name");
        const type = requestUrl.searchParams.get("type");
        return Response.json(dnsResponse(name ?? "", type ?? ""));
      }
      return Response.json({}, { status: 404 });
    }) as typeof fetch;

    try {
      const res = await worker.fetch(
        new Request("http://localhost/api/check/external", {
          method: "POST",
          headers: { authorization: "Bearer user-token" },
          body: JSON.stringify({
            practiceId: "11111111-1111-4111-8111-111111111111",
            domain: "praxis.de",
            email: "kontakt@praxis.de",
            consent: true
          })
        }),
        baseEnv,
        {} as ExecutionContext
      );

      expect(res.status).toBe(200);
      const result = await res.json() as {
        provider_statuses: Record<string, string>;
        findings: Array<{ id: string }>;
        checks: {
          subdomains: { evaluated: Array<{ domain: string; score: number }> };
          email_security: { mta_sts: { exists: boolean }; tls_rpt: { exists: boolean }; caa: { exists: boolean } };
        };
      };
      expect(result.provider_statuses.shodan).toBe("not_configured");
      expect(result.provider_statuses.hibp).toBe("not_configured");
      expect(result.provider_statuses.virusTotal).toBe("not_configured");
      expect(result.provider_statuses.securityTrails).toBe("not_configured");
      expect(result.findings.some((finding) => finding.id === "not-checked-shodan")).toBe(true);
      expect(result.checks.subdomains.evaluated.some((item) => item.domain === "www.praxis.de")).toBe(true);
      expect(result.checks.email_security.mta_sts.exists).toBe(true);
      expect(result.checks.email_security.tls_rpt.exists).toBe(true);
      expect(result.checks.email_security.caa.exists).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("behaelt Teilresultate und markiert nur einen timeoutenden Provider als nicht verfuegbar", async () => {
    const originalFetch = globalThis.fetch;
    const originalConsoleError = console.error;
    const errors: unknown[][] = [];

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("https://example.supabase.co/auth/v1/user")) {
        return Response.json({ id: "22222222-2222-4222-8222-222222222222", email: "owner@praxis.de" });
      }
      if (url.startsWith("https://example.supabase.co/rest/v1/practices")) {
        return Response.json([
          {
            id: "11111111-1111-4111-8111-111111111111",
            owner_id: "22222222-2222-4222-8222-222222222222",
            name: "Praxis",
            domain: "praxis.de",
            email: "kontakt@praxis.de",
            plan: "free"
          }
        ]);
      }
      if (url.startsWith("https://example.supabase.co/rest/v1/rpc/can_access_practice")) {
        return Response.json(true);
      }
      if (url.startsWith("https://example.supabase.co/rest/v1/rpc/consume_external_check_quota")) {
        return Response.json(true);
      }
      if (url.startsWith("https://example.supabase.co/rest/v1/practice_access_audit")) {
        return new Response(null, { status: 204 });
      }
      if (url.startsWith("https://example.supabase.co/rest/v1/security_checks")) {
        return new Response(null, { status: 201 });
      }
      if (url.startsWith("https://api.shodan.io")) {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
        });
      }
      if (url.startsWith("https://www.virustotal.com")) {
        return Response.json({
          data: {
            attributes: {
              last_analysis_stats: { malicious: 1, suspicious: 0 },
              last_analysis_results: {
                ExampleEngine: { category: "malicious", result: "malware" }
              }
            }
          }
        });
      }
      if (url.startsWith("https://api.ssllabs.com")) {
        return Response.json({
          endpoints: [
            {
              grade: "A",
              details: {
                protocols: [{ name: "TLS", version: "1.3" }],
                cert: { notAfter: Date.now() + 60 * 86_400_000, issuerSubject: "CN=Test CA" }
              }
            }
          ]
        });
      }
      if (url.startsWith("https://cloudflare-dns.com/dns-query")) {
        const requestUrl = new URL(url);
        return Response.json(
          dnsResponse(
            requestUrl.searchParams.get("name") ?? "",
            requestUrl.searchParams.get("type") ?? ""
          )
        );
      }
      if (url.startsWith("https://praxis.de") || url.startsWith("https://www.praxis.de")) {
        return new Response(null, {
          status: 200,
          headers: { "strict-transport-security": "max-age=31536000" }
        });
      }
      return Response.json({}, { status: 404 });
    }) as typeof fetch;
    console.error = (...args: unknown[]) => {
      errors.push(args);
    };

    try {
      const res = await worker.fetch(
        new Request("http://localhost/api/check/external", {
          method: "POST",
          headers: { authorization: "Bearer user-token" },
          body: JSON.stringify({
            practiceId: "11111111-1111-4111-8111-111111111111",
            domain: "praxis.de",
            consent: true
          })
        }),
        {
          ...baseEnv,
          SECURITY_PROVIDER_TIMEOUT_MS: "10",
          SHODAN_API_KEY: "shodan-key",
          VIRUSTOTAL_API_KEY: "virustotal-key"
        },
        {} as ExecutionContext
      );

      expect(res.status).toBe(200);
      const result = await res.json() as {
        provider_statuses: Record<string, string>;
        findings: Array<{ id: string }>;
        checks: { reputation: { blacklisted: boolean; blacklists: string[] } };
      };
      expect(result.provider_statuses.shodan).toBe("unavailable");
      expect(result.provider_statuses.virusTotal).toBe("active");
      expect(result.findings.some((finding) => finding.id === "unavailable-shodan")).toBe(true);
      expect(result.checks.reputation.blacklisted).toBe(true);
      expect(result.checks.reputation.blacklists).toContain("ExampleEngine: malware");
      expect(errors.some((entry) => entry[0] === "outbound_timeout")).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
      console.error = originalConsoleError;
    }
  });

  it("nutzt Monitoring-Ziele und sendet E-Mail-Leak-Abfragen nur mit Einwilligung", async () => {
    const originalFetch = globalThis.fetch;
    const practiceId = "11111111-1111-4111-8111-111111111111";
    const userId = "22222222-2222-4222-8222-222222222222";
    const requestedUrls: string[] = [];
    let canAccessRequest: Record<string, unknown> | null = null;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url.startsWith("https://example.supabase.co/auth/v1/user")) {
        return Response.json({ id: userId, email: "manager@praxis.de" });
      }
      if (url.startsWith("https://example.supabase.co/rest/v1/practices")) {
        return Response.json([
          {
            id: practiceId,
            owner_id: "33333333-3333-4333-8333-333333333333",
            name: "Praxis",
            domain: "praxis.de",
            email: "kontakt@praxis.de",
            plan: "monitoring"
          }
        ]);
      }
      if (url.startsWith("https://example.supabase.co/rest/v1/partner_practices")) {
        return Response.json([{ role: "manager" }]);
      }
      if (url.startsWith("https://example.supabase.co/rest/v1/rpc/can_access_practice")) {
        canAccessRequest = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        return Response.json(true);
      }
      if (url.startsWith("https://example.supabase.co/rest/v1/rpc/audit_partner_practice_access")) {
        return new Response(null, { status: 204 });
      }
      if (url.startsWith("https://example.supabase.co/rest/v1/monitoring_snapshots")) {
        return init?.method === "GET" ? Response.json([]) : new Response(null, { status: 204 });
      }
      if (url.startsWith("https://example.supabase.co/rest/v1/monitoring_events")) {
        return new Response(null, { status: 204 });
      }
      if (url.startsWith("https://praxis.de") || url.startsWith("https://portal.praxis.de") || url.startsWith("https://www.praxis.de")) {
        return new Response(null, { status: 200, headers: { "strict-transport-security": "max-age=31536000" } });
      }
      if (url.startsWith("https://api.ssllabs.com")) {
        return Response.json({
          endpoints: [
            {
              grade: "A",
              details: {
                protocols: [{ name: "TLS", version: "1.3" }],
                cert: { notAfter: Date.now() + 60 * 86_400_000, issuerSubject: "CN=Test CA" }
              }
            }
          ]
        });
      }
      if (url.startsWith("https://cloudflare-dns.com/dns-query")) {
        const requestUrl = new URL(url);
        const name = requestUrl.searchParams.get("name");
        const type = requestUrl.searchParams.get("type");
        return Response.json(dnsResponse(name ?? "", type ?? ""));
      }
      return Response.json({}, { status: 404 });
    }) as typeof fetch;

    try {
      const res = await worker.fetch(
        new Request("http://localhost/api/monitoring/run", {
          method: "POST",
          headers: { authorization: "Bearer user-token" },
          body: JSON.stringify({
            practiceId,
            domain: "praxis.de",
            subdomains: ["portal.praxis.de"],
            emails: ["kontakt@praxis.de"],
            leakConsentAccepted: false
          })
        }),
        { ...baseEnv, HIBP_API_KEY: "hibp-test" },
        {} as ExecutionContext
      );

      expect(res.status).toBe(200);
      const result = await res.json() as {
        snapshot: { checks: { monitoring_targets: string[]; approved_email_count: number } };
        events: Array<{ details: { risk_state?: string } }>;
      };
      expect(result.snapshot.checks.monitoring_targets).toEqual(["portal.praxis.de", "praxis.de"]);
      expect(result.snapshot.checks.approved_email_count).toBe(0);
      expect(result.events.some((event) => event.details.risk_state === "new" || event.details.risk_state === "unchanged")).toBe(true);
      expect(canAccessRequest).toEqual({
        p_user_id: userId,
        p_practice_id: practiceId,
        p_required_role: "manager"
      });
      expect(requestedUrls.some((url) => url.includes("haveibeenpwned.com/api/v3/breachedaccount"))).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("liefert Partner-Responses trotz Audit-RPC-Ausfall aus und loggt den Fehler serverseitig", async () => {
    const originalFetch = globalThis.fetch;
    const originalConsoleError = console.error;
    const errors: unknown[] = [];
    const canAccessRequests: Record<string, unknown>[] = [];

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("https://example.supabase.co/auth/v1/user")) {
        return Response.json({ id: "33333333-3333-4333-8333-333333333333", email: "partner@praxis.de" });
      }
      if (url.startsWith("https://example.supabase.co/rest/v1/practices")) {
        return Response.json([
          {
            id: "11111111-1111-4111-8111-111111111111",
            owner_id: "22222222-2222-4222-8222-222222222222",
            name: "Praxis",
            domain: "praxis.de",
            email: "kontakt@praxis.de",
            plan: "free"
          }
        ]);
      }
      if (url.startsWith("https://example.supabase.co/rest/v1/partner_practices")) {
        return Response.json([{ role: "viewer" }]);
      }
      if (url.startsWith("https://example.supabase.co/rest/v1/rpc/can_access_practice")) {
        canAccessRequests.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
        return Response.json(true);
      }
      if (url.startsWith("https://example.supabase.co/rest/v1/rpc/audit_partner_practice_access")) {
        return Response.json({ message: "internal database detail" }, { status: 500 });
      }
      if (url.startsWith("https://example.supabase.co/rest/v1/monitoring_snapshots")) {
        return Response.json([]);
      }
      if (url.startsWith("https://example.supabase.co/rest/v1/monitoring_events")) {
        return Response.json([]);
      }
      return Response.json({}, { status: 404 });
    }) as typeof fetch;
    console.error = (...args: unknown[]) => {
      errors.push(args);
    };

    try {
      const res = await worker.fetch(
        new Request("http://localhost/api/monitoring/status?practiceId=11111111-1111-4111-8111-111111111111", {
          headers: { authorization: "Bearer user-token" }
        }),
        baseEnv,
        {} as ExecutionContext
      );

      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body).toEqual({ snapshot: null, activeAlerts: [] });
      expect(canAccessRequests).toContainEqual({
        p_user_id: "33333333-3333-4333-8333-333333333333",
        p_practice_id: "11111111-1111-4111-8111-111111111111",
        p_required_role: "viewer"
      });
      const loggedError = errors[0] as [
        string,
        {
          action: string;
          resource: string;
          practice_id: string;
          user_id: string;
          role: string;
          failure: { message: string };
        }
      ];
      expect(loggedError[0]).toBe("practice_access_audit_failed");
      expect(loggedError[1]).toMatchObject({
        action: "access",
        resource: "monitoring_status",
        practice_id: "11111111-1111-4111-8111-111111111111",
        user_id: "33333333-3333-4333-8333-333333333333",
        role: "viewer"
      });
      expect(loggedError[1].failure.message).toBe("Supabase request failed with 500");
      expect(JSON.stringify(errors).includes("internal database detail")).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
      console.error = originalConsoleError;
    }
  });
});

describe("performExternalCheck Subrequest-Fan-out (PERF-01)", () => {
  it("deckelt die Subdomain-Evaluation und behaelt volle DKIM-Selektor-Abdeckung, statt unbegrenzt zu faechern", async () => {
    const originalFetch = globalThis.fetch;
    const cloudflareDnsCalls: string[] = [];
    let sslLabsCalls = 0;
    let totalFetches = 0;

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      totalFetches += 1;

      if (url.startsWith("https://example.supabase.co/auth/v1/user")) {
        return Response.json({ id: "22222222-2222-4222-8222-222222222222", email: "owner@praxis.de" });
      }
      if (url.startsWith("https://example.supabase.co/rest/v1/practices")) {
        return Response.json([
          {
            id: "11111111-1111-4111-8111-111111111111",
            owner_id: "22222222-2222-4222-8222-222222222222",
            name: "Praxis",
            domain: "praxis.de",
            email: "kontakt@praxis.de",
            plan: "free"
          }
        ]);
      }
      if (url.startsWith("https://example.supabase.co/rest/v1/rpc/can_access_practice")) {
        return Response.json(true);
      }
      if (url.startsWith("https://example.supabase.co/rest/v1/rpc/consume_external_check_quota")) {
        return Response.json(true);
      }
      if (url.startsWith("https://example.supabase.co/rest/v1/practice_access_audit")) {
        return new Response(null, { status: 204 });
      }
      if (url.startsWith("https://example.supabase.co/rest/v1/security_checks")) {
        return new Response(null, { status: 201 });
      }
      if (url.startsWith("https://api.ssllabs.com")) {
        sslLabsCalls += 1;
        return Response.json({
          endpoints: [
            {
              grade: "A",
              details: {
                protocols: [{ name: "TLS", version: "1.3" }],
                cert: { notAfter: Date.now() + 60 * 86_400_000, issuerSubject: "CN=Test CA" }
              }
            }
          ]
        });
      }
      if (url.startsWith("https://cloudflare-dns.com/dns-query")) {
        const requestUrl = new URL(url);
        const name = requestUrl.searchParams.get("name") ?? "";
        const type = requestUrl.searchParams.get("type") ?? "";
        cloudflareDnsCalls.push(`${type}:${name}`);
        // Every *.praxis.de A-record lookup resolves, so all 10 common subdomain
        // candidates get "discovered" - the worst case the SUBDOMAIN_EVALUATION_LIMIT cap
        // has to handle.
        if (type === "A") {
          return Response.json({ Status: 0, Answer: [{ name, type: 1, TTL: 300, data: "203.0.113.99" }] });
        }
        return Response.json({ Status: 0, Answer: [] });
      }
      if (/^https:\/\/([a-z0-9-]+\.)*praxis\.de$/.test(url)) {
        return new Response(null, { status: 200, headers: { "strict-transport-security": "max-age=31536000" } });
      }
      return Response.json({}, { status: 404 });
    }) as typeof fetch;

    try {
      const res = await worker.fetch(
        new Request("http://localhost/api/check/external", {
          method: "POST",
          headers: { authorization: "Bearer user-token" },
          body: JSON.stringify({
            practiceId: "11111111-1111-4111-8111-111111111111",
            domain: "praxis.de",
            consent: true
          })
        }),
        baseEnv,
        {} as ExecutionContext
      );

      expect(res.status).toBe(200);
      const result = (await res.json()) as {
        checks: {
          subdomains: {
            status: string;
            discovered: string[];
            evaluated: Array<{ domain: string }>;
            not_checked_reason?: string;
          };
        };
      };

      // All 10 common-candidate subdomains resolve, but only SUBDOMAIN_EVALUATION_LIMIT (4)
      // are actually evaluated (checkDns + checkSsl each) - the rest are listed as
      // "discovered" but explicitly not evaluated, never silently treated as passing.
      expect(result.checks.subdomains.discovered.length).toBe(10);
      expect(result.checks.subdomains.evaluated.length).toBe(4);
      expect(result.checks.subdomains.status).toBe("partial");
      expect(result.checks.subdomains.not_checked_reason).toContain("4 von 10");

      // DKIM selector coverage is preserved (all 11 selectors still probed) - mapInBatches
      // only throttles concurrency, it does not drop selectors.
      const dkimCalls = cloudflareDnsCalls.filter((call) => call.includes("_domainkey.praxis.de"));
      expect(dkimCalls.length).toBe(11);
      expect(sslLabsCalls).toBeGreaterThan(0);

      // Total outbound fetch volume stays well below the pre-fix ~150-160/domain figure,
      // even in this worst case where every common subdomain candidate resolves.
      expect(totalFetches).toBeLessThan(120);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("runScheduledMonitoring modulweise Provider-Aufrufe (PERF-02)", () => {
  const targetId = "66666666-6666-4666-8666-666666666666";

  function previousChecksFixture() {
    return {
      ssl: {
        valid: true,
        issuer: "CN=Old CA",
        expires_at: "2026-01-01T00:00:00.000Z",
        days_remaining: 10,
        protocol: "TLSv1.3",
        grade: "A",
        hsts_enabled: true,
        vulnerabilities: []
      },
      dns: {
        a_records: ["203.0.113.5"],
        aaaa_records: [],
        cname_records: [],
        ns_records: ["ns1.example.net"],
        txt_records: [],
        caa_records: []
      },
      email_security: {
        spf: { exists: true, valid: true, record: "v=spf1 -all", issues: [], alignment: "pass", alignment_mode: null },
        dkim: { exists: true, selector_found: "selector1", valid: true, alignment: "pass", alignment_mode: null },
        dmarc: {
          exists: true,
          policy: "reject",
          rua: null,
          spf_alignment_mode: null,
          dkim_alignment_mode: null,
          alignment_ready: true,
          recommendation: ""
        },
        mta_sts: { exists: true, mode: "enforce", record: "" },
        tls_rpt: { exists: true, rua: null, record: "" },
        caa: { exists: true, records: [] },
        mx_records: { exists: true, records: ["10 mail.praxis.de"], secure: true }
      },
      ports: { open_ports: [], known_vulnerabilities: [] },
      reputation: { blacklisted: false, blacklists: [], malware_hosting: false, phishing_reports: 0, dns_history: [] },
      leaks: { email_found: false, breach_count: 0, breaches: [], domain_found: false, paste_count: 0 },
      subdomains: {
        status: "partial",
        source: "cloudflare_dns_common",
        discovered: ["www.praxis.de"],
        evaluated: [],
        not_checked_reason: undefined
      }
    };
  }

  it("ruft bei einem ssl_check-Cron nur SSL frisch ab und uebernimmt DNS/E-Mail/Subdomains aus dem letzten Snapshot", async () => {
    const originalFetch = globalThis.fetch;
    const cloudflareDnsCalls: string[] = [];
    let sslLabsCalls = 0;

    const encryptedChecks = await encryptReportFixture(previousChecksFixture());

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.startsWith("https://example.supabase.co/rest/v1/practices")) {
        return Response.json([{ id: targetId, domain: "praxis.de", email: "kontakt@praxis.de" }]);
      }
      if (url.includes("/rest/v1/monitoring_snapshots") && url.includes("select=checks,encrypted_checks")) {
        return Response.json([
          {
            checks: {
              comparison: {
                current: {
                  critical_ports: [],
                  dns_fingerprint: "old-fingerprint",
                  dmarc_policy: "reject",
                  dmarc_exists: true,
                  cert_fingerprint: "old-cert",
                  ssl_expires_at: null,
                  ssl_issuer: "CN=Old CA",
                  findings: []
                }
              }
            },
            encrypted_checks: encryptedChecks
          }
        ]);
      }
      if (url.startsWith("https://example.supabase.co/rest/v1/monitoring_snapshots") && method === "POST") {
        return new Response(null, { status: 201 });
      }
      if (url.startsWith("https://example.supabase.co/rest/v1/monitoring_events") && method === "POST") {
        return new Response(null, { status: 201 });
      }
      if (url.startsWith("https://api.ssllabs.com")) {
        sslLabsCalls += 1;
        return Response.json({
          endpoints: [
            {
              grade: "A",
              details: {
                protocols: [{ name: "TLS", version: "1.3" }],
                cert: { notAfter: Date.now() + 60 * 86_400_000, issuerSubject: "CN=Test CA" }
              }
            }
          ]
        });
      }
      if (url.startsWith("https://cloudflare-dns.com/dns-query")) {
        cloudflareDnsCalls.push(url);
        return Response.json({ Status: 0, Answer: [] });
      }
      if (url.startsWith("https://praxis.de")) {
        return new Response(null, { status: 200, headers: { "strict-transport-security": "max-age=31536000" } });
      }
      return Response.json({}, { status: 404 });
    }) as typeof fetch;

    try {
      const waitUntilPromises: Promise<unknown>[] = [];
      const ctx = { waitUntil: (promise: Promise<unknown>) => waitUntilPromises.push(promise) } as unknown as ExecutionContext;

      worker.scheduled({ cron: "0 */6 * * *", scheduledTime: Date.now() } as unknown as ScheduledController, baseEnv, ctx);
      await Promise.all(waitUntilPromises);

      // dns_check owns checkDns/checkEmailSecurity/checkSubdomains - none of them should have
      // hit Cloudflare DNS this cycle, because a previous snapshot exists to carry them from.
      expect(cloudflareDnsCalls.length).toBe(0);
      // ssl_check is this cron's own module, so it must still run fresh.
      expect(sslLabsCalls).toBe(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("fuehrt beim allerersten Lauf ohne vorherigen Snapshot weiterhin alle Checks aus", async () => {
    const originalFetch = globalThis.fetch;
    const cloudflareDnsCalls: string[] = [];
    let sslLabsCalls = 0;

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.startsWith("https://example.supabase.co/rest/v1/practices")) {
        return Response.json([{ id: targetId, domain: "praxis.de", email: "kontakt@praxis.de" }]);
      }
      if (url.includes("/rest/v1/monitoring_snapshots") && url.includes("select=checks,encrypted_checks")) {
        return Response.json([]);
      }
      if (url.startsWith("https://example.supabase.co/rest/v1/monitoring_snapshots") && method === "POST") {
        return new Response(null, { status: 201 });
      }
      if (url.startsWith("https://example.supabase.co/rest/v1/monitoring_events") && method === "POST") {
        return new Response(null, { status: 201 });
      }
      if (url.startsWith("https://api.ssllabs.com")) {
        sslLabsCalls += 1;
        return Response.json({
          endpoints: [
            {
              grade: "A",
              details: {
                protocols: [{ name: "TLS", version: "1.3" }],
                cert: { notAfter: Date.now() + 60 * 86_400_000, issuerSubject: "CN=Test CA" }
              }
            }
          ]
        });
      }
      if (url.startsWith("https://cloudflare-dns.com/dns-query")) {
        cloudflareDnsCalls.push(url);
        return Response.json({ Status: 0, Answer: [] });
      }
      if (url.startsWith("https://praxis.de")) {
        return new Response(null, { status: 200, headers: { "strict-transport-security": "max-age=31536000" } });
      }
      return Response.json({}, { status: 404 });
    }) as typeof fetch;

    try {
      const waitUntilPromises: Promise<unknown>[] = [];
      const ctx = { waitUntil: (promise: Promise<unknown>) => waitUntilPromises.push(promise) } as unknown as ExecutionContext;

      worker.scheduled({ cron: "0 */6 * * *", scheduledTime: Date.now() } as unknown as ScheduledController, baseEnv, ctx);
      await Promise.all(waitUntilPromises);

      // No prior snapshot to carry values from, so every check - including dns_check's -
      // must still run fresh to seed a real baseline.
      expect(cloudflareDnsCalls.length).toBeGreaterThan(0);
      expect(sslLabsCalls).toBe(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("GET /api/dashboard", () => {
  it("liefert einen Keine-Daten-Zustand ohne Security-, WLAN- oder Monitoring-Rows", async () => {
    const originalFetch = globalThis.fetch;
    const practiceId = "11111111-1111-4111-8111-111111111111";
    const userId = "22222222-2222-4222-8222-222222222222";
    const requestedUrls: string[] = [];

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      requestedUrls.push(url);

      if (url.startsWith("https://example.supabase.co/auth/v1/user")) {
        return Response.json({ id: userId, email: "owner@praxis.de" });
      }
      if (url.startsWith("https://example.supabase.co/rest/v1/practices")) {
        return Response.json([
          {
            id: practiceId,
            owner_id: userId,
            name: "Praxis",
            domain: "praxis.de",
            email: "kontakt@praxis.de",
            plan: "free"
          }
        ]);
      }
      if (url.startsWith("https://example.supabase.co/rest/v1/rpc/can_access_practice")) {
        expect(JSON.parse(String(init?.body ?? "{}"))).toEqual({
          p_user_id: userId,
          p_practice_id: practiceId,
          p_required_role: "viewer"
        });
        return Response.json(true);
      }
      if (url.startsWith("https://example.supabase.co/rest/v1/practice_access_audit")) {
        return new Response(null, { status: 204 });
      }
      if (
        url.startsWith("https://example.supabase.co/rest/v1/security_checks") ||
        url.startsWith("https://example.supabase.co/rest/v1/wlan_scans") ||
        url.startsWith("https://example.supabase.co/rest/v1/monitoring_snapshots")
      ) {
        return Response.json([]);
      }
      return Response.json({}, { status: 404 });
    }) as typeof fetch;

    try {
      const res = await worker.fetch(
        new Request(`http://localhost/api/dashboard?practiceId=${practiceId}`, {
          headers: { authorization: "Bearer user-token" }
        }),
        baseEnv,
        {} as ExecutionContext
      );

      expect(res.status).toBe(200);
      const result = (await res.json()) as {
        hasData: boolean;
        latest: Record<string, unknown>;
        history: unknown[];
      };
      expect(result.hasData).toBe(false);
      expect(result.latest).toEqual({
        questionnaire: null,
        external: null,
        wlanScan: null,
        monitoringSnapshot: null
      });
      expect(result.history).toEqual([]);
      expect(requestedUrls.some((url) => url.includes("/rest/v1/security_checks"))).toBe(true);
      expect(requestedUrls.some((url) => url.includes("/rest/v1/wlan_scans"))).toBe(true);
      expect(requestedUrls.some((url) => url.includes("/rest/v1/monitoring_snapshots"))).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("liefert nach einem Fragebogen-Abschluss den echten Score und eine chronologische echte History", async () => {
    const originalFetch = globalThis.fetch;
    const practiceId = "11111111-1111-4111-8111-111111111111";
    const userId = "22222222-2222-4222-8222-222222222222";
    const questionnaire: Record<string, QuestionnaireAnswerValue> = {
      mfa: true,
      mfaEvidence: true,
      mfaEmail: true,
      mfaAdminAccounts: true,
      mfaRemoteMaintenance: true,
      backups: true,
      backupFrequencyDocumented: true,
      backupTargetDocumented: true,
      backupOfflineOrImmutable: true,
      backupOwnerDocumented: true,
      backupDocumented: true,
      restoreTested: false,
      lastRestoreTestDocumented: null,
      restoreTestEvidence: null,
      patching: true,
      patchScopeDocumented: true,
      patchFrequencyDefined: true,
      patchOwnerDocumented: true,
      lastPatchDateDocumented: true,
      patchExceptionsDocumented: true,
      patchingEvidence: true,
      privacyDocuments: true,
      avvAvailable: true,
      tomsAvailable: true,
      processingDirectoryAvailable: true,
      deletionConceptAvailable: true,
      accessConceptAvailable: true,
      privacyTrainingDocumented: true,
      privacyReviewEvidence: true,
      securityOwnerAssigned: true,
      responsibilityDocumented: true,
      staffTraining: true,
      dmarc: false
    };
    const scoreReport = calculateScore(questionnaireAnswersToCheckData(questionnaire));

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.startsWith("https://example.supabase.co/auth/v1/user")) {
        return Response.json({ id: userId, email: "owner@praxis.de" });
      }
      if (url.startsWith("https://example.supabase.co/rest/v1/practices")) {
        return Response.json([
          {
            id: practiceId,
            owner_id: userId,
            name: "Praxis",
            domain: "praxis.de",
            email: "kontakt@praxis.de",
            plan: "free"
          }
        ]);
      }
      if (url.startsWith("https://example.supabase.co/rest/v1/rpc/can_access_practice")) {
        return Response.json(true);
      }
      if (url.startsWith("https://example.supabase.co/rest/v1/practice_access_audit")) {
        return new Response(null, { status: 204 });
      }
      if (url.startsWith("https://example.supabase.co/rest/v1/security_checks") && url.includes("type=eq.questionnaire")) {
        return Response.json([
          {
            id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            type: "questionnaire",
            score: scoreReport.score,
            completed_at: "2026-07-14T08:15:00.000Z",
            results: {
              questionnaire,
              scoreReport
            }
          }
        ]);
      }
      if (url.startsWith("https://example.supabase.co/rest/v1/security_checks") && url.includes("type=eq.external")) {
        return Response.json([]);
      }
      if (url.startsWith("https://example.supabase.co/rest/v1/security_checks")) {
        return Response.json([
          {
            id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            type: "external",
            score: 71,
            completed_at: "2026-07-13T08:15:00.000Z"
          },
          {
            id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            type: "questionnaire",
            score: scoreReport.score,
            completed_at: "2026-07-14T08:15:00.000Z"
          }
        ]);
      }
      if (
        url.startsWith("https://example.supabase.co/rest/v1/wlan_scans") ||
        url.startsWith("https://example.supabase.co/rest/v1/monitoring_snapshots")
      ) {
        return Response.json([]);
      }
      return Response.json({}, { status: 404 });
    }) as typeof fetch;

    try {
      const res = await worker.fetch(
        new Request(`http://localhost/api/dashboard?practiceId=${practiceId}`, {
          headers: { authorization: "Bearer user-token" }
        }),
        baseEnv,
        {} as ExecutionContext
      );

      expect(res.status).toBe(200);
      const result = (await res.json()) as {
        hasData: boolean;
        latest: { questionnaire: { score: number; scoreReport: { score: number } } | null };
        history: Array<{ type: string; score: number; checkedAt: string }>;
      };
      expect(result.hasData).toBe(true);
      expect(result.latest.questionnaire?.score).toBe(scoreReport.score);
      expect(result.latest.questionnaire?.scoreReport.score).toBe(scoreReport.score);
      expect(result.history.map((item) => item.type)).toEqual(["external", "questionnaire"]);
      expect(result.history.map((item) => item.score)).toEqual([71, scoreReport.score]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("POST /api/check/questionnaire", () => {
  it("speichert beim Fragebogen-Abschluss eine security_checks-Zeile mit Praxis-ID und Score", async () => {
    const originalFetch = globalThis.fetch;
    const practiceId = "11111111-1111-4111-8111-111111111111";
    const userId = "22222222-2222-4222-8222-222222222222";
    const questionnaire: Record<string, QuestionnaireAnswerValue> = {
      mfa: true,
      mfaEvidence: true,
      mfaEmail: true,
      mfaAdminAccounts: true,
      mfaRemoteMaintenance: true,
      backups: true,
      backupFrequencyDocumented: true,
      backupTargetDocumented: true,
      backupOfflineOrImmutable: true,
      backupOwnerDocumented: true,
      backupDocumented: true,
      restoreTested: false,
      lastRestoreTestDocumented: null,
      restoreTestEvidence: null,
      patching: true,
      patchScopeDocumented: true,
      patchFrequencyDefined: true,
      patchOwnerDocumented: true,
      lastPatchDateDocumented: true,
      patchExceptionsDocumented: true,
      patchingEvidence: true,
      privacyDocuments: true,
      avvAvailable: true,
      tomsAvailable: true,
      processingDirectoryAvailable: true,
      deletionConceptAvailable: true,
      accessConceptAvailable: true,
      privacyTrainingDocumented: true,
      privacyReviewEvidence: true,
      securityOwnerAssigned: true,
      responsibilityDocumented: true,
      staffTraining: true,
      dmarc: false
    };
    const expectedScoreReport = calculateScore(questionnaireAnswersToCheckData(questionnaire));
    const securityChecksRows: Array<Record<string, unknown>> = [];
    let canAccessRequest: Record<string, unknown> | null = null;

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("https://example.supabase.co/auth/v1/user")) {
        return Response.json({ id: userId, email: "owner@praxis.de" });
      }
      if (url.startsWith("https://example.supabase.co/rest/v1/practices")) {
        return Response.json([
          {
            id: practiceId,
            owner_id: userId,
            name: "Praxis",
            domain: "praxis.de",
            email: "kontakt@praxis.de",
            plan: "free"
          }
        ]);
      }
      if (url.startsWith("https://example.supabase.co/rest/v1/rpc/can_access_practice")) {
        canAccessRequest = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        return Response.json(true);
      }
      if (url.startsWith("https://example.supabase.co/rest/v1/practice_access_audit")) {
        return new Response(null, { status: 204 });
      }
      if (url.startsWith("https://example.supabase.co/rest/v1/security_checks")) {
        securityChecksRows.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
        return new Response(null, { status: 201 });
      }
      return Response.json({}, { status: 404 });
    }) as typeof fetch;

    try {
      const res = await worker.fetch(
        new Request("http://localhost/api/check/questionnaire", {
          method: "POST",
          headers: { authorization: "Bearer user-token" },
          body: JSON.stringify({
            practiceId,
            questionnaire
          })
        }),
        baseEnv,
        {} as ExecutionContext
      );

      expect(res.status).toBe(200);
      const result = await res.json() as { score: number; scoreReport: { score: number }; checkId: string };
      expect(result.score).toBe(expectedScoreReport.score);
      expect(result.scoreReport.score).toBe(expectedScoreReport.score);
      expect(canAccessRequest).toEqual({
        p_user_id: userId,
        p_practice_id: practiceId,
        p_required_role: "manager"
      });
      expect(securityChecksRows).toHaveLength(1);
      expect(securityChecksRows[0]).toMatchObject({
        id: result.checkId,
        practice_id: practiceId,
        type: "questionnaire",
        score: expectedScoreReport.score,
        scoring_version: expectedScoreReport.scoring_version
      });
      expect(securityChecksRows[0].results).toMatchObject({
        questionnaire,
        scoreReport: {
          score: expectedScoreReport.score,
          scoring_version: expectedScoreReport.scoring_version,
          scores_by_category: expectedScoreReport.scores_by_category
        }
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("gibt einen sichtbaren JSON-Fehler zurueck, wenn can_access_practice nicht ausgefuehrt werden kann", async () => {
    const originalFetch = globalThis.fetch;
    const originalConsoleError = console.error;
    const practiceId = "11111111-1111-4111-8111-111111111111";
    const userId = "22222222-2222-4222-8222-222222222222";
    const errors: unknown[] = [];
    const securityChecksWrites: unknown[] = [];

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("https://example.supabase.co/auth/v1/user")) {
        return Response.json({ id: userId, email: "owner@praxis.de" });
      }
      if (url.startsWith("https://example.supabase.co/rest/v1/practices")) {
        return Response.json([
          {
            id: practiceId,
            owner_id: userId,
            name: "Praxis",
            domain: "praxis.de",
            email: "kontakt@praxis.de",
            plan: "free"
          }
        ]);
      }
      if (url.startsWith("https://example.supabase.co/rest/v1/rpc/can_access_practice")) {
        return Response.json({ message: "permission denied for function can_access_practice" }, { status: 403 });
      }
      if (url.startsWith("https://example.supabase.co/rest/v1/security_checks")) {
        securityChecksWrites.push(JSON.parse(String(init?.body ?? "{}")));
        return new Response(null, { status: 201 });
      }
      return Response.json({}, { status: 404 });
    }) as typeof fetch;
    console.error = (...args: unknown[]) => {
      errors.push(args);
    };

    try {
      const res = await worker.fetch(
        new Request("http://localhost/api/check/questionnaire", {
          method: "POST",
          headers: { authorization: "Bearer user-token" },
          body: JSON.stringify({
            practiceId,
            questionnaire: { mfa: true }
          })
        }),
        baseEnv,
        {} as ExecutionContext
      );

      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({
        error: "practice_access_check_failed",
        message: "Praxiszugriff konnte nicht geprüft werden."
      });
      expect(securityChecksWrites).toEqual([]);
      expect((errors[0] as unknown[])[0]).toBe("practice_access_rpc_failed");
    } finally {
      globalThis.fetch = originalFetch;
      console.error = originalConsoleError;
    }
  });
});

describe("GET /api/reports", () => {
  it("listet nur Berichte der autorisierten Praxis fuer viewer", async () => {
    const originalFetch = globalThis.fetch;
    const reportId = "66666666-6666-4666-8666-666666666666";
    const mock = installReportReadFetch([
      {
        id: reportId,
        check_id: null,
        format_version: "1.0.0",
        scoring_version: "2026.1",
        content: { security_score: 50 },
        pdf_url: null,
        created_at: "2026-07-17T10:00:00.000Z"
      }
    ]);

    try {
      const res = await worker.fetch(
        new Request(`http://localhost/api/reports?practiceId=${roleGatePracticeId}`, {
          headers: { authorization: "Bearer user-token" }
        }),
        baseEnv,
        {} as ExecutionContext
      );

      expect(res.status).toBe(200);
      const body = await res.json() as { reports: Array<{ id: string }> };
      expect(body.reports.map((report) => report.id)).toEqual([reportId]);
      expect(mock.reportRequests[0].includes(`practice_id=eq.${roleGatePracticeId}`)).toBe(true);
      expect(mock.canAccessRequests).toContainEqual({
        p_user_id: "22222222-2222-4222-8222-222222222222",
        p_practice_id: roleGatePracticeId,
        p_required_role: "viewer"
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("GET /api/reports/:id", () => {
  it("laedt und entschluesselt einen Bericht der autorisierten Praxis", async () => {
    const originalFetch = globalThis.fetch;
    const reportId = "66666666-6666-4666-8666-666666666666";
    const report = validAiReport();
    const encryptedContent = await encryptReportFixture(report);
    const mock = installReportReadFetch([
      {
        id: reportId,
        encrypted_content: encryptedContent,
        pdf_url: null,
        created_at: "2026-07-17T10:00:00.000Z"
      }
    ]);

    try {
      const res = await worker.fetch(
        new Request(`http://localhost/api/reports/${reportId}?practiceId=${roleGatePracticeId}`, {
          headers: { authorization: "Bearer user-token" }
        }),
        baseEnv,
        {} as ExecutionContext
      );

      expect(res.status).toBe(200);
      const body = await res.json() as { report: { id: string; content: { executive_summary: string } } };
      expect(body.report.id).toBe(reportId);
      expect(body.report.content.executive_summary).toBe(report.executive_summary);
      expect(mock.reportRequests[0].includes(`id=eq.${reportId}`)).toBe(true);
      expect(mock.reportRequests[0].includes(`practice_id=eq.${roleGatePracticeId}`)).toBe(true);
      expect(mock.canAccessRequests).toContainEqual({
        p_user_id: "22222222-2222-4222-8222-222222222222",
        p_practice_id: roleGatePracticeId,
        p_required_role: "viewer"
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("lehnt einen praxisfremden Nutzer vor dem Report-Lookup ab", async () => {
    const originalFetch = globalThis.fetch;
    installForeignPracticeFetch();

    try {
      const res = await worker.fetch(
        new Request(
          `http://localhost/api/reports/66666666-6666-4666-8666-666666666666?practiceId=${roleGatePracticeId}`,
          { headers: { authorization: "Bearer user-token" } }
        ),
        baseEnv,
        {} as ExecutionContext
      );

      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "forbidden" });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("liefert fuer eine unbekannte Report-ID einen sauberen 404", async () => {
    const originalFetch = globalThis.fetch;
    installReportReadFetch([]);

    try {
      const res = await worker.fetch(
        new Request(
          `http://localhost/api/reports/66666666-6666-4666-8666-666666666666?practiceId=${roleGatePracticeId}`,
          { headers: { authorization: "Bearer user-token" } }
        ),
        baseEnv,
        {} as ExecutionContext
      );

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "not_found", message: "Bericht nicht gefunden." });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

type PracticeRole = "owner" | "manager" | "viewer";

type RoleGateCase = {
  name: string;
  method: "GET" | "POST";
  path: string;
  body?: Record<string, unknown>;
  requiredRole: PracticeRole;
  deniedRole: PracticeRole;
  allowedRole: PracticeRole;
};

type ReadRoleGateCase = {
  name: string;
  method: "GET";
  path: string;
  requiredRole: "viewer";
};

type RoleGateRequestCase = {
  method: "GET" | "POST";
  path: string;
  body?: Record<string, unknown>;
};

const roleGatePracticeId = "11111111-1111-4111-8111-111111111111";
const roleGateAlertId = "44444444-4444-4444-8444-444444444444";
const roleGateCases: RoleGateCase[] = [
  {
    name: "privacy/delete",
    method: "POST",
    path: "/api/privacy/delete",
    body: { practiceId: roleGatePracticeId },
    requiredRole: "owner",
    deniedRole: "manager",
    allowedRole: "owner"
  },
  {
    name: "privacy/export",
    method: "GET",
    path: `/api/privacy/export?practiceId=${roleGatePracticeId}`,
    requiredRole: "manager",
    deniedRole: "viewer",
    allowedRole: "manager"
  },
  {
    name: "report/generate",
    method: "POST",
    path: "/api/report/generate",
    body: { practiceId: roleGatePracticeId, domain: "praxis.de", score: 80 },
    requiredRole: "manager",
    deniedRole: "viewer",
    allowedRole: "manager"
  },
  {
    name: "check/external",
    method: "POST",
    path: "/api/check/external",
    body: { practiceId: roleGatePracticeId, domain: "praxis.de", consent: true },
    requiredRole: "manager",
    deniedRole: "viewer",
    allowedRole: "manager"
  },
  {
    name: "monitoring/run",
    method: "POST",
    path: "/api/monitoring/run",
    body: { practiceId: roleGatePracticeId, domain: "praxis.de" },
    requiredRole: "manager",
    deniedRole: "viewer",
    allowedRole: "manager"
  },
  {
    name: "alert/acknowledge",
    method: "POST",
    path: "/api/alert/acknowledge",
    body: { practiceId: roleGatePracticeId, alertId: roleGateAlertId },
    requiredRole: "manager",
    deniedRole: "viewer",
    allowedRole: "manager"
  },
  {
    name: "legal/consent",
    method: "POST",
    path: "/api/legal/consent",
    body: { practiceId: roleGatePracticeId, type: "privacy_policy", accepted: true },
    requiredRole: "manager",
    deniedRole: "viewer",
    allowedRole: "manager"
  },
  {
    name: "legal/avv/accept",
    method: "POST",
    path: "/api/legal/avv/accept",
    body: { practiceId: roleGatePracticeId, version: "2026-06-24" },
    requiredRole: "owner",
    deniedRole: "manager",
    allowedRole: "owner"
  }
];

const readRoleGateCases: ReadRoleGateCase[] = [
  {
    name: "monitoring/status",
    method: "GET",
    path: `/api/monitoring/status?practiceId=${roleGatePracticeId}`,
    requiredRole: "viewer"
  },
  {
    name: "monitoring/history",
    method: "GET",
    path: `/api/monitoring/history?practiceId=${roleGatePracticeId}`,
    requiredRole: "viewer"
  }
];

describe("sensitive practice endpoint role gates", () => {
  it.each(roleGateCases)("lehnt $name fuer $deniedRole mit 403 ab", async (endpoint) => {
    const originalFetch = globalThis.fetch;
    const roleGate = installRoleGateFetch(endpoint.deniedRole, false);

    try {
      const res = await worker.fetch(buildRoleGateRequest(endpoint), baseEnv, {} as ExecutionContext);

      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "forbidden" });
      expect(roleGate.canAccessRequests).toContainEqual({
        p_user_id: roleGateUserId(endpoint.deniedRole),
        p_practice_id: roleGatePracticeId,
        p_required_role: endpoint.requiredRole
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it.each(roleGateCases)("laesst $name fuer $allowedRole durch", async (endpoint) => {
    const originalFetch = globalThis.fetch;
    const roleGate = installRoleGateFetch(endpoint.allowedRole, true);

    try {
      const res = await worker.fetch(buildRoleGateRequest(endpoint), baseEnv, {} as ExecutionContext);

      expect(res.status).toBe(200);
      expect(roleGate.canAccessRequests).toContainEqual({
        p_user_id: roleGateUserId(endpoint.allowedRole),
        p_practice_id: roleGatePracticeId,
        p_required_role: endpoint.requiredRole
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it.each(readRoleGateCases)("laesst $name fuer viewer durch", async (endpoint) => {
    const originalFetch = globalThis.fetch;
    const roleGate = installRoleGateFetch("viewer", true);

    try {
      const res = await worker.fetch(buildRoleGateRequest(endpoint), baseEnv, {} as ExecutionContext);

      expect(res.status).toBe(200);
      expect(roleGate.canAccessRequests).toContainEqual({
        p_user_id: roleGateUserId("viewer"),
        p_practice_id: roleGatePracticeId,
        p_required_role: endpoint.requiredRole
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it.each(readRoleGateCases)("lehnt $name fuer praxisfremden Nutzer mit 403 ab", async (endpoint) => {
    const originalFetch = globalThis.fetch;
    installForeignPracticeFetch();

    try {
      const res = await worker.fetch(buildRoleGateRequest(endpoint), baseEnv, {} as ExecutionContext);

      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "forbidden" });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("erzwingt practiceId und Bearer-Auth fuer monitoring/run vor Provider-Aufrufen", async () => {
    const originalFetch = globalThis.fetch;
    const requestedUrls: string[] = [];

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      requestedUrls.push(String(input));
      return Response.json({}, { status: 500 });
    }) as typeof fetch;

    try {
      const missingPracticeRes = await worker.fetch(
        new Request("http://localhost/api/monitoring/run", {
          method: "POST",
          headers: { authorization: "Bearer user-token" },
          body: JSON.stringify({ domain: "praxis.de" })
        }),
        baseEnv,
        {} as ExecutionContext
      );
      expect(missingPracticeRes.status).toBe(400);
      expect(await missingPracticeRes.json()).toEqual({ error: "practiceId is required" });
      expect(requestedUrls).toEqual([]);

      const missingAuthRes = await worker.fetch(
        new Request("http://localhost/api/monitoring/run", {
          method: "POST",
          body: JSON.stringify({ practiceId: roleGatePracticeId, domain: "praxis.de" })
        }),
        baseEnv,
        {} as ExecutionContext
      );
      expect(missingAuthRes.status).toBe(401);
      expect(await missingAuthRes.json()).toEqual({ error: "unauthorized" });
      expect(requestedUrls).toEqual([]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("privacy delete transaction safety (F-088/F-089)", () => {
  it("meldet 500 statt Teilerfolg, wenn die complete_privacy_deletion-RPC an einem Grant-Fehler scheitert", async () => {
    const originalFetch = globalThis.fetch;
    const calledUrls: string[] = [];
    const auditActions: unknown[] = [];

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      calledUrls.push(url);
      if (url.startsWith("https://example.supabase.co/rest/v1/practice_access_audit") && init?.body) {
        auditActions.push((JSON.parse(String(init.body)) as { action?: string }).action);
      }

      if (url.startsWith("https://example.supabase.co/auth/v1/user")) {
        return Response.json({ id: roleGateUserId("owner"), email: "owner@praxis.de" });
      }
      if (url.startsWith("https://example.supabase.co/rest/v1/practices") && method === "GET") {
        return Response.json([
          {
            id: roleGatePracticeId,
            owner_id: roleGateUserId("owner"),
            name: "Praxis",
            domain: "praxis.de",
            email: "kontakt@praxis.de",
            plan: "monitoring"
          }
        ]);
      }
      if (url.startsWith("https://example.supabase.co/rest/v1/partner_practices")) {
        return Response.json([]);
      }
      if (url.startsWith("https://example.supabase.co/rest/v1/rpc/can_access_practice")) {
        return Response.json(true);
      }
      if (url.startsWith("https://example.supabase.co/rest/v1/rpc/complete_privacy_deletion")) {
        // Simulates the exact F-088 failure mode: service_role has insert/update
        // but not the SELECT PostgREST needs for a filtered UPDATE / upsert inside
        // the transaction, so Postgres rejects the whole RPC call.
        return Response.json(
          { code: "42501", message: "permission denied for table deletion_requests" },
          { status: 403 }
        );
      }
      return Response.json({}, { status: 500 });
    }) as typeof fetch;

    try {
      const res = await worker.fetch(
        new Request("http://localhost/api/privacy/delete", {
          method: "POST",
          headers: { authorization: "Bearer user-token" },
          body: JSON.stringify({ practiceId: roleGatePracticeId })
        }),
        baseEnv,
        {} as ExecutionContext
      );

      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: "internal_server_error" });

      // requirePracticeAccess logs a generic "access" audit entry before the
      // RPC even runs -- that's expected. What must NOT happen is a
      // "delete_requested" audit entry or a confirmation email, since both
      // would falsely imply the deletion went through.
      expect(auditActions).not.toContain("delete_requested");
      expect(calledUrls.some((url) => url.includes("/rest/v1/email_outbox"))).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

function buildRoleGateRequest(endpoint: RoleGateRequestCase) {
  return new Request(`http://localhost${endpoint.path}`, {
    method: endpoint.method,
    headers: { authorization: "Bearer user-token" },
    body: endpoint.body ? JSON.stringify(endpoint.body) : undefined
  });
}

function deletionReportFixture() {
  return {
    deletion_id: "66666666-6666-4666-8666-666666666666",
    practice_id: roleGatePracticeId,
    requested_at: "2026-07-21T00:00:00.000Z",
    state: "completed",
    immediate_deletions: ["personal_data", "wlan_scans"],
    anonymizations: ["security_checks", "reports", "monitoring_events", "monitoring_snapshots"],
    retained_for_legal: ["practice_access_audit", "deletion_requests", "consent_log", "data_processing_agreements"],
    retention_until: "2032-07-21T00:00:00.000Z",
    monitoring_retention_until: "2027-07-21T00:00:00.000Z",
    completed_by: "system"
  };
}

function installRoleGateFetch(role: PracticeRole, canAccess: boolean) {
  const canAccessRequests: Record<string, unknown>[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";

    if (url.startsWith("https://example.supabase.co/auth/v1/user")) {
      return Response.json({ id: roleGateUserId(role), email: `${role}@praxis.de` });
    }
    if (url.startsWith("https://example.supabase.co/rest/v1/practices") && method === "GET") {
      return Response.json([
        {
          id: roleGatePracticeId,
          owner_id: role === "owner" ? roleGateUserId(role) : "22222222-2222-4222-8222-222222222222",
          name: "Praxis",
          domain: "praxis.de",
          email: "kontakt@praxis.de",
          plan: "monitoring"
        }
      ]);
    }
    if (url.startsWith("https://example.supabase.co/rest/v1/partner_practices")) {
      return Response.json(role === "owner" ? [] : [{ role }]);
    }
    if (url.startsWith("https://example.supabase.co/rest/v1/rpc/can_access_practice")) {
      canAccessRequests.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
      return Response.json(canAccess);
    }
    if (!canAccess) {
      return Response.json({}, { status: 500 });
    }
    if (url.startsWith("https://example.supabase.co/rest/v1/practice_access_audit")) {
      return new Response(null, { status: 204 });
    }
    if (url.startsWith("https://example.supabase.co/rest/v1/rpc/audit_partner_practice_access")) {
      return new Response(null, { status: 204 });
    }
    if (url.startsWith("https://api.anthropic.com/v1/messages")) {
      return Response.json({ content: [{ type: "text", text: JSON.stringify(validAiReport()) }] });
    }
    if (url.startsWith("https://praxis.de") || url.startsWith("https://www.praxis.de")) {
      return new Response(null, { status: 200, headers: { "strict-transport-security": "max-age=31536000" } });
    }
    if (url.startsWith("https://api.ssllabs.com")) {
      return Response.json({
        endpoints: [
          {
            grade: "A",
            details: {
              protocols: [{ name: "TLS", version: "1.3" }],
              cert: { notAfter: Date.now() + 60 * 86_400_000, issuerSubject: "CN=Test CA" }
            }
          }
        ]
      });
    }
    if (url.startsWith("https://cloudflare-dns.com/dns-query")) {
      const requestUrl = new URL(url);
      return Response.json(dnsResponse(requestUrl.searchParams.get("name") ?? "", requestUrl.searchParams.get("type") ?? ""));
    }
    if (url.startsWith("https://example.supabase.co/rest/v1/rpc/complete_privacy_deletion")) {
      return Response.json(deletionReportFixture());
    }
    if (
      url.startsWith("https://example.supabase.co/rest/v1/security_checks") ||
      url.startsWith("https://example.supabase.co/rest/v1/reports") ||
      url.startsWith("https://example.supabase.co/rest/v1/monitoring_snapshots") ||
      url.startsWith("https://example.supabase.co/rest/v1/monitoring_events") ||
      url.startsWith("https://example.supabase.co/rest/v1/consent_log")
    ) {
      return method === "GET" ? Response.json([]) : new Response(null, { status: 204 });
    }
    if (
      url.startsWith("https://example.supabase.co/rest/v1/deletion_requests") ||
      url.startsWith("https://example.supabase.co/rest/v1/wlan_scans") ||
      url.startsWith("https://example.supabase.co/rest/v1/data_processing_agreements") ||
      url.startsWith("https://example.supabase.co/rest/v1/email_outbox") ||
      (url.startsWith("https://example.supabase.co/rest/v1/practices") && method === "PATCH")
    ) {
      return new Response(null, { status: 204 });
    }
    return Response.json({}, { status: 404 });
  }) as typeof fetch;

  return { canAccessRequests };
}

function installForeignPracticeFetch() {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";

    if (url.startsWith("https://example.supabase.co/auth/v1/user")) {
      return Response.json({ id: "99999999-9999-4999-8999-999999999999", email: "fremd@praxis.de" });
    }
    if (url.startsWith("https://example.supabase.co/rest/v1/practices") && method === "GET") {
      return Response.json([
        {
          id: roleGatePracticeId,
          owner_id: "22222222-2222-4222-8222-222222222222",
          name: "Praxis",
          domain: "praxis.de",
          email: "kontakt@praxis.de",
          plan: "monitoring"
        }
      ]);
    }
    if (url.startsWith("https://example.supabase.co/rest/v1/partner_practices")) {
      return Response.json([]);
    }
    return Response.json({}, { status: 500 });
  }) as typeof fetch;
}

function installReportReadFetch(reportRows: unknown[]) {
  const reportRequests: string[] = [];
  const canAccessRequests: Record<string, unknown>[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith("https://example.supabase.co/auth/v1/user")) {
      return Response.json({ id: "22222222-2222-4222-8222-222222222222", email: "owner@praxis.de" });
    }
    if (url.startsWith("https://example.supabase.co/rest/v1/practices")) {
      return Response.json([
        {
          id: roleGatePracticeId,
          owner_id: "22222222-2222-4222-8222-222222222222",
          name: "Praxis",
          domain: "praxis.de",
          email: "kontakt@praxis.de",
          plan: "monitoring"
        }
      ]);
    }
    if (url.startsWith("https://example.supabase.co/rest/v1/rpc/can_access_practice")) {
      canAccessRequests.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
      return Response.json(true);
    }
    if (url.startsWith("https://example.supabase.co/rest/v1/reports")) {
      reportRequests.push(url);
      return Response.json(reportRows);
    }
    if (url.startsWith("https://example.supabase.co/rest/v1/practice_access_audit")) {
      return new Response(null, { status: 204 });
    }
    return Response.json({}, { status: 404 });
  }) as typeof fetch;

  return { canAccessRequests, reportRequests };
}

async function encryptReportFixture(report: unknown) {
  const key = await crypto.subtle.importKey("raw", new Uint8Array(32), { name: "AES-GCM" }, false, ["encrypt"]);
  const iv = new Uint8Array(12);
  const plaintext = new TextEncoder().encode(JSON.stringify(report));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);

  return {
    alg: "AES-256-GCM",
    iv: testBytesToBase64(iv),
    data: testBytesToBase64(new Uint8Array(ciphertext)),
    created_at: "2026-07-17T10:00:00.000Z"
  };
}

function testBytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function roleGateUserId(role: PracticeRole) {
  if (role === "owner") return "11111111-2222-4222-8222-222222222222";
  if (role === "manager") return "33333333-3333-4333-8333-333333333333";
  return "55555555-5555-4555-8555-555555555555";
}

function dnsResponse(name: string, type: string) {
  const records: Record<string, Record<string, string[]>> = {
    "praxis.de": {
      A: ["203.0.113.10"],
      NS: ["ns1.example.net"],
      TXT: ["v=spf1 include:_spf.example.net -all"],
      MX: ["10 mail.praxis.de"],
      CAA: ["0 issue \"letsencrypt.org\""]
    },
    "_dmarc.praxis.de": {
      TXT: ["v=DMARC1; p=reject; rua=mailto:dmarc@praxis.de; aspf=s; adkim=s"]
    },
    "_mta-sts.praxis.de": {
      TXT: ["v=STSv1; mode=enforce"]
    },
    "_smtp._tls.praxis.de": {
      TXT: ["v=TLSRPTv1; rua=mailto:tlsrpt@praxis.de"]
    },
    "selector1._domainkey.praxis.de": {
      TXT: ["v=DKIM1; k=rsa; p=test"]
    },
    "www.praxis.de": {
      A: ["203.0.113.11"]
    },
    "portal.praxis.de": {
      A: ["203.0.113.12"]
    }
  };
  const values = records[name]?.[type] ?? [];
  return {
    Status: 0,
    Answer: values.map((data) => ({
      name,
      type: dnsTypeCode(type),
      TTL: 300,
      data
    }))
  };
}

function dnsTypeCode(type: string) {
  return { A: 1, NS: 2, CNAME: 5, MX: 15, TXT: 16, AAAA: 28, CAA: 257 }[type] ?? 16;
}

function validAiReport() {
  return {
    executive_summary: "Servervalidierter Bericht mit geprüfter Score-Basis.",
    overall_risk: "medium",
    security_score: 50,
    ampel: "gelb",
    top_risks: [
      {
        rank: 1,
        title: "MFA fehlt",
        plain_language: "Der Bericht basiert auf serverseitig neu bewerteten Angaben.",
        business_impact: "Unbefugte Anmeldungen werden wahrscheinlicher.",
        action: "MFA für alle Konten aktivieren.",
        effort_hours: "1-2 Stunden",
        cost_estimate: "IT-Dienstleister, 1-2 Stunden",
        priority: "diese_woche",
        evidence_source: "self_reported",
        reliability: "medium"
      }
    ],
    scores_by_category: {
      access_control: 50,
      backup: 50,
      email_security: 50,
      network: 50,
      dsgvo: 50,
      updates: 50
    },
    dsgvo_compliance: {
      status: "teilweise",
      missing_documents: ["Nachweise"],
      liability_risk: "Nachweise fehlen."
    },
    quick_wins: [
      {
        action: "MFA aktivieren",
        time_minutes: 30,
        impact: "Reduziert Kontoübernahmen."
      }
    ],
    not_checked_limitations: [
      {
        area: "WLAN",
        reason: "Nicht übergeben.",
        impact: "Netzwerkrisiken bleiben eingeschränkt bewertbar."
      }
    ],
    monthly_monitoring_recommendation: true
  };
}
