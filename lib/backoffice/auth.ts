import type { AuthMFAListFactorsResponse } from "@supabase/supabase-js";

import { supabase } from "@/lib/api/supabase";

export type BackofficeAuthState = "signed_out" | "aal1" | "aal2";

export async function getBackofficeAuthState(): Promise<BackofficeAuthState> {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return "signed_out";

  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) throw error;
  return data.currentLevel === "aal2" ? "aal2" : "aal1";
}

export function firstVerifiedTotpFactor(result: AuthMFAListFactorsResponse) {
  if (result.error) throw result.error;
  return result.data.totp.find((factor) => factor.status === "verified") ?? null;
}

export function hasVerifiedTotpFactor(result: AuthMFAListFactorsResponse) {
  return firstVerifiedTotpFactor(result) !== null;
}

export async function verifyBackofficeTotp(code: string) {
  const factors = await supabase.auth.mfa.listFactors();
  const factor = firstVerifiedTotpFactor(factors);
  if (!factor) throw new Error("Für dieses Konto ist noch kein bestätigter TOTP-Faktor eingerichtet.");

  const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: factor.id });
  if (challengeError) throw challengeError;
  const { error: verifyError } = await supabase.auth.mfa.verify({
    factorId: factor.id,
    challengeId: challenge.id,
    code
  });
  if (verifyError) throw verifyError;
}
