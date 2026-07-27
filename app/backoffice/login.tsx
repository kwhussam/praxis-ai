import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { getBackofficeAuthState } from "@/lib/backoffice/auth";
import { supabase } from "@/lib/api/supabase";

export default function BackofficeLoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getBackofficeAuthState()
      .then((state) => {
        if (state === "aal2") router.replace("/backoffice" as never);
        else if (state === "aal1") router.replace("/backoffice/mfa" as never);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [router]);

  async function signIn() {
    setLoading(true);
    setError(null);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password
      });
      if (signInError) throw signInError;
      const state = await getBackofficeAuthState();
      router.replace((state === "aal2" ? "/backoffice" : "/backoffice/mfa") as never);
    } catch {
      setError("Anmeldung nicht möglich. Bitte Zugangsdaten und Staff-Freigabe prüfen.");
    } finally {
      setLoading(false);
    }
  }

  if (Platform.OS !== "web") {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>Web-Backoffice</Text>
        <Text style={styles.subtitle}>Das interne Backoffice ist ausschließlich im Web verfügbar.</Text>
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <View style={styles.brandPanel}>
        <Text style={styles.brand}>PRAXISSHIELD</Text>
        <Text style={styles.hero}>Sicherheitsberatung professionell organisieren.</Text>
        <Text style={styles.heroCopy}>Praxen anlegen, Zugänge steuern und jeden administrativen Schritt nachvollziehbar halten.</Text>
        <View style={styles.securityNote}>
          <Text style={styles.securityTitle}>Geschützter Mitarbeiterbereich</Text>
          <Text style={styles.securityCopy}>Jeder Zugriff erfordert eine freigegebene Staff-Rolle und MFA auf AAL2.</Text>
        </View>
      </View>
      <View style={styles.formPanel}>
        <View style={styles.formCard}>
          <Text style={styles.eyebrow}>INTERNES BACKOFFICE</Text>
          <Text style={styles.title}>Willkommen zurück</Text>
          <Text style={styles.subtitle}>Melde dich mit deinem persönlichen Mitarbeiterkonto an.</Text>
          <Text style={styles.label}>E-Mail-Adresse</Text>
          <TextInput autoCapitalize="none" onChangeText={setEmail} style={styles.input} value={email} />
          <Text style={styles.label}>Passwort</Text>
          <TextInput onChangeText={setPassword} secureTextEntry style={styles.input} value={password} />
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          <Pressable
            accessibilityRole="button"
            disabled={loading || !email.trim() || !password}
            onPress={() => void signIn()}
            style={({ pressed }) => [styles.button, (loading || !email.trim() || !password) && styles.buttonDisabled, pressed && styles.buttonPressed]}
          >
            {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>Sicher anmelden</Text>}
          </Pressable>
          <Text style={styles.privacy}>Administrative Zugriffe werden für sechs Monate personenbezogen protokolliert und anschließend irreversibel anonymisiert.</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { backgroundColor: "#F4F7FB", flex: 1, flexDirection: "row" },
  brandPanel: { backgroundColor: "#0A2540", flex: 1, justifyContent: "center", padding: 72 },
  brand: { color: "#42D3B3", fontSize: 14, fontWeight: "800", letterSpacing: 2.4, marginBottom: 42 },
  hero: { color: "#FFFFFF", fontSize: 46, fontWeight: "800", lineHeight: 54, maxWidth: 560 },
  heroCopy: { color: "#B7C8D8", fontSize: 18, lineHeight: 29, marginTop: 22, maxWidth: 540 },
  securityNote: { backgroundColor: "#123653", borderColor: "#28516D", borderRadius: 16, borderWidth: 1, marginTop: 54, maxWidth: 520, padding: 22 },
  securityTitle: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  securityCopy: { color: "#B7C8D8", fontSize: 14, lineHeight: 22, marginTop: 6 },
  formPanel: { alignItems: "center", flex: 1, justifyContent: "center", padding: 40 },
  formCard: { maxWidth: 440, width: "100%" },
  eyebrow: { color: "#147D6B", fontSize: 12, fontWeight: "800", letterSpacing: 1.7, marginBottom: 14 },
  title: { color: "#102A43", fontSize: 34, fontWeight: "800" },
  subtitle: { color: "#627D98", fontSize: 15, lineHeight: 23, marginBottom: 28, marginTop: 8 },
  label: { color: "#334E68", fontSize: 13, fontWeight: "700", marginBottom: 8, marginTop: 16 },
  input: { backgroundColor: "#FFFFFF", borderColor: "#CBD5E1", borderRadius: 10, borderWidth: 1, color: "#102A43", fontSize: 16, height: 50, paddingHorizontal: 15 },
  error: { color: "#B42318", fontSize: 13, lineHeight: 20, marginTop: 16 },
  button: { alignItems: "center", backgroundColor: "#147D6B", borderRadius: 10, height: 52, justifyContent: "center", marginTop: 24 },
  buttonDisabled: { opacity: 0.5 },
  buttonPressed: { opacity: 0.82 },
  buttonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  privacy: { color: "#829AB1", fontSize: 12, lineHeight: 18, marginTop: 24 },
  centered: { alignItems: "center", backgroundColor: "#F4F7FB", flex: 1, justifyContent: "center", padding: 24 }
});
