import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { AnimatedButton } from "@/components/ui/AnimatedButton";
import { GlassCard } from "@/components/ui/GlassCard";
import { Screen } from "@/components/ui/Screen";
import { colors } from "@/constants/colors";
import { supabase } from "@/lib/supabase/client";
import { useSessionStore, type Practice } from "@/lib/store/session";

export default function LoginScreen() {
  const router = useRouter();
  const setPractice = useSessionStore((store) => store.setPractice);
  const setSession = useSessionStore((store) => store.setSession);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const canSubmit = email.trim().length > 3 && password.length >= 8 && !loading;

  async function handleSubmit() {
    setLoading(true);
    setError(null);
    setNotice(null);

    try {
      if (mode === "register") {
        const { error: signUpError } = await supabase.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
          options: {
            emailRedirectTo: "praxisshield://auth/confirm"
          }
        });

        if (signUpError) throw signUpError;
        setNotice("Registrierung angelegt. Bitte bestätigen Sie Ihre E-Mail, bevor Sie sich einloggen.");
        setMode("login");
        return;
      }

      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password
      });

      if (signInError) throw signInError;
      if (!data.session || !data.user) throw new Error("Login fehlgeschlagen: Keine Supabase-Session erhalten.");

      setSession(data.session);
      const practice = await loadPracticeForUser(data.user.id);

      if (!practice) {
        router.replace("/(auth)/onboarding");
        return;
      }

      setPractice(practice);
      router.replace("/(tabs)/dashboard");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Anmeldung fehlgeschlagen.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>Willkommen zurück</Text>
        <Text style={styles.copy}>
          {mode === "login"
            ? "Melde dich als Praxis oder White-Label-Partner an."
            : "Lege einen Zugang an. Der Dashboard-Zugriff startet erst nach E-Mail-Bestätigung."}
        </Text>
      </View>
      <GlassCard>
        <Text style={styles.label}>E-Mail</Text>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          onChangeText={setEmail}
          placeholder="team@praxis.de"
          placeholderTextColor={colors.muted}
          style={styles.input}
          value={email}
        />
        <Text style={styles.label}>Passwort</Text>
        <TextInput
          onChangeText={setPassword}
          placeholder="Mindestens 8 Zeichen"
          placeholderTextColor={colors.muted}
          secureTextEntry
          style={styles.input}
          value={password}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}
        <AnimatedButton
          disabled={!canSubmit}
          label={loading ? "Bitte warten..." : mode === "login" ? "Einloggen" : "Registrieren"}
          onPress={handleSubmit}
          style={styles.button}
        />
        <AnimatedButton
          disabled={loading}
          label={mode === "login" ? "Neuen Zugang registrieren" : "Zum Login wechseln"}
          onPress={() => {
            setError(null);
            setNotice(null);
            setMode((current) => (current === "login" ? "register" : "login"));
          }}
          variant="ghost"
          style={styles.secondaryButton}
        />
      </GlassCard>
    </Screen>
  );
}

async function loadPracticeForUser(userId: string): Promise<Practice | null> {
  const { data, error } = await supabase
    .from("practices")
    .select("id,name,domain,email,plan,white_label_partner_id")
    .eq("owner_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    id: data.id,
    name: data.name,
    domain: data.domain ?? undefined,
    email: data.email ?? undefined,
    plan:
      data.plan === "audit" || data.plan === "monitoring" || data.plan === "compliance"
        ? data.plan
        : "free",
    whiteLabelPartnerId: data.white_label_partner_id ?? undefined
  };
}

const styles = StyleSheet.create({
  header: {
    marginBottom: 28
  },
  title: {
    color: colors.ink,
    fontSize: 36,
    fontWeight: "900"
  },
  copy: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 23,
    marginTop: 10
  },
  label: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 8,
    marginTop: 8
  },
  input: {
    minHeight: 54,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "rgba(255,255,255,0.08)",
    color: colors.ink,
    paddingHorizontal: 16,
    fontSize: 16,
    marginBottom: 14
  },
  button: {
    marginTop: 8
  },
  secondaryButton: {
    marginTop: 12
  },
  error: {
    color: colors.critical,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19,
    marginBottom: 12
  },
  notice: {
    color: colors.safe,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19,
    marginBottom: 12
  }
});
