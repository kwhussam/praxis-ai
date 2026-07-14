import worker from "../src/index";
import { calculateScore } from "@/lib/security/scoring";
import { questionnaireAnswersToCheckData, type QuestionnaireAnswerValue } from "@/lib/security/questionnaire";

const baseEnv = {
  ANTHROPIC_API_KEY: "test",
  DATA_ENCRYPTION_KEY: "0000000000000000000000000000000000000000000000000000000000000000",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service"
};

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

  it("erzwingt Auth auch fuer deprecated Kompatibilitaets-Endpunkte", async () => {
    const originalFetch = globalThis.fetch;
    const requestedUrls: string[] = [];

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      requestedUrls.push(String(input));
      return Response.json({}, { status: 500 });
    }) as typeof fetch;

    try {
      const res = await worker.fetch(
        new Request("http://localhost/api/external-check", {
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

  it("lehnt fehlende Domain im deprecated Kompatibilitäts-Endpunkt ab", async () => {
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
      if (url.startsWith("https://example.supabase.co/rest/v1/practice_access_audit")) {
        return new Response(null, { status: 204 });
      }
      return Response.json({}, { status: 404 });
    }) as typeof fetch;

    try {
      const res = await worker.fetch(
        new Request("http://localhost/api/external-check", {
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

  it("lehnt fehlende Domain im öffentlichen Kompatibilitäts-Endpunkt ab", async () => {
    const res = await worker.fetch(
      new Request("http://localhost/api/external-check", {
        method: "POST",
        body: JSON.stringify({})
      }),
      baseEnv,
      {} as ExecutionContext
    );

    expect(res.status).toBe(400);
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
      const loggedError = errors[0] as [string, { action: string; error: Error }];
      expect(loggedError[0]).toBe("external_quota_check_failed");
      expect(loggedError[1].action).toBe("external_check");
      expect(loggedError[1].error.message).toBe("Supabase request failed with 500");
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
      if (url.startsWith("https://example.supabase.co/rest/v1/practice_access_audit")) {
        return new Response(null, { status: 204 });
      }
      if (url.startsWith("https://example.supabase.co/rest/v1/rpc/consume_external_check_quota")) {
        return Response.json(true);
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
        new Request("http://localhost/api/external-check", {
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

  it("nutzt Monitoring-Ziele und sendet E-Mail-Leak-Abfragen nur mit Einwilligung", async () => {
    const originalFetch = globalThis.fetch;
    const requestedUrls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      requestedUrls.push(url);
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
          body: JSON.stringify({
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
      expect(requestedUrls.some((url) => url.includes("haveibeenpwned.com/api/v3/breachedaccount"))).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("liefert Partner-Responses trotz Audit-RPC-Ausfall aus und loggt den Fehler serverseitig", async () => {
    const originalFetch = globalThis.fetch;
    const originalConsoleError = console.error;
    const errors: unknown[] = [];

    globalThis.fetch = (async (input: RequestInfo | URL) => {
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

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ snapshot: null, activeAlerts: [] });
      const loggedError = errors[0] as [
        string,
        { action: string; resource: string; practice_id: string; user_id: string; role: string; error: Error }
      ];
      expect(loggedError[0]).toBe("practice_access_audit_failed");
      expect(loggedError[1]).toMatchObject({
        action: "access",
        resource: "monitoring_status",
        practice_id: "11111111-1111-4111-8111-111111111111",
        user_id: "33333333-3333-4333-8333-333333333333",
        role: "viewer"
      });
      expect(loggedError[1].error.message).toBe("Supabase request failed with 500");
      expect(JSON.stringify(errors).includes("internal database detail")).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
      console.error = originalConsoleError;
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
