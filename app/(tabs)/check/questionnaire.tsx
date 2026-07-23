import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { AnimatedButton } from "@/components/ui/AnimatedButton";
import { GlassCard } from "@/components/ui/GlassCard";
import { Screen } from "@/components/ui/Screen";
import { colors } from "@/constants/colors";
import { apiRequest } from "@/lib/api/client";
import {
  questionnaireSectionsForProfile,
  questionnaireSectionStatus,
  type QuestionnaireAnswerValue,
  type QuestionnaireQuestion,
  type QuestionnaireSectionStatus
} from "@/lib/security/questionnaire";
import { useCheckStore } from "@/lib/store/check";
import {
  deleteQuestionnaireDraft,
  loadQuestionnaireDraft,
  saveQuestionnaireDraft
} from "@/lib/store/questionnaireDraftStorage";
import { useSessionStore } from "@/lib/store/session";

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
  const answeredKeys = useCheckStore((state) => state.answeredKeys);
  const setAnswer = useCheckStore((state) => state.setAnswer);
  const replaceAnswers = useCheckStore((state) => state.replaceAnswers);
  const recalculate = useCheckStore((state) => state.recalculate);
  const assessmentProfile = useCheckStore((state) => state.assessmentProfile);
  const setAssessmentProfile = useCheckStore((state) => state.setAssessmentProfile);
  const practice = useSessionStore((state) => state.practice);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const [currentSectionId, setCurrentSectionId] = useState<string>();
  const [showSummary, setShowSummary] = useState(false);
  const autosaveTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const submittedRef = useRef(false);
  const sections = useMemo(
    () => questionnaireSectionsForProfile(assessmentProfile),
    [assessmentProfile]
  );
  const currentIndex = Math.max(
    0,
    sections.findIndex((section) => section.id === currentSectionId)
  );
  const currentSection = sections[currentIndex];

  useEffect(() => {
    let active = true;
    setDraftReady(false);
    if (!practice?.id) return () => {
      active = false;
    };
    void loadQuestionnaireDraft(practice.id)
      .then((draft) => {
        if (active && draft) {
          setAssessmentProfile(draft.assessmentProfile);
          replaceAnswers(draft.answers, draft.answeredKeys);
          setCurrentSectionId(draft.sectionId);
        }
      })
      .finally(() => {
        if (active) setDraftReady(true);
      });
    return () => {
      active = false;
    };
  }, [practice?.id, replaceAnswers, setAssessmentProfile]);

  useEffect(() => {
    if (sections.length === 0) return;
    if (!currentSectionId || !sections.some((section) => section.id === currentSectionId)) {
      setCurrentSectionId(sections[0].id);
      setShowSummary(false);
    }
  }, [currentSectionId, sections]);

  useEffect(() => {
    if (!draftReady || !practice?.id) return;
    if (submittedRef.current) return;
    autosaveTimeoutRef.current = setTimeout(() => {
      autosaveTimeoutRef.current = undefined;
      if (submittedRef.current) return;
      void saveQuestionnaireDraft(
        practice.id,
        answers,
        currentSectionId,
        answeredKeys,
        assessmentProfile
      ).then((saved) => {
        if (!saved) console.warn("questionnaire_draft_secure_store_unavailable");
      });
    }, 300);
    return () => {
      if (autosaveTimeoutRef.current) clearTimeout(autosaveTimeoutRef.current);
      autosaveTimeoutRef.current = undefined;
    };
  }, [answers, answeredKeys, assessmentProfile, currentSectionId, draftReady, practice?.id]);

  useEffect(() => {
    recalculate();
  }, [answers, recalculate]);

  async function handleCompleteQuestionnaire() {
    if (saving) return;
    setSaveError(null);

    if (!practice?.id) {
      setSaveError("Keine aktuelle Praxis gefunden. Bitte melden Sie sich erneut an.");
      return;
    }

    try {
      setSaving(true);
      submittedRef.current = true;
      if (autosaveTimeoutRef.current) clearTimeout(autosaveTimeoutRef.current);
      autosaveTimeoutRef.current = undefined;
      // Flush the newest UI state before the request. On success, delete is
      // queued behind this save; on failure, the complete retryable draft stays.
      await saveQuestionnaireDraft(
        practice.id,
        answers,
        currentSectionId,
        answeredKeys,
        assessmentProfile
      );
      recalculate();
      await apiRequest("/api/check/questionnaire", {
        method: "POST",
        body: {
          practiceId: practice.id,
          assessmentProfile,
          questionnaire: answers
        }
      });
      await deleteQuestionnaireDraft(practice.id);
      router.push("/(tabs)/check/wlan-scan");
    } catch (error) {
      submittedRef.current = false;
      console.error("questionnaire_save_failed", error);
      const message = `Fragebogen konnte nicht gespeichert werden: ${errorMessage(error)}`;
      setSaveError(message);
      AccessibilityInfo.announceForAccessibility(message);
    } finally {
      setSaving(false);
    }
  }

  function showPreviousSection() {
    if (showSummary) {
      setShowSummary(false);
      setCurrentSectionId(sections[sections.length - 1]?.id);
      return;
    }
    if (currentIndex > 0) setCurrentSectionId(sections[currentIndex - 1].id);
  }

  function showNextSection() {
    if (currentIndex < sections.length - 1) {
      setCurrentSectionId(sections[currentIndex + 1].id);
      return;
    }
    setShowSummary(true);
  }

  const incompleteCount = sections.filter(
    (section) => questionnaireSectionStatus(section, answeredKeys) !== "complete"
  ).length;

  return (
    <Screen>
      <Text style={styles.title}>Sicherheitsfragebogen</Text>
      <Text style={styles.copy}>
        Kurze Fragen zu Schutzmaßnahmen und Nachweisen. Es werden keine Patientendaten, keine Dateien und keine Inhalte
        gelesen.
      </Text>
      <View style={styles.progressHeader}>
        <Text style={styles.progressText}>
          {showSummary ? "Übersicht" : `${currentIndex + 1} von ${sections.length} · ${currentSection?.title ?? ""}`}
        </Text>
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { width: `${showSummary ? 100 : ((currentIndex + 1) / Math.max(1, sections.length)) * 100}%` }
            ]}
          />
        </View>
      </View>
      {showSummary ? (
        <GlassCard style={styles.wizardCard}>
          <Text style={styles.sectionTitle}>Abschlussübersicht</Text>
          <Text style={styles.summaryCopy}>
            Prüfen Sie die Gruppen vor dem Absenden. „Weiß ich nicht“ ist eine gültige Antwort und bleibt in der
            Bewertung als unbekannte Evidenz sichtbar.
          </Text>
          {incompleteCount > 0 ? (
            <View style={styles.coverageWarning} testID="questionnaire-coverage-warning">
              <Text style={styles.coverageWarningText}>
                {incompleteCount} {incompleteCount === 1 ? "Gruppe ist" : "Gruppen sind"} noch nicht vollständig
                bearbeitet. Das reduziert die Aussagekraft, wird aber nicht als bestätigte Schwachstelle gewertet.
              </Text>
            </View>
          ) : null}
          <View style={styles.summaryList}>
            {sections.map((section) => {
              const status = questionnaireSectionStatus(section, answeredKeys);
              return (
                <Pressable
                  accessibilityRole="button"
                  key={section.id}
                  onPress={() => {
                    setCurrentSectionId(section.id);
                    setShowSummary(false);
                  }}
                  style={styles.summaryRow}
                  testID={`questionnaire-summary-${section.id}`}
                >
                  <View style={styles.summaryText}>
                    <Text style={styles.summaryTitle}>{section.title}</Text>
                    <Text style={styles.summaryStatus}>{sectionStatusLabel(status)}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.electric} />
                </Pressable>
              );
            })}
          </View>
        </GlassCard>
      ) : currentSection ? (
        <GlassCard style={styles.wizardCard}>
          <Text style={styles.sectionTitle}>{currentSection.title}</Text>
          <View style={styles.questions}>
            {currentSection.questions.map((question) => (
              <View key={question.key} style={styles.questionBlock}>
                <Text style={styles.question}>{question.label}</Text>
                <InfoHint question={question} />
                <View accessibilityLabel={question.label} accessibilityRole="radiogroup" style={styles.toggle}>
                  {ANSWER_OPTIONS.map(({ value, label }) => {
                    const active = answeredKeys.includes(question.key) && answers[question.key] === value;
                    return (
                      <Pressable
                        accessibilityLabel={label}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: active }}
                        key={String(value)}
                        onPress={() => setAnswer(question.key, value)}
                        style={[styles.option, active ? styles.optionActive : null]}
                        testID={`questionnaire-answer-${question.key}-${
                          value === true ? "yes" : value === false ? "no" : "unknown"
                        }`}
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
      ) : null}
      {saveError ? (
        <View
          accessibilityLiveRegion="assertive"
          accessibilityRole="alert"
          style={styles.errorBox}
          testID="questionnaire-error"
        >
          <Text style={styles.errorText}>{saveError}</Text>
        </View>
      ) : null}
      <View style={styles.navigation}>
        {(showSummary || currentIndex > 0) ? (
          <AnimatedButton
            label="Zurück"
            onPress={showPreviousSection}
            variant="ghost"
            testID="questionnaire-back"
          />
        ) : null}
        {showSummary ? (
          <AnimatedButton
            disabled={saving}
            icon={saving ? <ActivityIndicator color={colors.ink} /> : undefined}
            label={saving ? "Fragebogen wird gespeichert..." : "Weiter zum WLAN-Scan"}
            onPress={handleCompleteQuestionnaire}
            testID="questionnaire-submit"
          />
        ) : (
          <AnimatedButton
            label={currentIndex === sections.length - 1 ? "Zur Übersicht" : "Weiter"}
            onPress={showNextSection}
            testID="questionnaire-next"
          />
        )}
      </View>
    </Screen>
  );
}

function sectionStatusLabel(status: QuestionnaireSectionStatus) {
  if (status === "complete") return "Vollständig";
  if (status === "partial") return "Teilweise";
  return "Nicht begonnen";
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

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  return "Unbekannter Fehler";
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
  progressHeader: {
    marginTop: 20
  },
  progressText: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "900"
  },
  progressTrack: {
    backgroundColor: colors.glassStrong,
    borderRadius: 999,
    height: 7,
    marginTop: 10,
    overflow: "hidden"
  },
  progressFill: {
    backgroundColor: colors.electric,
    borderRadius: 999,
    height: 7
  },
  wizardCard: {
    marginVertical: 20
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
  errorBox: {
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    borderColor: "rgba(239, 68, 68, 0.32)",
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 14,
    padding: 12
  },
  errorText: {
    color: colors.critical,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 18
  },
  navigation: {
    gap: 10,
    marginBottom: 20
  },
  summaryCopy: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 12
  },
  coverageWarning: {
    backgroundColor: "rgba(245, 158, 11, 0.12)",
    borderColor: "rgba(245, 158, 11, 0.34)",
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 14,
    padding: 12
  },
  coverageWarningText: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19
  },
  summaryList: {
    marginTop: 14
  },
  summaryRow: {
    alignItems: "center",
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 58,
    paddingVertical: 10
  },
  summaryText: {
    flex: 1
  },
  summaryTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "800"
  },
  summaryStatus: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4
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
