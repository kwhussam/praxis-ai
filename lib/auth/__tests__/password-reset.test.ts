declare const jest: {
  mock(moduleName: string, factory: () => unknown): void;
};

type Recorded = {
  resetCalls: Array<{ email: string; redirectTo?: string }>;
  setSessionCalls: Array<{ access_token: string; refresh_token: string }>;
  exchangeCalls: string[];
  updateCalls: string[];
};

const recorded: Recorded = {
  resetCalls: [],
  setSessionCalls: [],
  exchangeCalls: [],
  updateCalls: []
};

let mockResetError: Error | null = null;
let mockSetSessionError: Error | null = null;
let mockExchangeError: Error | null = null;
let mockUpdateError: Error | null = null;

function resetMocks() {
  recorded.resetCalls.length = 0;
  recorded.setSessionCalls.length = 0;
  recorded.exchangeCalls.length = 0;
  recorded.updateCalls.length = 0;
  mockResetError = null;
  mockSetSessionError = null;
  mockExchangeError = null;
  mockUpdateError = null;
}

jest.mock("@/lib/supabase/client", () => ({
  supabase: {
    auth: {
      resetPasswordForEmail: async (email: string, options?: { redirectTo?: string }) => {
        recorded.resetCalls.push({ email, redirectTo: options?.redirectTo });
        return { data: {}, error: mockResetError };
      },
      setSession: async (args: { access_token: string; refresh_token: string }) => {
        recorded.setSessionCalls.push(args);
        return { data: {}, error: mockSetSessionError };
      },
      exchangeCodeForSession: async (code: string) => {
        recorded.exchangeCalls.push(code);
        return { data: {}, error: mockExchangeError };
      },
      updateUser: async (args: { password: string }) => {
        recorded.updateCalls.push(args.password);
        return { data: {}, error: mockUpdateError };
      }
    }
  }
}));

import {
  establishRecoverySession,
  parseRecoveryUrl,
  PASSWORD_RESET_REDIRECT_URL,
  requestPasswordReset,
  updateUserPassword
} from "@/lib/auth/password-reset";

describe("requestPasswordReset", () => {
  it("normalisiert die E-Mail und übergibt die Deep-Link-Redirect-URL", async () => {
    resetMocks();

    await requestPasswordReset("  Team@Praxis.DE  ");

    expect(recorded.resetCalls).toEqual([{ email: "team@praxis.de", redirectTo: PASSWORD_RESET_REDIRECT_URL }]);
  });

  it("gibt Supabase-Fehler an den UI-Fehlerzustand weiter", async () => {
    resetMocks();
    mockResetError = new Error("Supabase reset failed");

    await expect(requestPasswordReset("team@praxis.de")).rejects.toThrow(/Supabase reset failed/);
  });
});

describe("parseRecoveryUrl", () => {
  it("liest Implicit-Flow-Tokens aus dem Fragment", () => {
    const params = parseRecoveryUrl(
      "praxisshield://reset-password#access_token=abc&refresh_token=def&type=recovery&expires_in=3600"
    );

    expect(params.accessToken).toBe("abc");
    expect(params.refreshToken).toBe("def");
    expect(params.type).toBe("recovery");
  });

  it("liest den PKCE-Code aus der Query", () => {
    const params = parseRecoveryUrl("praxisshield://reset-password?code=xyz");

    expect(params.code).toBe("xyz");
    expect(params.accessToken).toBe(undefined);
  });

  it("liest Fehlerparameter mit dekodierten Leerzeichen", () => {
    const params = parseRecoveryUrl(
      "praxisshield://reset-password?error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired"
    );

    expect(params.errorCode).toBe("otp_expired");
    expect(params.errorDescription).toBe("Email link is invalid or has expired");
  });

  it("gibt für eine URL ohne Recovery-Parameter ein leeres Objekt zurück", () => {
    expect(parseRecoveryUrl("praxisshield://reset-password")).toEqual({});
    expect(parseRecoveryUrl("")).toEqual({});
  });
});

describe("establishRecoverySession", () => {
  it("stellt die Session über setSession her (Implicit Flow)", async () => {
    resetMocks();

    const result = await establishRecoverySession(
      "praxisshield://reset-password#access_token=abc&refresh_token=def&type=recovery"
    );

    expect(result).toEqual({ ok: true });
    expect(recorded.setSessionCalls).toEqual([{ access_token: "abc", refresh_token: "def" }]);
  });

  it("tauscht den Code gegen eine Session (PKCE Flow)", async () => {
    resetMocks();

    const result = await establishRecoverySession("praxisshield://reset-password?code=xyz");

    expect(result).toEqual({ ok: true });
    expect(recorded.exchangeCalls).toEqual(["xyz"]);
  });

  it("meldet abgelaufene Links als expired", async () => {
    resetMocks();

    const result = await establishRecoverySession(
      "praxisshield://reset-password?error_code=otp_expired&error_description=Email+link+has+expired"
    );

    expect(result).toEqual({ ok: false, reason: "expired" });
    expect(recorded.setSessionCalls).toHaveLength(0);
  });

  it("meldet fehlende Parameter als invalid_link", async () => {
    resetMocks();

    const result = await establishRecoverySession("praxisshield://reset-password");

    expect(result).toEqual({ ok: false, reason: "invalid_link" });
  });

  it("meldet einen Supabase-Fehler als session_failed", async () => {
    resetMocks();
    mockSetSessionError = new Error("token rejected");

    const result = await establishRecoverySession(
      "praxisshield://reset-password#access_token=abc&refresh_token=def"
    );

    expect(result).toEqual({ ok: false, reason: "session_failed" });
  });
});

describe("updateUserPassword", () => {
  it("setzt das neue Passwort über updateUser", async () => {
    resetMocks();

    await updateUserPassword("neuesPasswort123");

    expect(recorded.updateCalls).toEqual(["neuesPasswort123"]);
  });

  it("gibt Supabase-Fehler an den UI-Fehlerzustand weiter", async () => {
    resetMocks();
    mockUpdateError = new Error("update failed");

    await expect(updateUserPassword("neuesPasswort123")).rejects.toThrow(/update failed/);
  });
});
