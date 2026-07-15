import { router } from "expo-router";
import { LogOut, Mail, UserCog } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { AnimatedButton } from "@/components/ui/AnimatedButton";
import { Screen } from "@/components/ui/Screen";
import { colors } from "@/constants/colors";
import { supabase } from "@/lib/supabase/client";
import { useSessionStore } from "@/lib/store/session";

export default function SettingsScreen() {
  const practice = useSessionStore((state) => state.practice);
  const session = useSessionStore((state) => state.session);
  const clearSession = useSessionStore((state) => state.clear);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    setError(null);

    const { error: signOutError } = await supabase.auth.signOut();
    clearSession();
    setSigningOut(false);

    if (signOutError) {
      setError(errorMessage(signOutError));
      return;
    }

    router.replace("/(auth)/login");
  }

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.iconWrap}>
          <UserCog color={colors.electricMuted} size={28} />
        </View>
        <Text style={styles.kicker}>Profil & Einstellungen</Text>
        <Text style={styles.title}>{practice?.name ?? "Praxis"}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Angemeldetes Konto</Text>
        <View style={styles.accountRow}>
          <Mail color={colors.muted} size={18} />
          <Text style={styles.accountText}>{session?.user.email ?? practice?.email ?? "Keine E-Mail verfügbar"}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Sitzung</Text>
        <Text style={styles.cardText}>Melden Sie sich ab, wenn Sie dieses Gerät nicht weiter für PraxisShield verwenden möchten.</Text>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <AnimatedButton
          disabled={signingOut}
          icon={signingOut ? <ActivityIndicator color={colors.ink} /> : <LogOut color={colors.ink} size={20} />}
          label={signingOut ? "Abmelden..." : "Abmelden"}
          onPress={handleSignOut}
          variant="danger"
          style={styles.logoutButton}
        />
      </View>

      <Pressable style={styles.backLink} onPress={() => router.back()}>
        <Text style={styles.backText}>Zurück</Text>
      </Pressable>
    </Screen>
  );
}

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  return "Abmeldung fehlgeschlagen. Bitte erneut versuchen.";
}

const styles = StyleSheet.create({
  header: {
    marginBottom: 22
  },
  iconWrap: {
    alignItems: "center",
    backgroundColor: colors.electricSoft,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    height: 54,
    justifyContent: "center",
    marginBottom: 18,
    width: 54
  },
  kicker: {
    color: colors.electric,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  title: {
    color: colors.ink,
    fontSize: 30,
    fontWeight: "900",
    marginTop: 6
  },
  card: {
    backgroundColor: colors.glass,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 16,
    padding: 16
  },
  cardTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "900"
  },
  cardText: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8
  },
  accountRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    marginTop: 12
  },
  accountText: {
    color: colors.ink,
    flex: 1,
    fontSize: 15,
    fontWeight: "700"
  },
  errorText: {
    color: colors.critical,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
    marginTop: 12
  },
  logoutButton: {
    marginTop: 16
  },
  backLink: {
    alignItems: "center",
    alignSelf: "center",
    paddingHorizontal: 18,
    paddingVertical: 12
  },
  backText: {
    color: colors.electricMuted,
    fontSize: 15,
    fontWeight: "900"
  }
});
