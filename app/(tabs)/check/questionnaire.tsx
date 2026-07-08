import { router } from "expo-router";
import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AnimatedButton } from "@/components/ui/AnimatedButton";
import { GlassCard } from "@/components/ui/GlassCard";
import { Screen } from "@/components/ui/Screen";
import { colors } from "@/constants/colors";
import { QUESTIONNAIRE_SECTIONS } from "@/lib/security/questionnaire";
import { useCheckStore } from "@/lib/store/check";

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
      <Text style={styles.copy}>Basisstatus plus konkrete Nachweise für auditierbare Ergebnisse.</Text>
      <View style={styles.list}>
        {QUESTIONNAIRE_SECTIONS.map((section) => (
          <GlassCard key={section.title}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.questions}>
              {section.questions.map((question) => (
                <View key={question.key} style={styles.questionBlock}>
                  <Text style={styles.question}>{question.label}</Text>
                  <View style={styles.toggle}>
                    {[true, false].map((value) => {
                      const active = answers[question.key] === value;
                      return (
                        <Pressable
                          key={String(value)}
                          onPress={() => setAnswer(question.key, value)}
                          style={[styles.option, active ? styles.optionActive : null]}
                        >
                          <Text style={[styles.optionText, active ? styles.optionTextActive : null]}>{value ? "Ja" : "Nein"}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ))}
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
  sectionTitle: {
    color: colors.electric,
    fontSize: 13,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  questions: {
    gap: 16,
    marginTop: 16
  },
  questionBlock: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    paddingTop: 14
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
