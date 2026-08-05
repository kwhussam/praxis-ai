import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { AnimatedButton } from "@/components/ui/AnimatedButton";
import { GlassCard } from "@/components/ui/GlassCard";
import { Screen } from "@/components/ui/Screen";
import { colors } from "@/constants/colors";
import { supabase } from "@/lib/supabase/client";

type RequestInput = { legalName: string; displayName: string; firstName: string; lastName: string; phone: string; street: string; postalCode: string; city: string; domain: string };
const EMPTY: RequestInput = { legalName: "", displayName: "", firstName: "", lastName: "", phone: "", street: "", postalCode: "", city: "", domain: "" };

export default function RequestPracticeScreen() {
  const router = useRouter();
  const [form, setForm] = useState<RequestInput>(EMPTY);
  const [practiceKind, setPracticeKind] = useState<"general" | "health">("health");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const valid = Object.entries(form).every(([key, value]) => key === "domain" || value.trim().length > 0);

  async function submit() {
    if (!valid || pending) return;
    setPending(true); setNotice(null);
    try {
      const { error } = await supabase.rpc("request_practice_activation", {
        p_practice_kind: practiceKind, p_legal_name: form.legalName, p_display_name: form.displayName,
        p_contact_first_name: form.firstName, p_contact_last_name: form.lastName, p_contact_phone: form.phone,
        p_street: form.street, p_postal_code: form.postalCode, p_city: form.city, p_country_code: "DE",
        p_domain: form.domain.trim() || undefined
      });
      if (error) throw error;
      setNotice("Anfrage übermittelt. Dein Sicherheitsberater prüft sie und schaltet den Zugang anschließend mit einem persönlichen Code frei.");
    } catch (error) {
      setNotice((error as { code?: string })?.code === "23505" ? "Für dieses Konto liegt bereits eine offene Praxisanfrage vor." : "Die Anfrage konnte nicht übermittelt werden. Bitte später erneut versuchen.");
    } finally { setPending(false); }
  }

  return <Screen><ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
    <Text style={styles.title}>Praxis anfragen</Text><Text style={styles.copy}>Die Anfrage bleibt deaktiviert. Erst nach deiner Freigabe durch den Sicherheitsberater und einem Aktivierungscode erhältst du Zugriff.</Text>
    <GlassCard style={styles.card}>
      <Text style={styles.label}>Praxisart</Text>
      <View style={styles.kindRow}>
        <KindButton active={practiceKind === "health"} label="Gesundheitseinrichtung" onPress={() => setPracticeKind("health")} />
        <KindButton active={practiceKind === "general"} label="Allgemeines Unternehmen" onPress={() => setPracticeKind("general")} />
      </View>
      <Field label="Rechtlicher Praxisname" value={form.legalName} onChange={(legalName) => setForm({ ...form, legalName })} />
      <Field label="Anzeigename" value={form.displayName} onChange={(displayName) => setForm({ ...form, displayName })} />
      <Field label="Vorname" value={form.firstName} onChange={(firstName) => setForm({ ...form, firstName })} />
      <Field label="Nachname" value={form.lastName} onChange={(lastName) => setForm({ ...form, lastName })} />
      <Field label="Telefon" value={form.phone} onChange={(phone) => setForm({ ...form, phone })} />
      <Field label="Straße und Hausnummer" value={form.street} onChange={(street) => setForm({ ...form, street })} />
      <Field label="PLZ" value={form.postalCode} onChange={(postalCode) => setForm({ ...form, postalCode })} />
      <Field label="Ort" value={form.city} onChange={(city) => setForm({ ...form, city })} />
      <Field label="Domain (optional)" value={form.domain} onChange={(domain) => setForm({ ...form, domain })} />
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      <AnimatedButton disabled={!valid || pending || notice !== null} label={pending ? "Wird übermittelt …" : "Praxisanfrage senden"} onPress={() => void submit()} style={styles.button} />
      <AnimatedButton label="Zurück" variant="ghost" onPress={() => router.replace("/(auth)/onboarding")} style={styles.back} />
    </GlassCard>
  </ScrollView></Screen>;
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput value={value} onChangeText={onChange} style={styles.input} placeholderTextColor={colors.muted} /></View>;
}

function KindButton({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return <Pressable accessibilityRole="radio" accessibilityState={{ checked: active }} onPress={onPress} style={[styles.kindButton, active && styles.kindButtonActive]}><Text style={[styles.kindButtonText, active && styles.kindButtonTextActive]}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({ page: { flexGrow: 1, justifyContent: "center", paddingBottom: 28 }, title: { color: colors.ink, fontSize: 32, fontWeight: "900" }, copy: { color: colors.muted, fontSize: 15, lineHeight: 22, marginTop: 10 }, card: { marginTop: 22 }, kindRow: { flexDirection: "row", gap: 8, marginBottom: 16 }, kindButton: { borderColor: colors.border, borderRadius: 10, borderWidth: 1, flex: 1, padding: 11 }, kindButtonActive: { backgroundColor: colors.safe, borderColor: colors.safe }, kindButtonText: { color: colors.ink, fontSize: 12, fontWeight: "700", textAlign: "center" }, kindButtonTextActive: { color: "#FFFFFF" }, field: { marginBottom: 13 }, label: { color: colors.ink, fontSize: 13, fontWeight: "800", marginBottom: 7 }, input: { borderColor: colors.border, borderRadius: 12, borderWidth: 1, color: colors.ink, minHeight: 48, paddingHorizontal: 13 }, notice: { color: colors.safe, fontSize: 14, lineHeight: 20, marginTop: 6 }, button: { marginTop: 18 }, back: { marginTop: 10 } });
