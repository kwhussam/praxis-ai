import { useLocalSearchParams, router } from "expo-router";
import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { BarChart } from "@/components/charts/BarChart";
import { RadarChart } from "@/components/charts/RadarChart";
import { AiReport } from "@/components/modules/AiReport";
import { ReportFindings } from "@/components/modules/ReportFindings";
import { AnimatedButton } from "@/components/ui/AnimatedButton";
import { GlassCard } from "@/components/ui/GlassCard";
import { Screen } from "@/components/ui/Screen";
import { colors } from "@/constants/colors";
import { buildReportScore } from "@/lib/ai/report-findings";
import type { Report } from "@/lib/ai/report";
import { SAMPLE_STORED_REPORT, useReportStore } from "@/lib/store/report";

export default function ReportDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const latestReport = useReportStore((state) => state.latest) ?? SAMPLE_STORED_REPORT;
  const scoreReport = useMemo(
    () => (latestReport && latestReport.id === id ? buildReportScore(latestReport.source) : null),
    [id, latestReport]
  );

  if (!latestReport || latestReport.id !== id) {
    return (
      <Screen>
        <Text style={styles.title}>Audit-Bericht</Text>
        <GlassCard style={styles.card}>
          <Text style={styles.section}>Bericht nicht gefunden</Text>
          <Text style={styles.body}>Erstellen Sie einen neuen KI-Bericht, um die Detailansicht zu öffnen.</Text>
        </GlassCard>
        <AnimatedButton label="Zurück zum KI-Bericht" onPress={() => router.push("/(tabs)/report")} />
      </Screen>
    );
  }

  const report = latestReport.report;

  return (
    <Screen>
      <Text style={styles.title}>Audit-Bericht</Text>
      <Text style={styles.copy}>
        Report-ID: {latestReport.id} · {new Date(latestReport.createdAt).toLocaleDateString("de-DE")}
      </Text>

      <AiReport report={report} />

      <View style={styles.space} />
      <RadarChart title="Risikoprofil" data={categoryRadar(report)} />

      <View style={styles.space} />
      <BarChart title="Kategorie-Überblick" data={categoryBars(report)} />

      <View style={styles.space} />
      {scoreReport ? <ReportFindings scoreReport={scoreReport} /> : null}

      <View style={styles.space} />
      <GlassCard style={styles.card}>
        <Text style={styles.section}>Was muss ich jetzt tun?</Text>
        {report.top_risks.slice(0, 3).map((risk) => (
          <View key={`${risk.rank}-${risk.title}`} style={styles.action}>
            <Text style={styles.actionRank}>{risk.rank}</Text>
            <View style={styles.actionText}>
              <Text style={styles.actionTitle}>{risk.title}</Text>
              <Text style={styles.body}>{risk.plain_language}</Text>
              <Text style={styles.actionMeta}>
                {priorityLabel(risk.priority)} · {risk.effort_hours} · {risk.cost_estimate}
              </Text>
              <Text style={styles.nextStep}>Nächster Schritt: {plainAction(risk.action)}</Text>
            </View>
          </View>
        ))}
      </GlassCard>

      <GlassCard style={styles.card}>
        <Text style={styles.section}>Nicht geprüft / technische Einschränkungen</Text>
        {report.not_checked_limitations.length > 0 ? (
          report.not_checked_limitations.map((limitation) => (
            <View key={`${limitation.area}-${limitation.reason}`} style={styles.limitation}>
              <Text style={styles.limitationTitle}>{limitation.area}</Text>
              <Text style={styles.body}>{limitation.reason}</Text>
              <Text style={styles.nextStep}>Auswirkung: {limitation.impact}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.body}>
            Keine Einschränkungen im KI-Bericht angegeben. Positive Aussagen gelten nur für tatsächlich geprüfte oder nachgewiesene Bereiche.
          </Text>
        )}
      </GlassCard>

      <GlassCard style={styles.card}>
        <Text style={styles.section}>DSGVO-Einschätzung</Text>
        <Text style={styles.body}>Status: {dsgvoStatusLabel(report.dsgvo_compliance.status)}</Text>
        <Text style={styles.body}>{report.dsgvo_compliance.liability_risk}</Text>
        <Text style={styles.subsection}>Fehlende Dokumente</Text>
        <Text style={styles.body}>
          {report.dsgvo_compliance.missing_documents.length > 0
            ? report.dsgvo_compliance.missing_documents.join(", ")
            : "Keine wesentlichen Lücken angegeben."}
        </Text>
      </GlassCard>
    </Screen>
  );
}

function categoryRadar(report: Report) {
  return [
    { label: "Zugänge", value: report.scores_by_category.access_control },
    { label: "Backup", value: report.scores_by_category.backup },
    { label: "Mail", value: report.scores_by_category.email_security },
    { label: "WLAN", value: report.scores_by_category.network },
    { label: "DSGVO", value: report.scores_by_category.dsgvo },
    { label: "Updates", value: report.scores_by_category.updates }
  ];
}

function categoryBars(report: Report) {
  const colorForScore = (score: number) => {
    if (score >= 80) return colors.safe;
    if (score >= 55) return colors.warning;
    return colors.critical;
  };

  return categoryRadar(report).map((item) => ({
    ...item,
    color: colorForScore(item.value)
  }));
}

function priorityLabel(priority: Report["top_risks"][number]["priority"]) {
  if (priority === "sofort") return "Sofort";
  if (priority === "diese_woche") return "Diese Woche";
  return "Diesen Monat";
}

function dsgvoStatusLabel(status: Report["dsgvo_compliance"]["status"]) {
  if (status === "nicht_konform") return "Nicht konform";
  if (status === "teilweise") return "Teilweise konform";
  return "Konform";
}

function plainAction(value: string) {
  return value
    .replace(/\bDMARC\b/g, "Schutz gegen gefälschte Praxis-Mails")
    .replace(/\bSPF\b|\bDKIM\b/g, "E-Mail-Schutz")
    .replace(/\bVLANs?\b/g, "getrennte Netze")
    .replace(/\bMFA\b|\b2FA\b/g, "zweite Bestätigung beim Einloggen")
    .replace(/\bDNS\b/g, "Namensdienst")
    .replace(/\bIPv6\b/g, "neue Internetadressen")
    .replace(/\bUPnP\b/g, "automatische Router-Freigaben");
}

const styles = StyleSheet.create({
  title: {
    color: colors.ink,
    fontSize: 36,
    fontWeight: "900"
  },
  copy: {
    color: colors.muted,
    fontSize: 15,
    marginBottom: 20,
    marginTop: 8
  },
  card: {
    marginBottom: 16
  },
  section: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: "900"
  },
  subsection: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "900",
    marginTop: 16
  },
  body: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 23,
    marginTop: 10
  },
  space: {
    height: 16
  },
  action: {
    flexDirection: "row",
    gap: 12,
    marginTop: 18
  },
  actionRank: {
    backgroundColor: colors.electric,
    borderRadius: 999,
    color: colors.ink,
    fontWeight: "900",
    height: 30,
    lineHeight: 30,
    textAlign: "center",
    width: 30
  },
  actionText: {
    flex: 1
  },
  actionTitle: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: "900"
  },
  actionMeta: {
    color: colors.electric,
    fontSize: 13,
    fontWeight: "800",
    marginTop: 10
  },
  evidenceMeta: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 19,
    marginTop: 6
  },
  nextStep: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
    marginTop: 8
  },
  limitation: {
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 14,
    padding: 12
  },
  limitationTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "900"
  }
});
