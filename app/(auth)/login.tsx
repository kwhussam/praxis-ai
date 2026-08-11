import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { AccessibilityInfo, ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { AnimatedButton } from "@/components/ui/AnimatedButton";
import { GlassCard } from "@/components/ui/GlassCard";
import { Screen } from "@/components/ui/Screen";
import { colors } from "@/constants/colors";
import { requestPasswordReset } from "@/lib/auth/password-reset";
import { getPendingInvitationCode } from "@/lib/auth/pending-invitation";
import { supabase } from "@/lib/supabase/client";
import { loadAccessiblePracticeForUser, useSessionStore } from "@/lib/store/session";

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
  const [hasPendingInvitation, setHasPendingInvitation] = useState(false);
  const normalizedEmail = email.trim();
  const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);
  const passwordLongEnough = password.length >= 8;
  const canSubmit = emailLooksValid && passwordLongEnough && !loading && !resetLoading;

  useEffect(() => {
    if (requestedMode === "register") setMode("register");
  }, [requestedMode]);

  useEffect(() => { void getPendingInvitationCode().then((code) => setHasPendingInvitation(Boolean(code))); }, []);

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
          router.replace(hasPendingInvitation ? "/(auth)/redeem-invitation" : "/(auth)/onboarding");
          return;
        }

        const signUpNotice = hasPendingInvitation
          ? "Zugang angelegt. Bitte bestätigen Sie Ihre E-Mail und melden Sie sich danach an, um die Einladung abzuschließen."
          : "Konto angelegt. Bitte bestätigen Sie Ihre E-Mail. Danach schalten Sie Ihren Zugang mit dem Einladungscode Ihres Beraters frei.";
        setNotice(signUpNotice);
        AccessibilityInfo.announceForAccessibility(signUpNotice);
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
      if (hasPendingInvitation) {
        router.replace("/(auth)/redeem-invitation");
        return;
      }
      const practice = await loadAccessiblePracticeForUser(data.user.id);

      if (!practice) {
        router.replace("/(auth)/onboarding");
        return;
      }

      setPractice(practice);
      router.replace("/(tabs)/dashboard");
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : "Anmeldung fehlgeschlagen.";
      setError(message);
      AccessibilityInfo.announceForAccessibility(message);
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
      const message = "Bitte geben Sie zuerst eine gültige E-Mail-Adresse ein.";
      setError(message);
      AccessibilityInfo.announceForAccessibility(message);
      return;
    }

    setResetLoading(true);

    try {
      await requestPasswordReset(normalizedEmail);
      const message = "Falls ein Konto zu dieser E-Mail existiert, wurde ein Link zum Zurücksetzen versendet.";
      setNotice(message);
      AccessibilityInfo.announceForAccessibility(message);
    } catch {
      const message = "Der Link konnte nicht versendet werden. Bitte versuchen Sie es erneut.";
      setError(message);
      AccessibilityInfo.announceForAccessibility(message);
    } finally {
      setResetLoading(false);
    }
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>{hasPendingInvitation ? "Einladung abschließen" : mode === "login" ? "Willkommen zurück" : "Konto anlegen"}</Text>
        <Text style={styles.copy}>
          {hasPendingInvitation
            ? "Melde dich an oder erstelle ein Konto mit der E-Mail-Adresse, an die deine Einladung gesendet wurde."
            : mode === "login"
            ? "Melde dich als Praxis oder White-Label-Partner an."
            : "Lege ein Konto an. Deine Praxis schaltet dein Sicherheitsberater anschließend mit einem Einladungscode frei."}
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
          accessibilityHint="Geben Sie die E-Mail-Adresse Ihres Kontos ein."
          accessibilityLabel="E-Mail-Adresse"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          onBlur={() => setEmailTouched(true)}
          onChangeText={setEmail}
          placeholder="team@praxis.de"
          placeholderTextColor={colors.muted}
          style={styles.input}
          testID="auth-email"
          value={email}
        />
        {emailTouched && normalizedEmail.length > 0 && !emailLooksValid ? (
          <Text style={styles.validation}>Bitte eine gültige E-Mail-Adresse eingeben.</Text>
        ) : null}
        <Text style={styles.label}>Passwort</Text>
        <TextInput
          accessibilityHint="Geben Sie Ihr Passwort mit mindestens acht Zeichen ein."
          accessibilityLabel="Passwort"
          blurOnSubmit
          onBlur={() => setPasswordTouched(true)}
          onChangeText={setPassword}
          onSubmitEditing={() => {
            if (canSubmit) void handleSubmit();
          }}
          placeholder="Mindestens 8 Zeichen"
          placeholderTextColor={colors.muted}
          returnKeyType="go"
          secureTextEntry
          style={styles.input}
          testID="auth-password"
          value={password}
        />
        {(passwordTouched || password.length > 0) && !passwordLongEnough ? (
          <Text style={styles.validation}>Das Passwort braucht noch {8 - password.length} Zeichen.</Text>
        ) : null}
        {mode === "login" ? (
          <>
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
            <Pressable
              accessibilityLabel="Einmalcode für Passwort-Reset eingeben"
              accessibilityRole="button"
              disabled={resetLoading}
              onPress={() => router.push("/(auth)/reset-password?mode=code")}
              style={[styles.forgotPasswordButton, resetLoading ? styles.forgotPasswordButtonDisabled : null]}
              testID="auth-open-reset-code"
            >
              <Text style={styles.forgotPasswordText}>Einmalcode eingeben</Text>
            </Pressable>
          </>
        ) : null}
        {error ? (
          <Text
            accessibilityLiveRegion="assertive"
            accessibilityRole="alert"
            style={styles.error}
            testID="auth-error"
          >
            {error}
          </Text>
        ) : null}
        {notice ? (
          <Text accessibilityLiveRegion="polite" style={styles.notice} testID="auth-notice">
            {notice}
          </Text>
        ) : null}
        <AnimatedButton
          disabled={!canSubmit}
          label={loading ? "Bitte warten..." : mode === "login" ? "Einloggen" : hasPendingInvitation ? "Konto für Einladung anlegen" : "Konto anlegen"}
          onPress={handleSubmit}
          style={styles.button}
          testID="auth-submit"
        />
        <AnimatedButton
          disabled={loading}
          label={mode === "login" ? hasPendingInvitation ? "Noch kein Konto? Jetzt anlegen" : "Konto anlegen" : "Einloggen"}
          onPress={() => {
            setError(null);
            setNotice(null);
            setMode((current) => (current === "login" ? "register" : "login"));
          }}
          variant="ghost"
          style={styles.secondaryButton}
          testID="auth-switch-mode"
        />
        {!hasPendingInvitation ? (
          <AnimatedButton
            label="Einladungscode einlösen"
            onPress={() => router.push("/(auth)/redeem-invitation")}
            variant="ghost"
            style={styles.secondaryButton}
            testID="auth-open-invitation"
          />
        ) : null}
      </GlassCard>
    </Screen>
  );
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
