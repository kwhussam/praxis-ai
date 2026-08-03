import { useURL } from "expo-linking";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, ActivityIndicator, StyleSheet, Text, TextInput, View } from "react-native";

import { AnimatedButton } from "@/components/ui/AnimatedButton";
import { GlassCard } from "@/components/ui/GlassCard";
import { Screen } from "@/components/ui/Screen";
import { colors } from "@/constants/colors";
import {
  establishRecoverySession,
  establishRecoverySessionFromCode,
  updateUserPassword,
  type RecoveryResult
} from "@/lib/auth/password-reset";
import { supabase } from "@/lib/supabase/client";

type Status = "code_entry" | "verifying" | "ready" | "success";

const LINK_ERROR_COPY: Record<"invalid_link" | "expired" | "session_failed", string> = {
  invalid_link: "Dieser Link ist ungültig. Bitte fordern Sie einen neuen Link zum Zurücksetzen an.",
  expired: "Dieser Link ist abgelaufen. Bitte fordern Sie einen neuen Link zum Zurücksetzen an.",
  session_failed:
    "Die Sitzung konnte nicht wiederhergestellt werden. Bitte fordern Sie einen neuen Link zum Zurücksetzen an."
};

const CODE_ERROR_COPY = {
  invalid_code: "Bitte geben Sie die Konto-E-Mail-Adresse und den sechsstelligen Einmalcode ein.",
  expired: "Dieser Einmalcode ist abgelaufen. Bitte lassen Sie einen neuen Code erstellen.",
  session_failed: "Der Einmalcode konnte nicht bestätigt werden. Bitte prüfen Sie ihn oder lassen Sie einen neuen Code erstellen."
} as const;

// The password change itself succeeded in both cases. The second variant is
// used only when the follow-up global sign-out failed, so we tell the user
// their other sessions may still be active rather than pretending the reset
// failed.
const RESET_SUCCESS_COPY = "Ihr Passwort wurde geändert. Sie können sich jetzt mit dem neuen Passwort anmelden.";
const RESET_SUCCESS_SESSIONS_LINGER_COPY =
  "Ihr Passwort wurde geändert. Aktive Sitzungen auf anderen Geräten konnten nicht automatisch beendet werden — bitte melden Sie sich dort zur Sicherheit manuell ab.";

export default function ResetPasswordScreen() {
  const router = useRouter();
  const url = useURL();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const isCodeFlow = mode === "code";
  const processedUrl = useRef<string | null>(null);
  const [status, setStatus] = useState<Status>(() => (isCodeFlow ? "code_entry" : "verifying"));
  const [linkError, setLinkError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codePending, setCodePending] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [successNotice, setSuccessNotice] = useState(RESET_SUCCESS_COPY);
  const [formError, setFormError] = useState<string | null>(null);

  const passwordLongEnough = password.length >= 8;
  const passwordsMatch = password === confirm;
  const canSubmit = passwordLongEnough && passwordsMatch && !saving;
  const codeCanSubmit = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && code.replace(/\s+/g, "").length === 6 && !codePending;

  useEffect(() => {
    if (isCodeFlow) return;
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
  }, [isCodeFlow, url]);

  async function handleVerifyCode() {
    if (!codeCanSubmit) return;
    setCodePending(true);
    setCodeError(null);

    try {
      const result = await establishRecoverySessionFromCode(email, code);
      if (result.ok) {
        setCode("");
        setStatus("ready");
        AccessibilityInfo.announceForAccessibility("Einmalcode bestätigt. Sie können jetzt ein neues Passwort vergeben.");
        return;
      }
      const message = CODE_ERROR_COPY[result.reason];
      setCodeError(message);
      AccessibilityInfo.announceForAccessibility(message);
    } finally {
      setCodePending(false);
    }
  }

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

    setSaving(true);

    try {
      await updateUserPassword(password);
    } catch (error) {
      // Only a genuine password-change failure lands here.
      const message = `Das Passwort konnte nicht geändert werden: ${errorMessage(error)}`;
      setFormError(message);
      AccessibilityInfo.announceForAccessibility(message);
      setSaving(false);
      return;
    }

    // The password is already changed. The global sign-out revokes the other
    // devices' refresh tokens (a password change alone does not), but its
    // failure must not be reported as a failed reset — otherwise the user
    // retries a change that already happened. Treat it as best-effort and be
    // honest if the other sessions could not be cleared.
    let sessionsCleared = true;
    try {
      await supabase.auth.signOut({ scope: "global" });
    } catch {
      sessionsCleared = false;
    }

    const message = sessionsCleared ? RESET_SUCCESS_COPY : RESET_SUCCESS_SESSIONS_LINGER_COPY;
    setSuccessNotice(message);
    setStatus("success");
    AccessibilityInfo.announceForAccessibility(message);
    setSaving(false);
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

        {status === "code_entry" ? (
          <View testID="reset-password-code-entry">
            <Text style={styles.codeCopy}>Geben Sie die E-Mail-Adresse Ihres Kontos und den persönlich erhaltenen Einmalcode ein.</Text>
            <Text style={styles.label}>E-Mail-Adresse</Text>
            <TextInput
              accessibilityLabel="E-Mail-Adresse"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!codePending}
              keyboardType="email-address"
              onChangeText={setEmail}
              placeholder="team@praxis.de"
              placeholderTextColor={colors.muted}
              style={styles.input}
              testID="reset-password-code-email"
              value={email}
            />
            <Text style={styles.label}>Einmalcode</Text>
            <TextInput
              accessibilityHint="Der sechsstellige Code wird nicht gespeichert."
              accessibilityLabel="Einmalcode"
              editable={!codePending}
              keyboardType="number-pad"
              maxLength={7}
              onChangeText={setCode}
              placeholder="123456"
              placeholderTextColor={colors.muted}
              style={styles.input}
              testID="reset-password-code"
              value={code}
            />
            {codeError ? <Text accessibilityLiveRegion="assertive" accessibilityRole="alert" style={styles.error}>{codeError}</Text> : null}
            <AnimatedButton
              disabled={!codeCanSubmit}
              label={codePending ? "Code wird geprüft..." : "Code bestätigen"}
              onPress={handleVerifyCode}
              style={styles.button}
              testID="reset-password-code-submit"
            />
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
              {successNotice}
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
  codeCopy: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 10
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
