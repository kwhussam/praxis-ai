import { useURL } from "expo-linking";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, ActivityIndicator, StyleSheet, Text, TextInput, View } from "react-native";

import { AnimatedButton } from "@/components/ui/AnimatedButton";
import { GlassCard } from "@/components/ui/GlassCard";
import { Screen } from "@/components/ui/Screen";
import { colors } from "@/constants/colors";
import { establishRecoverySession, updateUserPassword, type RecoveryResult } from "@/lib/auth/password-reset";
import { supabase } from "@/lib/supabase/client";

type Status = "verifying" | "ready" | "success";

const LINK_ERROR_COPY: Record<"invalid_link" | "expired" | "session_failed", string> = {
  invalid_link: "Dieser Link ist ungültig. Bitte fordern Sie einen neuen Link zum Zurücksetzen an.",
  expired: "Dieser Link ist abgelaufen. Bitte fordern Sie einen neuen Link zum Zurücksetzen an.",
  session_failed:
    "Die Sitzung konnte nicht wiederhergestellt werden. Bitte fordern Sie einen neuen Link zum Zurücksetzen an."
};

export default function ResetPasswordScreen() {
  const router = useRouter();
  const url = useURL();
  const processedUrl = useRef<string | null>(null);
  const [status, setStatus] = useState<Status>("verifying");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const passwordLongEnough = password.length >= 8;
  const passwordsMatch = password === confirm;
  const canSubmit = passwordLongEnough && passwordsMatch && !saving;

  useEffect(() => {
    if (!url || processedUrl.current === url) return;
    processedUrl.current = url;

    let active = true;
    void establishRecoverySession(url).then((result: RecoveryResult) => {
      if (!active) return;
      if (result.ok) {
        setLinkError(null);
        setStatus("ready");
        return;
      }
      const message = LINK_ERROR_COPY[result.reason];
      setLinkError(message);
      AccessibilityInfo.announceForAccessibility(message);
    });

    return () => {
      active = false;
    };
  }, [url]);

  async function handleSetPassword() {
    if (!canSubmit) return;
    setFormError(null);

    if (!passwordLongEnough) {
      setFormError("Das neue Passwort braucht mindestens 8 Zeichen.");
      return;
    }
    if (!passwordsMatch) {
      setFormError("Die beiden Passwörter stimmen nicht überein.");
      return;
    }

    try {
      setSaving(true);
      await updateUserPassword(password);
      // Clear the recovery session so the user signs in fresh with the new
      // password rather than staying on a short-lived recovery token.
      await supabase.auth.signOut();
      const message = "Ihr Passwort wurde geändert. Sie können sich jetzt mit dem neuen Passwort anmelden.";
      setStatus("success");
      AccessibilityInfo.announceForAccessibility(message);
    } catch (error) {
      const message = `Das Passwort konnte nicht geändert werden: ${errorMessage(error)}`;
      setFormError(message);
      AccessibilityInfo.announceForAccessibility(message);
    } finally {
      setSaving(false);
    }
  }

  function goToLogin() {
    router.replace("/(auth)/login");
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>Neues Passwort</Text>
        <Text style={styles.copy}>Vergeben Sie ein neues Passwort für Ihr PraxisShield-Konto.</Text>
      </View>
      <GlassCard>
        {status === "verifying" && !linkError ? (
          <View style={styles.centerBlock} testID="reset-password-verifying">
            <ActivityIndicator color={colors.electric} />
            <Text style={styles.verifyingText}>Link wird geprüft...</Text>
          </View>
        ) : null}

        {linkError ? (
          <View testID="reset-password-link-error">
            <Text accessibilityLiveRegion="assertive" accessibilityRole="alert" style={styles.error}>
              {linkError}
            </Text>
            <AnimatedButton
              label="Neuen Link anfordern"
              onPress={goToLogin}
              style={styles.button}
              testID="reset-password-request-new"
            />
          </View>
        ) : null}

        {status === "ready" && !linkError ? (
          <View>
            <Text style={styles.label}>Neues Passwort</Text>
            <TextInput
              accessibilityHint="Geben Sie Ihr neues Passwort mit mindestens acht Zeichen ein."
              accessibilityLabel="Neues Passwort"
              onChangeText={setPassword}
              placeholder="Mindestens 8 Zeichen"
              placeholderTextColor={colors.muted}
              secureTextEntry
              style={styles.input}
              testID="reset-password-new"
              value={password}
            />
            {password.length > 0 && !passwordLongEnough ? (
              <Text style={styles.validation}>Das Passwort braucht noch {8 - password.length} Zeichen.</Text>
            ) : null}
            <Text style={styles.label}>Passwort bestätigen</Text>
            <TextInput
              accessibilityHint="Geben Sie das neue Passwort erneut ein."
              accessibilityLabel="Passwort bestätigen"
              onChangeText={setConfirm}
              placeholder="Passwort wiederholen"
              placeholderTextColor={colors.muted}
              secureTextEntry
              style={styles.input}
              testID="reset-password-confirm"
              value={confirm}
            />
            {confirm.length > 0 && !passwordsMatch ? (
              <Text style={styles.validation}>Die beiden Passwörter stimmen nicht überein.</Text>
            ) : null}
            {formError ? (
              <Text
                accessibilityLiveRegion="assertive"
                accessibilityRole="alert"
                style={styles.error}
                testID="reset-password-error"
              >
                {formError}
              </Text>
            ) : null}
            <AnimatedButton
              disabled={!canSubmit}
              label={saving ? "Passwort wird gespeichert..." : "Passwort speichern"}
              onPress={handleSetPassword}
              style={styles.button}
              testID="reset-password-submit"
            />
          </View>
        ) : null}

        {status === "success" ? (
          <View testID="reset-password-success">
            <Text accessibilityLiveRegion="polite" style={styles.notice}>
              Ihr Passwort wurde geändert. Sie können sich jetzt mit dem neuen Passwort anmelden.
            </Text>
            <AnimatedButton
              label="Zur Anmeldung"
              onPress={goToLogin}
              style={styles.button}
              testID="reset-password-to-login"
            />
          </View>
        ) : null}
      </GlassCard>
    </Screen>
  );
}

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  return "Unbekannter Fehler";
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
  centerBlock: {
    alignItems: "center",
    gap: 12,
    paddingVertical: 16
  },
  verifyingText: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: "700"
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
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
    marginBottom: 16
  }
});
