import { router } from "expo-router";
import { KeyRound } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { AnimatedButton } from "@/components/ui/AnimatedButton";
import { GlassCard } from "@/components/ui/GlassCard";
import { Screen } from "@/components/ui/Screen";
import { colors } from "@/constants/colors";
import { ApiError } from "@/lib/api/client";
import { newRedeemIds, redeemInvitation, shouldResetRedeemAttempt, type RedeemIds } from "@/lib/api/invitations";
import { clearPendingInvitationCode, getPendingInvitationCode, savePendingInvitationCode } from "@/lib/auth/pending-invitation";
import { supabase } from "@/lib/supabase/client";
import { loadAccessiblePracticeForUser, useSessionStore } from "@/lib/store/session";

const CODE_LENGTH = 10;

function normalizeCode(raw: string) {
  return raw.replace(/[\s-]+/g, "").toUpperCase();
}

// Fehlertexte nach HTTP-Status statt Server-Fehlercode: die Worker-Antwort hält
// "code ungültig" und "keine passende Einladung" bewusst ununterscheidbar.
function messageForError(error: unknown): { text: string; needsLogin: boolean } {
  if (error instanceof ApiError) {
    if (error.status === 401) return { text: "Bitte zuerst einloggen und den Code danach einlösen.", needsLogin: true };
    if (error.status === 409) return { text: "Diese Einladung wurde bereits eingelöst.", needsLogin: false };
    if (error.status === 410) return { text: "Der Code ist abgelaufen. Bitte fordere einen neuen an.", needsLogin: false };
    if (error.status === 429) return { text: "Zu viele Versuche. Bitte kurz warten und erneut versuchen.", needsLogin: false };
    if (error.status === 400) return { text: "Der Code ist ungültig oder abgelaufen.", needsLogin: false };
  }
  return { text: "Einlösen fehlgeschlagen. Bitte erneut versuchen.", needsLogin: false };
}

export default function RedeemInvitationScreen() {
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  // Stabile Idempotenz-IDs je Code: ein Retry desselben Codes wiederholt den Key.
  const attempt = useRef<{ code: string; ids: RedeemIds } | null>(null);
  const setPractice = useSessionStore((state) => state.setPractice);

  useEffect(() => { void getPendingInvitationCode().then((pendingCode) => { if (pendingCode) setCode(pendingCode); }); }, []);

  const normalized = normalizeCode(code);
  const canSubmit = normalized.length === CODE_LENGTH && !pending;

  async function redeem() {
    if (!canSubmit) return;
    setPending(true);
    setError(null);
    setNeedsLogin(false);
    if (attempt.current?.code !== normalized) attempt.current = { code: normalized, ids: newRedeemIds() };
    try {
      await savePendingInvitationCode(normalized);
      const result = await redeemInvitation(normalized, attempt.current.ids);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("redeem_session_missing");
      const practice = await loadAccessiblePracticeForUser(user.id);
      if (!practice || practice.id !== result.practice_id) throw new Error("redeemed_practice_not_accessible");
      setPractice(practice);
      await clearPendingInvitationCode();
      router.replace("/(tabs)/dashboard");
    } catch (err) {
      const mapped = messageForError(err);
      setError(mapped.text);
      setNeedsLogin(mapped.needsLogin);
      if (mapped.needsLogin) await savePendingInvitationCode(normalized);
      if (shouldResetRedeemAttempt(err)) attempt.current = null;
    } finally {
      setPending(false);
    }
  }

  return (
    <Screen>
      <View style={styles.hero}>
        <View style={styles.icon}>
          <KeyRound color={colors.electric} size={32} strokeWidth={2.4} />
        </View>
        <Text style={styles.brand}>Einladung einlösen</Text>
        <Text style={styles.headline}>Praxiscode eingeben.</Text>
        <Text style={styles.copy}>Gib den 10-stelligen Einladungscode ein, den du von deinem Sicherheitsberater erhalten hast. So wird dein Zugang zur Praxis freigeschaltet.</Text>
      </View>
      <GlassCard style={styles.card}>
        <Text style={styles.label}>Einladungscode</Text>
        <TextInput
          accessibilityLabel="Einladungscode"
          autoCapitalize="characters"
          autoCorrect={false}
          editable={!pending}
          maxLength={16}
          onChangeText={setCode}
          placeholder="z. B. ABCD-EFGH-JK"
          placeholderTextColor={colors.muted}
          style={styles.input}
          testID="invitation-code"
          value={code}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <AnimatedButton
          label={pending ? "Wird eingelöst …" : "Code einlösen"}
          onPress={() => void redeem()}
          disabled={!canSubmit}
          style={styles.submit}
          testID="invitation-submit"
        />
        {needsLogin ? (
          <AnimatedButton label="Zum Login" onPress={() => router.replace("/(auth)/login")} variant="ghost" style={styles.secondary} />
        ) : (
          <AnimatedButton label="Zurück" onPress={() => router.back()} variant="ghost" style={styles.secondary} />
        )}
      </GlassCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    justifyContent: "center",
    marginTop: 12
  },
  icon: {
    height: 60,
    width: 60,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.electricSoft,
    borderColor: colors.border,
    borderWidth: 1,
    marginBottom: 20
  },
  brand: {
    color: colors.electric,
    fontSize: 15,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  headline: {
    color: colors.ink,
    fontSize: 34,
    fontWeight: "900",
    lineHeight: 40,
    marginTop: 8
  },
  copy: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 23,
    marginTop: 12
  },
  card: {
    marginTop: 28
  },
  label: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 10
  },
  input: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: 4,
    height: 56,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.electricSoft
  },
  error: {
    color: colors.warning,
    fontSize: 13,
    marginTop: 12
  },
  submit: {
    marginTop: 18,
    minHeight: 56
  },
  secondary: {
    marginTop: 12,
    minHeight: 46
  }
});
