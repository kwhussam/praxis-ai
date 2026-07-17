import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { AnimatedButton } from "@/components/ui/AnimatedButton";
import { GlassCard } from "@/components/ui/GlassCard";
import { Screen } from "@/components/ui/Screen";
import { colors } from "@/constants/colors";
import { AppConfig } from "@/lib/config/environment";

export default function CheckStartScreen() {
  const externalCheckEnabled = AppConfig.features.externalCheckEnabled;

  return (
    <Screen>
      <Text style={styles.title} testID="check-start-screen">Praxis-Check</Text>
      <Text style={styles.copy}>
        {externalCheckEnabled
          ? "Ein kombinierter Check aus kurzen Fragen, WLAN-Prüfung und Online-Sicht auf Ihre Praxisadresse."
          : "Ein kombinierter Check aus kurzen Fragen und WLAN-Prüfung."}
      </Text>
      <View style={styles.cards}>
        <GlassCard delay={60}>
          <Text style={styles.cardTitle}>1. Schnellfragebogen</Text>
          <Text style={styles.cardCopy}>Datensicherung, sichere Anmeldung, Updates, Schulungen und Datenschutz-Unterlagen.</Text>
        </GlassCard>
        <GlassCard delay={140}>
          <Text style={styles.cardTitle}>2. WLAN-Scan</Text>
          <Text style={styles.cardCopy}>Mobile Prüfung ohne Installation auf Praxis-PCs.</Text>
        </GlassCard>
        <GlassCard delay={220}>
          {!externalCheckEnabled ? <Text style={styles.preparationStatus}>IN VORBEREITUNG</Text> : null}
          <Text style={styles.cardTitle}>3. Externer Check</Text>
          <Text style={styles.cardCopy}>
            {externalCheckEnabled
              ? "Praxisadresse, E-Mail-Schutz, Verschlüsselung und bekannte Datenleck-Hinweise."
              : "Diese Prüfung wird derzeit vorbereitet und ist noch nicht Bestandteil des Praxis-Checks."}
          </Text>
        </GlassCard>
      </View>
      <AnimatedButton
        label="Check starten"
        onPress={() => router.push("/(tabs)/check/questionnaire")}
        testID="check-start"
      />
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
  },
  preparationStatus: {
    color: colors.warning,
    fontSize: 12,
    fontWeight: "900",
    marginBottom: 8
  }
});
