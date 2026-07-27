import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { verifyBackofficeTotp } from "@/lib/backoffice/auth";
import { supabase } from "@/lib/api/supabase";

export default function BackofficeMfaScreen() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function verify() {
    setLoading(true);
    setError(null);
    try {
      await verifyBackofficeTotp(code);
      router.replace("/backoffice" as never);
    } catch (verificationError) {
      setError(verificationError instanceof Error ? verificationError.message : "MFA-Code konnte nicht bestätigt werden.");
    } finally {
      setLoading(false);
    }
  }

  if (Platform.OS !== "web") return <View />;

  return (
    <View style={styles.page}>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>ZWEITER FAKTOR</Text>
        <Text style={styles.title}>Anmeldung bestätigen</Text>
        <Text style={styles.copy}>Gib den sechsstelligen Code aus deiner Authenticator-App ein.</Text>
        <TextInput
          keyboardType="number-pad"
          maxLength={6}
          onChangeText={(value) => setCode(value.replace(/\D/g, ""))}
          placeholder="000000"
          style={styles.code}
          value={code}
        />
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <Pressable disabled={loading || code.length !== 6} onPress={() => void verify()} style={[styles.button, (loading || code.length !== 6) && styles.disabled]}>
          {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>Code bestätigen</Text>}
        </Pressable>
        <Pressable onPress={() => void supabase.auth.signOut().then(() => router.replace("/backoffice/login" as never))}>
          <Text style={styles.cancel}>Mit anderem Konto anmelden</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { alignItems: "center", backgroundColor: "#F4F7FB", flex: 1, justifyContent: "center", padding: 24 },
  card: { backgroundColor: "#FFFFFF", borderColor: "#D9E2EC", borderRadius: 16, borderWidth: 1, maxWidth: 440, padding: 38, width: "100%" },
  eyebrow: { color: "#147D6B", fontSize: 12, fontWeight: "800", letterSpacing: 1.5 },
  title: { color: "#102A43", fontSize: 30, fontWeight: "800", marginTop: 12 },
  copy: { color: "#627D98", fontSize: 15, lineHeight: 23, marginTop: 10 },
  code: { borderColor: "#9FB3C8", borderRadius: 10, borderWidth: 1, color: "#102A43", fontSize: 28, fontWeight: "700", letterSpacing: 10, marginTop: 28, paddingHorizontal: 20, paddingVertical: 13, textAlign: "center" },
  error: { color: "#B42318", fontSize: 13, marginTop: 14 },
  button: { alignItems: "center", backgroundColor: "#147D6B", borderRadius: 10, height: 50, justifyContent: "center", marginTop: 22 },
  disabled: { opacity: 0.45 },
  buttonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  cancel: { color: "#486581", fontSize: 14, fontWeight: "600", marginTop: 22, textAlign: "center" }
});
