import { supabase } from "@/lib/supabase/client";

// Deep link the recovery email redirects back to. Must map to the
// app/(auth)/reset-password.tsx route (the (auth) group is hidden in the path,
// so the reachable path is "reset-password"). The app scheme is declared in
// app.json ("praxisshield").
export const PASSWORD_RESET_REDIRECT_URL = "praxisshield://reset-password";

export async function requestPasswordReset(email: string) {
  const normalizedEmail = email.trim().toLowerCase();

  const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
    redirectTo: PASSWORD_RESET_REDIRECT_URL
  });

  if (error) throw error;
}

export type RecoveryUrlParams = {
  accessToken?: string;
  refreshToken?: string;
  code?: string;
  type?: string;
  errorCode?: string;
  errorDescription?: string;
};

// Pure parser with no side effects: extracts recovery parameters from either
// the URL fragment (implicit flow: #access_token=...&refresh_token=...) or the
// query string (PKCE: ?code=..., and Supabase error redirects: ?error_code=...).
// Kept dependency-free (no URLSearchParams) so it behaves identically under
// Hermes and the jest node runtime.
export function parseRecoveryUrl(url: string): RecoveryUrlParams {
  const result: RecoveryUrlParams = {};
  if (!url) return result;

  const hashIndex = url.indexOf("#");
  const queryIndex = url.indexOf("?");

  if (queryIndex >= 0) {
    const end = hashIndex > queryIndex ? hashIndex : undefined;
    collectParams(url.slice(queryIndex + 1, end), result);
  }
  if (hashIndex >= 0) {
    collectParams(url.slice(hashIndex + 1), result);
  }

  return result;
}

function collectParams(raw: string, into: RecoveryUrlParams) {
  for (const pair of raw.split("&")) {
    if (!pair) continue;
    const eq = pair.indexOf("=");
    if (eq < 0) continue;
    const key = safeDecode(pair.slice(0, eq));
    const value = safeDecode(pair.slice(eq + 1).replace(/\+/g, "%20"));
    if (!value) continue;
    switch (key) {
      case "access_token":
        into.accessToken = value;
        break;
      case "refresh_token":
        into.refreshToken = value;
        break;
      case "code":
        into.code = value;
        break;
      case "type":
        into.type = value;
        break;
      case "error_code":
        into.errorCode = value;
        break;
      case "error_description":
        into.errorDescription = value;
        break;
    }
  }
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export type RecoveryResult =
  | { ok: true }
  | { ok: false; reason: "invalid_link" | "expired" | "session_failed" };

export type RecoveryCodeResult =
  | { ok: true }
  | { ok: false; reason: "invalid_code" | "expired" | "session_failed" };

// Turns an incoming deep-link URL into an authenticated recovery session so the
// user can set a new password. Handles the implicit and PKCE flows plus the
// error redirects Supabase appends when a link is expired or already used.
export async function establishRecoverySession(url: string): Promise<RecoveryResult> {
  const params = parseRecoveryUrl(url);

  if (params.errorCode || params.errorDescription) {
    const haystack = `${params.errorCode ?? ""} ${params.errorDescription ?? ""}`.toLowerCase();
    const expired = haystack.includes("expired") || haystack.includes("otp_expired");
    return { ok: false, reason: expired ? "expired" : "invalid_link" };
  }

  if (params.code) {
    const { error } = await supabase.auth.exchangeCodeForSession(params.code);
    return error ? { ok: false, reason: "session_failed" } : { ok: true };
  }

  if (params.accessToken && params.refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: params.accessToken,
      refresh_token: params.refreshToken
    });
    return error ? { ok: false, reason: "session_failed" } : { ok: true };
  }

  return { ok: false, reason: "invalid_link" };
}

// Completes an administrator-initiated recovery without sending the one-time
// code anywhere except Supabase Auth. The code is intentionally never persisted
// locally; a successful verification creates the short-lived recovery session
// consumed immediately by updateUserPassword.
export async function establishRecoverySessionFromCode(email: string, code: string): Promise<RecoveryCodeResult> {
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedCode = code.replace(/\s+/g, "");
  if (!normalizedEmail || !/^\d{6}$/.test(normalizedCode)) return { ok: false, reason: "invalid_code" };

  const { error } = await supabase.auth.verifyOtp({
    email: normalizedEmail,
    token: normalizedCode,
    type: "recovery"
  });
  if (!error) return { ok: true };

  const message = error.message.toLowerCase();
  if (message.includes("expired") || message.includes("otp_expired")) return { ok: false, reason: "expired" };
  return { ok: false, reason: "session_failed" };
}

export async function updateUserPassword(newPassword: string) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}
