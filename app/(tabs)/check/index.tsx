import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AnimatedButton } from "@/components/ui/AnimatedButton";
import { GlassCard } from "@/components/ui/GlassCard";
import { Screen } from "@/components/ui/Screen";
import { colors } from "@/constants/colors";
import { AppConfig } from "@/lib/config/environment";
import { useCheckStore } from "@/lib/store/check";

export default function CheckStartScreen() {
  const externalCheckEnabled = AppConfig.features.externalCheckEnabled;
  const assessmentProfile = useCheckStore((state) => state.assessmentProfile);
  const setAssessmentProfile = useCheckStore((state) => state.setAssessmentProfile);

  return (
    <Screen>
      <Text style={styles.title} testID="check-start-screen">Praxis-Check</Text>
      <Text style={styles.copy}>
        {externalCheckEnabled
          ? "Ein kombinierter Check aus kurzen Fragen, WLAN-Prüfung und Online-Sicht auf Ihre Praxisadresse."
          : "Ein kombinierter Check aus kurzen Fragen und WLAN-Prüfung."}
      </Text>
      <GlassCard style={styles.profileCard}>
        <Text style={styles.profileTitle}>Profil für diesen Check</Text>
        <Text style={styles.profileCopy}>
          Das Gesundheitsprofil ergänzt die allgemeine Sicherheitsbasis um anwendbare KBV-nahe Kontrollen.
        </Text>
        <View style={styles.profileOptions}>
          {([
            { value: "general" as const, label: "Allgemeine Praxis" },
            { value: "health" as const, label: "Gesundheitswesen" }
          ]).map((option) => {
            const selected = assessmentProfile === option.value;
            return (
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                key={option.value}
                onPress={() => setAssessmentProfile(option.value)}
                style={[styles.profileOption, selected ? styles.profileOptionSelected : null]}
                testID={`check-profile-${option.value}`}
              >
                <Text style={[styles.profileOptionText, selected ? styles.profileOptionTextSelected : null]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </GlassCard>
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
  profileCard: {
    marginTop: 20
  },
  profileTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "900"
  },
  profileCopy: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6
  },
  profileOptions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14
  },
  profileOption: {
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 12
  },
  profileOptionSelected: {
    backgroundColor: colors.glassStrong,
    borderColor: colors.electric
  },
  profileOptionText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800",
    textAlign: "center"
  },
  profileOptionTextSelected: {
    color: colors.ink
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
