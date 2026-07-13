import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, View } from "react-native";

import { AiReport } from "@/components/modules/AiReport";
import { AnimatedButton } from "@/components/ui/AnimatedButton";
import { GlassCard } from "@/components/ui/GlassCard";
import { Screen } from "@/components/ui/Screen";
import { colors } from "@/constants/colors";
import { exportReportPdf } from "@/lib/ai/report-pdf";
import { buildReportScore } from "@/lib/ai/report-findings";
import { generateReport } from "@/lib/ai/report";
import { createFallbackReport } from "@/lib/ai/sample-report";
import { getLatestWlanScanResult } from "@/lib/security/wlan";
import { useCheckStore } from "@/lib/store/check";
import { SAMPLE_STORED_REPORT, useReportStore } from "@/lib/store/report";
import { useSessionStore } from "@/lib/store/session";

export default function ReportsScreen() {
  const answers = useCheckStore((state) => state.answers);
  const score = useCheckStore((state) => state.currentScore);
  const practice = useSessionStore((state) => state.practice);
  const latestReport = useReportStore((state) => state.latest) ?? SAMPLE_STORED_REPORT;
  const saveReport = useReportStore((state) => state.saveReport);
  const setPdfPath = useReportStore((state) => state.setPdfPath);
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);

    const source = {
      practiceId: practice?.id,
      practiceName: practice?.name,
      domain: practice?.domain,
      questionnaire: answers,
      wlan: getLatestWlanScanResult(),
      external: null,
      score
    };

    try {
      const report = await generateReport(source);
      const storedReport = saveReport(report, source);
      router.push({ pathname: "/(tabs)/report/[id]", params: { id: storedReport.id } });
    } catch {
      const fallbackReport = createFallbackReport(source);
      const storedReport = saveReport(fallbackReport, source);
      setError("Der KI-Dienst war gerade nicht erreichbar. Ein lokaler Musterbericht wurde geöffnet, damit Sie den fertigen Bericht testen können.");
      router.push({ pathname: "/(tabs)/report/[id]", params: { id: storedReport.id } });
    } finally {
      setGenerating(false);
    }
  }

  async function handleExportPdf() {
    if (!latestReport) return;
    setExporting(true);

    try {
      const pdfPath = await exportReportPdf({
        practiceName: latestReport.source.practiceName ?? practice?.name ?? "Arztpraxis",
        domain: latestReport.source.domain ?? practice?.domain,
        report: latestReport.report,
        scoreReport: buildReportScore(latestReport.source)
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
      <Text style={styles.title}>KI-Bericht</Text>
      <Text style={styles.copy}>Management-tauglich für Praxisinhaber, präzise genug für IT-Partner.</Text>

      {latestReport ? (
        <AiReport report={latestReport.report} />
      ) : (
        <GlassCard>
          <Text style={styles.emptyTitle}>Noch kein KI-Bericht erstellt</Text>
          <Text style={styles.emptyCopy}>
            PraxisShield nutzt Fragebogen, WLAN-Scan und externe Checks, um daraus einen verständlichen Maßnahmenplan zu
            erstellen.
          </Text>
        </GlassCard>
      )}

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <AnimatedButton
        label={generating ? "Bericht wird erstellt..." : "KI-Bericht erzeugen"}
        onPress={handleGenerate}
        style={styles.button}
        icon={generating ? <ActivityIndicator color={colors.ink} /> : undefined}
      />

      {latestReport ? (
        <View style={styles.actions}>
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
  button: {
    marginTop: 18
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
  }
});
