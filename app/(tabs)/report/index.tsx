import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, View } from "react-native";

import { AiReport } from "@/components/modules/AiReport";
import { AnimatedButton } from "@/components/ui/AnimatedButton";
import { GlassCard } from "@/components/ui/GlassCard";
import { Screen } from "@/components/ui/Screen";
import { colors } from "@/constants/colors";
import { exportReportPdf } from "@/lib/ai/report-pdf";
import { generateReport } from "@/lib/ai/report";
import { AppConfig } from "@/lib/config/environment";
import { getLatestWlanScanResult } from "@/lib/security/wlan";
import { useCheckStore } from "@/lib/store/check";
import { SAMPLE_STORED_REPORT, useReportStore } from "@/lib/store/report";
import { useSessionStore } from "@/lib/store/session";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function ReportsScreen() {
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

  async function handleGenerate() {
    if (!practice?.id || !UUID_RE.test(practice.id)) {
      setError("Praxisdaten werden noch geladen. Bitte versuchen Sie es gleich erneut.");
      return;
    }

    setGenerating(true);
    setError(null);

    const source = {
      practiceId: practice.id,
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
      setError("Bericht konnte nicht erstellt werden, bitte erneut versuchen.");
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
          <AnimatedButton
            label={generating ? "Bericht wird erstellt..." : "Erneut versuchen"}
            onPress={handleGenerate}
            style={styles.retryButton}
            disabled={!canGenerate}
            icon={generating ? <ActivityIndicator color={colors.ink} /> : undefined}
          />
        </View>
      ) : null}

      <AnimatedButton
        label={generating ? "Bericht wird erstellt..." : "KI-Bericht erzeugen"}
        onPress={handleGenerate}
        style={styles.button}
        disabled={!canGenerate}
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
  },
  retryButton: {
    marginTop: 12,
    minHeight: 48
  }
});
