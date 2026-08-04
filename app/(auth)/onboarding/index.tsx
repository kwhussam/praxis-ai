import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { AnimatedButton } from "@/components/ui/AnimatedButton";
import { GlassCard } from "@/components/ui/GlassCard";
import { Screen } from "@/components/ui/Screen";
import { colors } from "@/constants/colors";

// B4c (E-039): Praxen werden nicht mehr per Self-Service angelegt. Ein Konto
// ohne aktive Praxis landet hier und wird ausschließlich über einen an die
// eingeladene E-Mail gebundenen Aktivierungscode freigeschaltet.
const steps = [
  {
    icon: "person-add",
    title: "1. Berater legt Ihre Praxis an",
    copy: "Ihr Sicherheitsberater richtet die Praxis kontrolliert und revisionssicher im Backoffice ein."
  },
  {
    icon: "mail",
    title: "2. Sie erhalten einen Einladungscode",
    copy: "Der Code ist an genau die E-Mail-Adresse gebunden, mit der Sie sich angemeldet haben."
  },
  {
    icon: "shield-checkmark",
    title: "3. Code einlösen, Zugang aktiv",
    copy: "Nach dem Einlösen werden Dashboard, Fragebogen und Bericht für Ihre Praxis freigeschaltet."
  }
] as const;

export default function OnboardingScreen() {
  return (
    <Screen>
      <View style={styles.shell} testID="onboarding-screen">
        <View style={styles.header}>
          <View style={styles.badge}>
            <Ionicons name="lock-closed" size={24} color={colors.electric} />
          </View>
          <Text style={styles.title}>Zugang wird freigeschaltet</Text>
          <Text style={styles.copy}>
            Aus Sicherheitsgründen legen Sie Ihre Praxis nicht selbst an. Ihr
            Zugang wird von Ihrem Sicherheitsberater vorbereitet und mit einem
            persönlichen Einladungscode aktiviert.
          </Text>
        </View>

        <GlassCard style={styles.card}>
          {steps.map((entry, index) => (
            <View key={entry.title} style={[styles.row, index > 0 ? styles.rowSpaced : null]}>
              <View style={styles.rowIcon}>
                <Ionicons name={entry.icon} size={20} color={colors.safe} />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{entry.title}</Text>
                <Text style={styles.rowCopy}>{entry.copy}</Text>
              </View>
            </View>
          ))}
        </GlassCard>

        <View style={styles.actions}>
          <AnimatedButton
            label="Einladungscode einlösen"
            onPress={() => router.replace("/(auth)/redeem-invitation")}
            icon={<Ionicons name="key" size={18} color={colors.ink} />}
            style={styles.primaryAction}
            testID="onboarding-redeem"
          />
          <AnimatedButton
            label="Zurück zum Login"
            variant="ghost"
            onPress={() => router.replace("/(auth)/login")}
            style={styles.secondaryAction}
            testID="onboarding-back-login"
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    justifyContent: "center"
  },
  header: {
    marginBottom: 24
  },
  badge: {
    alignItems: "center",
    backgroundColor: colors.electricSoft,
    borderColor: "rgba(45, 126, 248, 0.34)",
    borderRadius: 20,
    borderWidth: 1,
    height: 60,
    justifyContent: "center",
    marginBottom: 20,
    width: 60
  },
  title: {
    color: colors.ink,
    fontSize: 34,
    fontWeight: "900",
    lineHeight: 40
  },
  copy: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 24,
    marginTop: 12
  },
  card: {
    marginBottom: 24
  },
  row: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12
  },
  rowSpaced: {
    marginTop: 18
  },
  rowIcon: {
    alignItems: "center",
    backgroundColor: "rgba(46, 213, 115, 0.12)",
    borderColor: "rgba(46, 213, 115, 0.28)",
    borderRadius: 14,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    width: 42
  },
  rowText: {
    flex: 1
  },
  rowTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "900"
  },
  rowCopy: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 3
  },
  actions: {
    gap: 10
  },
  primaryAction: {
    minHeight: 56
  },
  secondaryAction: {
    minHeight: 48
  }
});
