import { router } from "expo-router";
import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AnimatedButton } from "@/components/ui/AnimatedButton";
import { GlassCard } from "@/components/ui/GlassCard";
import { Screen } from "@/components/ui/Screen";
import { colors } from "@/constants/colors";
import { useCheckStore } from "@/lib/store/check";

const questions = [
  ["backups", "Werden Praxisdaten täglich gesichert?"],
  ["mfa", "Nutzen alle kritischen Konten MFA?"],
  ["staffTraining", "Gab es in den letzten 12 Monaten Awareness-Schulung?"],
  ["patching", "Gibt es einen festen Update-Prozess?"],
  ["dmarc", "Ist DMARC für die Praxisdomain aktiv?"]
] as const;

export default function QuestionnaireScreen() {
  const answers = useCheckStore((state) => state.answers);
  const setAnswer = useCheckStore((state) => state.setAnswer);
  const recalculate = useCheckStore((state) => state.recalculate);

  useEffect(() => {
    recalculate();
  }, [answers, recalculate]);

  return (
    <Screen>
      <Text style={styles.title}>5-Minuten-Fragebogen</Text>
      <Text style={styles.copy}>Klar, schnell, ohne IT-Jargon.</Text>
      <View style={styles.list}>
        {questions.map(([key, label]) => (
          <GlassCard key={key}>
            <Text style={styles.question}>{label}</Text>
            <View style={styles.toggle}>
              {[true, false].map((value) => {
                const active = answers[key] === value;
                return (
                  <Pressable
                    key={String(value)}
                    onPress={() => setAnswer(key, value)}
                    style={[styles.option, active ? styles.optionActive : null]}
                  >
                    <Text style={[styles.optionText, active ? styles.optionTextActive : null]}>{value ? "Ja" : "Nein"}</Text>
                  </Pressable>
                );
              })}
            </View>
          </GlassCard>
        ))}
      </View>
      <AnimatedButton label="Weiter zum WLAN-Scan" onPress={() => router.push("/(tabs)/check/wlan-scan")} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    color: colors.ink,
    fontSize: 34,
    fontWeight: "900"
  },
  copy: {
    color: colors.muted,
    fontSize: 16,
    marginTop: 8
  },
  list: {
    gap: 14,
    marginVertical: 22
  },
  question: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: "800",
    lineHeight: 24
  },
  toggle: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16
  },
  option: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 13,
    alignItems: "center"
  },
  optionActive: {
    backgroundColor: colors.electric,
    borderColor: colors.electric
  },
  optionText: {
    color: colors.muted,
    fontWeight: "900"
  },
  optionTextActive: {
    color: colors.ink
  }
});
