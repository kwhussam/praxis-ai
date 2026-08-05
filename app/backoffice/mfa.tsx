import { useRouter } from "expo-router";
import { createElement, useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { hasVerifiedTotpFactor, verifyBackofficeTotp } from "@/lib/backoffice/auth";
import { supabase } from "@/lib/api/supabase";

function WebTotpQrCode({ uri }: { uri: string }) {
  if (Platform.OS !== "web") return null;
  // GoTrue liefert den TOTP-QR als SVG-Daten-URL. React Native Webs Image
  // rendert diese nicht zuverlässig; ein echtes Web-Image hingegen schon.
  return createElement("img", {
    src: uri,
    alt: "QR-Code für den TOTP-Schlüssel",
    style: { display: "block", height: 180, margin: "14px auto 0", width: 180 }
  });
}

export default function BackofficeMfaScreen() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enrollment, setEnrollment] = useState<{ factorId: string; secret: string; qrCode: string } | null>(null);
  const [hasVerifiedFactor, setHasVerifiedFactor] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    void supabase.auth.mfa.listFactors()
      .then(({ data, error: factorsError }) => {
        if (factorsError) throw factorsError;
        if (active) setHasVerifiedFactor(hasVerifiedTotpFactor({ data, error: null }));
      })
      .catch((factorsError: unknown) => {
        if (active) setError(factorsError instanceof Error ? factorsError.message : "MFA-Status konnte nicht geladen werden.");
      });
    return () => { active = false; };
  }, []);

  async function startEnrollment() {
    setLoading(true);
    setError(null);
    try {
      const factors = await supabase.auth.mfa.listFactors();
      if (factors.error) throw factors.error;
      const abandonedTotpFactors = factors.data.all.filter(
        (factor) => factor.factor_type === "totp" && factor.status === "unverified"
      );
      await Promise.all(abandonedTotpFactors.map(async (factor) => {
        const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
        if (unenrollError) throw unenrollError;
      }));
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "PraxisShield Backoffice"
      });
      if (enrollError) throw enrollError;
      setEnrollment({ factorId: data.id, secret: data.totp.secret, qrCode: data.totp.qr_code });
    } catch (enrollmentError) {
      setError(enrollmentError instanceof Error ? enrollmentError.message : "TOTP-Faktor konnte nicht eingerichtet werden.");
    } finally {
      setLoading(false);
    }
  }

  async function verify() {
    setLoading(true);
    setError(null);
    try {
      if (enrollment) {
        const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: enrollment.factorId });
        if (challengeError) throw challengeError;
        const { error: verifyError } = await supabase.auth.mfa.verify({ factorId: enrollment.factorId, challengeId: challenge.id, code });
        if (verifyError) throw verifyError;
      } else {
        await verifyBackofficeTotp(code);
      }
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
        <Text style={styles.copy}>{enrollment ? "Scanne den QR-Code mit deiner Authenticator-App und gib anschließend den ersten sechsstelligen Code ein." : hasVerifiedFactor === false ? "Richte zuerst eine Authenticator-App ein und gib anschließend den ersten sechsstelligen Code ein." : "Gib den sechsstelligen Code aus deiner Authenticator-App ein."}</Text>
        {hasVerifiedFactor === null ? <ActivityIndicator color="#147D6B" style={styles.factorLoader} /> : null}
        {hasVerifiedFactor === false && !enrollment ? (
          <Pressable disabled={loading} onPress={() => void startEnrollment()} style={styles.setupButton}>
            <Text style={styles.setupButtonText}>Authenticator-App erstmalig einrichten</Text>
          </Pressable>
        ) : null}
        {enrollment ? (
          <View style={styles.secretBox}>
            <Text style={styles.secretLabel}>TOTP-Schlüssel (nur jetzt sichtbar)</Text>
            <WebTotpQrCode uri={enrollment.qrCode} />
            <Text selectable style={styles.secret}>{enrollment.secret}</Text>
          </View>
        ) : null}
        <TextInput
          keyboardType="number-pad"
          maxLength={6}
          onChangeText={(value) => setCode(value.replace(/\D/g, ""))}
          placeholder="000000"
          style={styles.code}
          value={code}
        />
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <Pressable disabled={loading || hasVerifiedFactor === null || code.length !== 6} onPress={() => void verify()} style={[styles.button, (loading || hasVerifiedFactor === null || code.length !== 6) && styles.disabled]}>
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
  factorLoader: { marginTop: 18 },
  setupButton: { alignItems: "center", borderColor: "#147D6B", borderRadius: 10, borderWidth: 1, marginTop: 20, minHeight: 46, justifyContent: "center", paddingHorizontal: 16 },
  setupButtonText: { color: "#147D6B", fontSize: 14, fontWeight: "800" },
  secretBox: { backgroundColor: "#EFFAF7", borderColor: "#9EE5D5", borderRadius: 10, borderWidth: 1, marginTop: 20, padding: 14 },
  secretLabel: { color: "#334E68", fontSize: 12, fontWeight: "700" },
  secret: { color: "#102A43", fontFamily: "monospace", fontSize: 14, marginTop: 8 },
  cancel: { color: "#486581", fontSize: 14, fontWeight: "600", marginTop: 22, textAlign: "center" }
});
