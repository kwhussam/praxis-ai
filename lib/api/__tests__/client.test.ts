declare const jest: {
  mock(moduleName: string, factory: () => unknown): void;
  useFakeTimers(): void;
  useRealTimers(): void;
  advanceTimersByTimeAsync(ms: number): Promise<void>;
};

jest.mock("@/lib/api/supabase", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } }
}));

import { apiRequest, ApiTimeoutError } from "@/lib/api/client";

describe("apiRequest timeout (TS-02)", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.useRealTimers();
  });

  it("bricht eine nie aufloesende Anfrage nach dem Timeout-Fenster mit ApiTimeoutError ab", async () => {
    jest.useFakeTimers();

    globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("Aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
    }) as typeof fetch;

    const requestPromise = apiRequest("/api/never-resolves", { token: "test-token", timeoutMs: 5000 }).catch(
      (error: unknown) => error
    );

    await jest.advanceTimersByTimeAsync(5000);
    const result = await requestPromise;

    expect(result instanceof ApiTimeoutError).toBe(true);
  });

  it("loest normal auf, wenn die Antwort vor dem Timeout eintrifft", async () => {
    globalThis.fetch = (async () => new Response(JSON.stringify({ ok: true }), { status: 200 })) as typeof fetch;

    const result = await apiRequest("/api/fast", { token: "test-token", timeoutMs: 5000 });

    expect(result).toEqual({ ok: true });
  });
});
