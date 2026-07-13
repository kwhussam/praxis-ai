import { router } from "expo-router";
import { ShieldCheck } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";

import { AnimatedButton } from "@/components/ui/AnimatedButton";
import { GlassCard } from "@/components/ui/GlassCard";
import { Screen } from "@/components/ui/Screen";
import { colors } from "@/constants/colors";

export default function WelcomeScreen() {
  return (
    <Screen>
      <View style={styles.hero}>
        <View style={styles.icon}>
          <ShieldCheck color={colors.electric} size={36} strokeWidth={2.4} />
        </View>
        <Text style={styles.brand}>PraxisShield AI</Text>
        <Text style={styles.headline}>Sicherheitstransparenz in 5 Minuten.</Text>
        <Text style={styles.copy}>Kein IT-Wissen nötig. Keine Installation auf Praxis-PCs. Klar verständliche DSGVO- und Cybersecurity-Prüfung.</Text>
      </View>
      <GlassCard style={styles.promise}>
        <Text style={styles.promiseTitle}>Für Arztpraxen und IT-Partner</Text>
        <Text style={styles.copy}>White-Label-fähig, auditierbar und vorbereitet für Monitoring, Reports und konkrete Handlungsempfehlungen.</Text>
      </GlassCard>
      <View style={styles.actions}>
        <AnimatedButton
          label="Praxis kostenlos anlegen"
          onPress={() => router.push({ pathname: "/(auth)/login", params: { mode: "register" } })}
          style={styles.cta}
        />
        <AnimatedButton label="Einloggen" onPress={() => router.push("/(auth)/login")} variant="ghost" style={styles.loginCta} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    flex: 1,
    justifyContent: "center"
  },
  icon: {
    height: 68,
    width: 68,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.electricSoft,
    borderColor: colors.border,
    borderWidth: 1,
    marginBottom: 24
  },
  brand: {
    color: colors.electric,
    fontSize: 16,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  headline: {
    color: colors.ink,
    fontSize: 44,
    fontWeight: "900",
    lineHeight: 48,
    marginTop: 10
  },
  copy: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 24,
    marginTop: 14
  },
  promise: {
    marginBottom: 16
  },
  promiseTitle: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: "900"
  },
  actions: {
    marginBottom: 10
  },
  cta: {
    minHeight: 60
  },
  loginCta: {
    marginTop: 12,
    minHeight: 48
  }
});
