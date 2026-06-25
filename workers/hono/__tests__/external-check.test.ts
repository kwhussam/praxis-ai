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
});
