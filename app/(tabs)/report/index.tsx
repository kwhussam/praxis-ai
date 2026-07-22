import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { AccessibilityInfo, ActivityIndicator, Alert, StyleSheet, Text, View } from "react-native";

import { AiReport } from "@/components/modules/AiReport";
import { AnimatedButton } from "@/components/ui/AnimatedButton";
import { GlassCard } from "@/components/ui/GlassCard";
import { Screen } from "@/components/ui/Screen";
import { colors } from "@/constants/colors";
import { exportReportPdf } from "@/lib/ai/report-pdf";
import { generateReportWithId } from "@/lib/ai/report";
import { AppConfig } from "@/lib/config/environment";
import { getLatestWlanScanResult } from "@/lib/security/wlan";
import { useCheckStore } from "@/lib/store/check";
import { SAMPLE_STORED_REPORT, useReportStore } from "@/lib/store/report";
import { useSessionStore } from "@/lib/store/session";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function ReportsScreen() {
  const { from } = useLocalSearchParams<{ from?: string }>();
  const answers = useCheckStore((state) => state.answers);
  const score = useCheckStore((state) => state.currentScore);
  const practice = useSessionStore((state) => state.practice);
  const storedReport = useReportStore((state) => state.latest);
  const demoSampleReport = AppConfig.isDemoMode && practice?.id.startsWith("demo-") ? SAMPLE_STORED_REPORT : null;
  const latestReport = storedReport ?? demoSampleReport;
  const saveReport = useReportStore((state) => state.saveReport);
  const setPdfPath = useReportStore((state) => state.setPdfPath);
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canGenerate = Boolean(practice?.id && UUID_RE.test(practice.id)) && !generating;
  const enteredFromCheckFlow = from === "check";

  async function handleGenerate() {
    if (!practice?.id || !UUID_RE.test(practice.id)) {
      const message = "Praxisdaten werden noch geladen. Bitte versuchen Sie es gleich erneut.";
      setError(message);
      AccessibilityInfo.announceForAccessibility(message);
      return;
    }

    setGenerating(true);
    setError(null);
    AccessibilityInfo.announceForAccessibility("Bericht wird erstellt");

    const source = {
      practiceId: practice.id,
      practiceName: practice?.name,
      domain: practice?.domain,
      questionnaire: answers,
      wlan: getLatestWlanScanResult(),
      // TODO(external-check): runExternalCheck hier einbinden, sobald das Feature-Flag aktiv ist und
      // Provider-Timeouts (Phase G / F-025) stehen. Ergebnis in source.external einspeisen.
      external: null,
      score
    };

    try {
      const { report, reportId } = await generateReportWithId(source);
      const storedReport = saveReport(report, source, reportId);
      router.push({ pathname: "/(tabs)/report/[id]", params: { id: storedReport.id } });
    } catch {
      const message = "Bericht konnte nicht erstellt werden, bitte erneut versuchen.";
      setError(message);
      AccessibilityInfo.announceForAccessibility(message);
    } finally {
      setGenerating(false);
    }
  }

  async function handleExportPdf() {
    if (!latestReport) return;
    setExporting(true);

    try {
      const pdfPath = await exportReportPdf({
        practiceName: latestReport.source?.practiceName ?? practice?.name ?? "Arztpraxis",
        domain: latestReport.source?.domain ?? practice?.domain,
        report: latestReport.report
      });
      setPdfPath(latestReport.id, pdfPath);
      Alert.alert("PDF erstellt", `Der Bericht wurde gespeichert:\n${pdfPath}`);
    } catch (nextError) {
      Alert.alert("PDF-Export fehlgeschlagen", nextError instanceof Error ? nextError.message : "Unbekannter Fehler");
    } finally {
      setExporting(false);
    }
  }

  return (
    <Screen>
      <Text style={styles.title} testID="report-screen">KI-Bericht</Text>
      <Text style={styles.copy}>Management-tauglich für Praxisinhaber, präzise genug für IT-Partner.</Text>

      {latestReport ? (
        <View testID="report-content">
          <AiReport report={latestReport.report} />
        </View>
      ) : error ? null : generating ? (
        <GlassCard>
          <View
            accessibilityLabel="Bericht wird erstellt"
            accessibilityLiveRegion="polite"
            style={styles.generatingRow}
            testID="report-generating"
          >
            <ActivityIndicator color={colors.electric} />
            <Text style={styles.generatingText}>Bericht wird erstellt...</Text>
          </View>
        </GlassCard>
      ) : (
        <GlassCard>
          <Text style={styles.emptyTitle}>
            {enteredFromCheckFlow ? "Check abgeschlossen" : "Noch kein Bericht vorhanden"}
          </Text>
          <Text style={styles.emptyCopy}>
            {enteredFromCheckFlow
              ? "Ihre Check-Daten sind bereit. Sie können daraus jetzt den KI-Bericht erstellen."
              : "Starten Sie den Praxis-Check. Danach erstellen wir aus den erhobenen Daten einen verständlichen Maßnahmenplan."}
          </Text>
          <AnimatedButton
            label={enteredFromCheckFlow ? "KI-Bericht erzeugen" : "Praxis-Check starten"}
            onPress={
              enteredFromCheckFlow
                ? handleGenerate
                : () => router.push("/(tabs)/check/questionnaire")
            }
            disabled={enteredFromCheckFlow ? !canGenerate : false}
            style={styles.emptyAction}
            testID={enteredFromCheckFlow ? "report-generate" : "report-start-check"}
          />
        </GlassCard>
      )}

      {error ? (
        <View
          accessibilityLiveRegion="assertive"
          accessibilityRole="alert"
          style={styles.errorBox}
          testID="report-error"
        >
          <Text style={styles.errorText}>{error}</Text>
          <AnimatedButton
            label={generating ? "Bericht wird erstellt..." : "Erneut versuchen"}
            onPress={handleGenerate}
            style={styles.retryButton}
            disabled={!canGenerate}
            testID="report-retry"
            icon={generating ? <ActivityIndicator color={colors.ink} /> : undefined}
          />
        </View>
      ) : null}

      {latestReport ? (
        <View style={styles.actions}>
          <AnimatedButton
            label={generating ? "Bericht wird erstellt..." : "Bericht neu erzeugen"}
            onPress={handleGenerate}
            variant="ghost"
            style={styles.actionButton}
            disabled={!canGenerate}
            icon={generating ? <ActivityIndicator color={colors.ink} /> : undefined}
          />
          <AnimatedButton
            label="Detailbericht öffnen"
            onPress={() => router.push({ pathname: "/(tabs)/report/[id]", params: { id: latestReport.id } })}
            variant="ghost"
            style={styles.actionButton}
          />
          <AnimatedButton
            label={exporting ? "PDF wird erstellt..." : "PDF exportieren"}
            onPress={handleExportPdf}
            variant="ghost"
            style={styles.actionButton}
            icon={exporting ? <ActivityIndicator color={colors.ink} /> : undefined}
          />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    color: colors.ink,
    fontSize: 36,
    fontWeight: "900"
  },
  copy: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 23,
    marginBottom: 22,
    marginTop: 8
  },
  emptyTitle: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: "900"
  },
  emptyCopy: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 10
  },
  emptyAction: {
    marginTop: 16
  },
  generatingRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12
  },
  generatingText: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "800"
  },
  actions: {
    gap: 12,
    marginTop: 12
  },
  actionButton: {
    minHeight: 50
  },
  errorBox: {
    backgroundColor: `${colors.critical}18`,
    borderColor: `${colors.critical}66`,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 14,
    padding: 14
  },
  errorText: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 20
  },
  retryButton: {
    marginTop: 12,
    minHeight: 48
  }
});
