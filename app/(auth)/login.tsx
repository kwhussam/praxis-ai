import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { AnimatedButton } from "@/components/ui/AnimatedButton";
import { GlassCard } from "@/components/ui/GlassCard";
import { Screen } from "@/components/ui/Screen";
import { colors } from "@/constants/colors";
import { requestPasswordReset } from "@/lib/auth/password-reset";
import { supabase } from "@/lib/supabase/client";
import { useSessionStore, type Practice } from "@/lib/store/session";

export default function LoginScreen() {
  const router = useRouter();
  const { mode: requestedMode } = useLocalSearchParams<{ mode?: string }>();
  const setPractice = useSessionStore((store) => store.setPractice);
  const setSession = useSessionStore((store) => store.setSession);
  const [mode, setMode] = useState<"login" | "register">(() => (requestedMode === "register" ? "register" : "login"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const normalizedEmail = email.trim();
  const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);
  const passwordLongEnough = password.length >= 8;
  const canSubmit = emailLooksValid && passwordLongEnough && !loading && !resetLoading;

  useEffect(() => {
    if (requestedMode === "register") setMode("register");
  }, [requestedMode]);

  async function handleSubmit() {
    setLoading(true);
    setError(null);
    setNotice(null);

    try {
      if (mode === "register") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
          options: {
            emailRedirectTo: "praxisshield://auth/confirm"
          }
        });

        if (signUpError) throw signUpError;

        if (data.session && data.user) {
          setSession(data.session);
          router.replace("/(auth)/onboarding");
          return;
        }

        setNotice("Zugang angelegt. Bitte bestätigen Sie Ihre E-Mail. Danach starten Sie direkt mit dem kostenlosen Check.");
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

  async function handleForgotPassword() {
    if (resetLoading) return;

    setError(null);
    setNotice(null);

    if (!emailLooksValid) {
      setEmailTouched(true);
      setError("Bitte geben Sie zuerst eine gültige E-Mail-Adresse ein.");
      return;
    }

    setResetLoading(true);

    try {
      await requestPasswordReset(normalizedEmail);
      setNotice(
        "Falls ein Konto zu dieser E-Mail existiert, wurde ein Link zum Zurücksetzen versendet."
      );
    } catch {
      setError("Der Link konnte nicht versendet werden. Bitte versuchen Sie es erneut.");
    } finally {
      setResetLoading(false);
    }
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>{mode === "login" ? "Willkommen zurück" : "Praxis kostenlos anlegen"}</Text>
        <Text style={styles.copy}>
          {mode === "login"
            ? "Melde dich als Praxis oder White-Label-Partner an."
            : "Lege einen Zugang an und starte danach den ersten Praxis-Check."}
        </Text>
      </View>
      <GlassCard>
        {mode === "register" ? (
          <View style={styles.infoBox}>
            <View style={styles.infoIcon}>
              <Ionicons name="information" size={18} color={colors.electric} />
            </View>
            <Text style={styles.infoText}>
              Es werden keine Patientendaten verarbeitet. Der AVV wird automatisch für Sie erstellt - Sie müssen nichts
              unterschreiben.
            </Text>
          </View>
        ) : null}
        <Text style={styles.label}>E-Mail</Text>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          onBlur={() => setEmailTouched(true)}
          onChangeText={setEmail}
          placeholder="team@praxis.de"
          placeholderTextColor={colors.muted}
          style={styles.input}
          value={email}
        />
        {emailTouched && normalizedEmail.length > 0 && !emailLooksValid ? (
          <Text style={styles.validation}>Bitte eine gültige E-Mail-Adresse eingeben.</Text>
        ) : null}
        <Text style={styles.label}>Passwort</Text>
        <TextInput
          onBlur={() => setPasswordTouched(true)}
          onChangeText={setPassword}
          placeholder="Mindestens 8 Zeichen"
          placeholderTextColor={colors.muted}
          secureTextEntry
          style={styles.input}
          value={password}
        />
        {(passwordTouched || password.length > 0) && !passwordLongEnough ? (
          <Text style={styles.validation}>Das Passwort braucht noch {8 - password.length} Zeichen.</Text>
        ) : null}
        {mode === "login" ? (
          <Pressable
            accessibilityLabel="Passwort vergessen"
            accessibilityRole="button"
            accessibilityState={{ disabled: resetLoading }}
            disabled={resetLoading}
            onPress={() => {
              void handleForgotPassword();
            }}
            style={[styles.forgotPasswordButton, resetLoading ? styles.forgotPasswordButtonDisabled : null]}
            testID="auth-forgot-password"
          >
            {resetLoading ? <ActivityIndicator color={colors.electricMuted} size="small" /> : null}
            <Text style={styles.forgotPasswordText}>
              {resetLoading ? "Link wird versendet..." : "Passwort vergessen"}
            </Text>
          </Pressable>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}
        <AnimatedButton
          disabled={!canSubmit}
          label={loading ? "Bitte warten..." : mode === "login" ? "Einloggen" : "Praxis kostenlos anlegen"}
          onPress={handleSubmit}
          style={styles.button}
        />
        <AnimatedButton
          disabled={loading}
          label={mode === "login" ? "Praxis kostenlos anlegen" : "Einloggen"}
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
  infoBox: {
    alignItems: "flex-start",
    backgroundColor: colors.electricSoft,
    borderColor: "rgba(45, 126, 248, 0.3)",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    marginBottom: 18,
    padding: 14
  },
  infoIcon: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 999,
    height: 28,
    justifyContent: "center",
    marginTop: 1,
    width: 28
  },
  infoText: {
    color: colors.ink,
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19
  },
  button: {
    marginTop: 8
  },
  secondaryButton: {
    marginTop: 12
  },
  forgotPasswordButton: {
    alignItems: "center",
    alignSelf: "center",
    flexDirection: "row",
    gap: 8,
    marginBottom: 14,
    minHeight: 44,
    paddingHorizontal: 12
  },
  forgotPasswordButtonDisabled: {
    opacity: 0.6
  },
  forgotPasswordText: {
    color: colors.electricMuted,
    fontSize: 14,
    fontWeight: "800"
  },
  error: {
    color: colors.critical,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19,
    marginBottom: 12
  },
  validation: {
    color: colors.warning,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
    marginBottom: 10,
    marginTop: -8
  },
  notice: {
    color: colors.safe,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19,
    marginBottom: 12
  }
});
