import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { AnimatedButton } from "@/components/ui/AnimatedButton";
import { GlassCard } from "@/components/ui/GlassCard";
import { Screen } from "@/components/ui/Screen";
import { colors } from "@/constants/colors";

export default function CheckStartScreen() {
  return (
    <Screen>
      <Text style={styles.title}>Praxis-Check</Text>
      <Text style={styles.copy}>Ein kombinierter Check aus Fragebogen, WLAN-Signal und externem Domain-Risiko.</Text>
      <View style={styles.cards}>
        <GlassCard delay={60}>
          <Text style={styles.cardTitle}>1. Schnellfragebogen</Text>
          <Text style={styles.cardCopy}>Backups, MFA, Updates, Schulungen und Basis-DSGVO.</Text>
        </GlassCard>
        <GlassCard delay={140}>
          <Text style={styles.cardTitle}>2. WLAN-Scan</Text>
          <Text style={styles.cardCopy}>Mobile Prüfung ohne Installation auf Praxis-PCs.</Text>
        </GlassCard>
        <GlassCard delay={220}>
          <Text style={styles.cardTitle}>3. Externer Check</Text>
          <Text style={styles.cardCopy}>Domain, Mail-Sicherheit, Zertifikate und bekannte Leaks.</Text>
        </GlassCard>
      </View>
      <AnimatedButton label="Check starten" onPress={() => router.push("/(tabs)/check/questionnaire")} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    color: colors.ink,
    fontSize: 38,
    fontWeight: "900"
  },
  copy: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 23,
    marginTop: 10
  },
  cards: {
    gap: 14,
    marginVertical: 24
  },
  cardTitle: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: "900"
  },
  cardCopy: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8
  }
});
