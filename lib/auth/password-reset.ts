import { supabase } from "@/lib/supabase/client";

export async function requestPasswordReset(email: string) {
  const normalizedEmail = email.trim().toLowerCase();

  // TODO(password-reset): Add redirectTo once the in-app reset screen and deep-link route exist.
  const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail);

  if (error) throw error;
}
