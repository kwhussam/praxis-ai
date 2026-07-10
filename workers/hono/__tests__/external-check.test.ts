import worker from "../src/index";

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

  it("kennzeichnet fehlende Provider-Keys als nicht geprüft und bewertet Subdomains separat", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
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
          body: JSON.stringify({ domain: "praxis.de", email: "kontakt@praxis.de" })
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
      expect(result.checks.subdomains.evaluated[0]).toMatchObject({ domain: "www.praxis.de" });
      expect(result.checks.email_security.mta_sts.exists).toBe(true);
      expect(result.checks.email_security.tls_rpt.exists).toBe(true);
      expect(result.checks.email_security.caa.exists).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
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
