import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AnimatedButton } from "@/components/ui/AnimatedButton";
import { GlassCard } from "@/components/ui/GlassCard";
import { Screen } from "@/components/ui/Screen";
import { colors } from "@/constants/colors";
import { QUESTIONNAIRE_SECTIONS, type QuestionnaireAnswerValue, type QuestionnaireQuestion } from "@/lib/security/questionnaire";
import { useCheckStore } from "@/lib/store/check";

const ANSWER_OPTIONS: Array<{ value: QuestionnaireAnswerValue; label: string }> = [
  { value: true, label: "Ja" },
  { value: false, label: "Nein" },
  { value: null, label: "Weiß ich nicht" }
];

const TERM_EXPLANATIONS: Array<{ terms: string[]; explanation: string }> = [
  {
    terms: ["mfa", "2fa"],
    explanation: "MFA/2FA bedeutet: Beim Einloggen braucht man zusätzlich zum Passwort z. B. eine App, SMS oder einen Sicherheitsschlüssel."
  },
  {
    terms: ["vpn"],
    explanation: "VPN bedeutet: Ein geschützter Zugang von außen ins Praxisnetz, zum Beispiel für Fernwartung."
  },
  {
    terms: ["backup", "backups"],
    explanation: "Backup bedeutet: Eine Sicherheitskopie wichtiger Daten, damit man sie nach einem Ausfall wiederherstellen kann."
  },
  {
    terms: ["restore"],
    explanation: "Restore-Test bedeutet: Man probiert aus, ob eine Sicherung wirklich wiederhergestellt werden kann."
  },
  {
    terms: ["patch", "patching", "firmware"],
    explanation: "Patch oder Firmware-Update bedeutet: Sicherheitsupdates für Geräte, Computer, Router oder Praxissoftware."
  },
  {
    terms: ["avv"],
    explanation: "AVV ist der Vertrag mit Dienstleistern, die in Ihrem Auftrag Daten verarbeiten."
  },
  {
    terms: ["toms"],
    explanation: "TOMs sind Schutzmaßnahmen, zum Beispiel Rechte, Passwörter, Backups und sichere Abläufe."
  },
  {
    terms: ["verarbeitungstätigkeiten", "löschkonzept", "berechtigungs"],
    explanation: "Das sind Datenschutz-Unterlagen: Welche Daten genutzt werden, wer Zugriff hat und wann Daten gelöscht werden."
  },
  {
    terms: ["vlan"],
    explanation: "VLAN bedeutet: Geräte werden im Netzwerk getrennt, damit z. B. Kartenterminal und Gäste-WLAN nicht dasselbe Netz nutzen."
  },
  {
    terms: ["client-isolation"],
    explanation: "Client-Isolation bedeutet: Geräte im Gäste-WLAN können sich gegenseitig nicht direkt sehen."
  },
  {
    terms: ["dns"],
    explanation: "DNS ist das Adressbuch des Internets. Ein DNS-Filter kann bekannte Schadseiten blockieren."
  },
  {
    terms: ["dhcp", "gateway-ip"],
    explanation: "DHCP verteilt automatisch Netzwerkadressen. Gateway ist meistens der Router, über den Geräte ins Internet gehen."
  },
  {
    terms: ["upnp"],
    explanation: "UPnP erlaubt Geräten, automatisch Router-Freigaben zu öffnen. Das sollte in Praxisnetzen kontrolliert oder deaktiviert sein."
  },
  {
    terms: ["router-freigaben"],
    explanation: "Router-Freigaben öffnen gezielt Zugänge von außen. Jede Freigabe sollte einen klaren Zweck und Verantwortlichen haben."
  },
  {
    terms: ["ipv6"],
    explanation: "IPv6 ist eine neuere Art von Internetadresse. Auch dafür müssen Firewall- und DNS-Regeln passen."
  },
  {
    terms: ["schutz gegen gefälschte e-mails"],
    explanation: "Dieser Schutz hilft, gefälschte E-Mails im Namen Ihrer Praxis zu erkennen und abzuweisen."
  },
  {
    terms: ["awareness"],
    explanation: "Awareness-Schulung bedeutet: Das Team übt, Betrug, Phishing und Datenschutzrisiken im Alltag zu erkennen."
  }
];

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
      <Text style={styles.copy}>
        Kurze Fragen zu Schutzmaßnahmen und Nachweisen. Es werden keine Patientendaten, keine Dateien und keine Inhalte
        gelesen.
      </Text>
      <View style={styles.list}>
        {QUESTIONNAIRE_SECTIONS.map((section) => (
          <GlassCard key={section.title}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.questions}>
              {section.questions.map((question) => (
                <View key={question.key} style={styles.questionBlock}>
                  <Text style={styles.question}>{question.label}</Text>
                  <InfoHint question={question} />
                  <View style={styles.toggle}>
                    {ANSWER_OPTIONS.map(({ value, label }) => {
                      const active = answers[question.key] === value;
                      return (
                        <Pressable
                          key={String(value)}
                          onPress={() => setAnswer(question.key, value)}
                          style={[styles.option, active ? styles.optionActive : null]}
                        >
                          <Text style={[styles.optionText, active ? styles.optionTextActive : null]}>{label}</Text>
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

function InfoHint({ question }: { question: QuestionnaireQuestion }) {
  const explanation = explanationForQuestion(question);

  return (
    <View style={styles.infoHint}>
      <Ionicons name="information-circle" size={16} color={colors.electric} />
      <Text style={styles.infoHintText}>{explanation}</Text>
    </View>
  );
}

function explanationForQuestion(question: QuestionnaireQuestion) {
  const text = question.label.toLowerCase();
  const matches = TERM_EXPLANATIONS.filter((entry) => entry.terms.some((term) => text.includes(term)));

  if (matches.length > 0) {
    return matches.map((match) => match.explanation).join(" ");
  }

  return "Wenn Sie es nicht sicher wissen, wählen Sie einfach \"Weiß ich nicht\". Das ist besser als zu raten.";
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
  infoHint: {
    alignItems: "flex-start",
    backgroundColor: colors.electricSoft,
    borderColor: "rgba(45, 126, 248, 0.28)",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
    padding: 10
  },
  infoHintText: {
    color: colors.ink,
    flex: 1,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17
  },
  toggle: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 16
  },
  option: {
    flex: 1,
    minWidth: 92,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 13,
    alignItems: "center",
    paddingHorizontal: 8
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
