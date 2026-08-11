import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Settings } from "lucide-react-native";
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { ScoreHistory } from "@/components/charts/ScoreHistory";
import { EvidenceCoveragePanel } from "@/components/modules/EvidenceCoveragePanel";
import { PracticeGuidanceCard } from "@/components/modules/PracticeGuidanceCard";
import { ScoreRing } from "@/components/ui/ScoreRing";
import { Screen } from "@/components/ui/Screen";
import { colors } from "@/constants/colors";
import { buildDashboardPosture, type DashboardViewMode } from "@/lib/dashboard/presentation";
import { loadDashboardData } from "@/lib/dashboard/service";
import type { DashboardData, DashboardHistoryPoint } from "@/lib/dashboard/types";
import { guidanceFromScoreReport } from "@/lib/security/practiceGuidance";
import { useSessionStore } from "@/lib/store/session";

export default function DashboardScreen({ queryGcTime = 5 * 60_000 }: { queryGcTime?: number }) {
  const [viewMode, setViewMode] = useState<DashboardViewMode>("practice");
  const practice = useSessionStore((state) => state.practice);
  const practiceId = practice?.id ?? null;
  // PERF-05: dashboard data now flows through React Query instead of a manual useEffect fetch.
  // Caching by [dashboard, practiceId] dedupes rapid remounts/tab-switches (no duplicate network
  // call within staleTime) and adds bounded retry for transient failures.
  const {
    data: dashboard = null,
    isPending,
    isError,
    error
  } = useQuery({
    queryKey: ["dashboard", practiceId],
    queryFn: () => loadDashboardData(practiceId as string),
    enabled: Boolean(practiceId),
    staleTime: 60_000,
    gcTime: queryGcTime,
    retry: 2
  });
  // With enabled=false (no practice), React Query stays "pending"; treat that as not-loading.
  const loading = Boolean(practiceId) && isPending;
  const loadError = isError ? errorMessage(error) : null;
  const scoreReport = dashboard?.latest.questionnaire?.scoreReport ?? null;
  const guidance = scoreReport ? guidanceFromScoreReport(scoreReport) : null;
  const posture = scoreReport ? buildDashboardPosture(scoreReport) : null;
  const historyData = useMemo(
    () =>
      dashboard
        ? dashboard.history
            .filter((point: DashboardHistoryPoint) => point.type === "questionnaire")
            .map(historyPointToChartPoint)
        : [],
    [dashboard]
  );

  return (
    <Screen>
      <View style={styles.top}>
        <View>
          <Text style={styles.kicker}>Praxis-Sicherheitsüberblick</Text>
          <Text style={styles.title}>{practice?.name ?? "Praxis"}</Text>
        </View>
        <Pressable testID="dashboard-settings" accessibilityLabel="Profil und Einstellungen öffnen" style={styles.settingsButton} onPress={() => router.push("/(tabs)/settings")}>
          <Settings color={colors.electricMuted} size={22} />
        </Pressable>
      </View>
      {loading ? (
        <View style={styles.stateCard}>
          <ActivityIndicator color={colors.electric} />
          <Text style={styles.stateTitle}>Dashboard wird geladen</Text>
          <Text style={styles.stateText}>Gespeicherte Prüfergebnisse werden geschützt abgerufen.</Text>
        </View>
      ) : loadError ? (
        <View style={styles.stateCard}>
          <Text style={styles.stateTitle}>Dashboard konnte nicht geladen werden</Text>
          <Text style={styles.stateText}>{loadError}</Text>
        </View>
      ) : dashboard && !dashboard.hasData ? (
        <NoDataState />
      ) : dashboard && dashboard.hasData ? (
        <>
          <DashboardViewSwitch value={viewMode} onChange={setViewMode} />
          {viewMode === "practice" ? (
            <>
              {guidance ? <PracticeGuidanceCard guidance={guidance} /> : <NoOverallAssessment />}
              {posture && dashboard.latest.questionnaire ? (
                <CoverageSummaryCard posture={posture} checkedAt={dashboard.latest.questionnaire.checkedAt} />
              ) : null}
              <LatestDataCard dashboard={dashboard} mode="practice" />
            </>
          ) : (
            <>
              {posture && dashboard.latest.questionnaire ? (
                <>
                  <TechnicalMetrics
                    score={dashboard.latest.questionnaire.score}
                    coverage={posture.coverage}
                    confidence={posture.confidence}
                    freshness={posture.freshnessLabel}
                  />
                  <View style={styles.scoreWrap}>
                    <ScoreRing score={dashboard.latest.questionnaire.score} label="Fragebogen-Teilwert" />
                    <Text style={styles.previewNotice}>
                      Fragebogenstand vom {formatDateTime(dashboard.latest.questionnaire.checkedAt)}. Andere Prüfbereiche werden nicht in diesen Teilwert eingerechnet.
                    </Text>
                  </View>
                </>
              ) : (
                <NoOverallAssessment />
              )}
              {scoreReport ? <EvidenceCoveragePanel report={scoreReport} /> : null}
              <LatestDataCard dashboard={dashboard} mode="technical" />
              {historyData.length > 0 ? <ScoreHistory data={historyData} /> : null}
            </>
          )}
        </>
      ) : null}
    </Screen>
  );
}

function DashboardViewSwitch({ value, onChange }: { value: DashboardViewMode; onChange: (value: DashboardViewMode) => void }) {
  return (
    <View accessibilityRole="tablist" accessibilityLabel="Dashboard-Ansicht" style={styles.viewSwitch}>
      {([
        ["practice", "Für die Praxis"],
        ["technical", "Technikdetails"]
      ] as const).map(([mode, label]) => {
        const selected = value === mode;
        return (
          <Pressable
            key={mode}
            testID={`dashboard-view-${mode}`}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected }}
            style={[styles.viewOption, selected ? styles.viewOptionSelected : null]}
            onPress={() => onChange(mode)}
          >
            <Text style={[styles.viewOptionText, selected ? styles.viewOptionTextSelected : null]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function CoverageSummaryCard({ posture, checkedAt }: { posture: ReturnType<typeof buildDashboardPosture>; checkedAt: string }) {
  return (
    <View
      testID="dashboard-coverage-summary"
      accessible
      accessibilityRole="summary"
      accessibilityLabel={`Aussagekraft der Prüfung: ${posture.coverage} Prozent. ${posture.coverageMessage}`}
      style={styles.coverageCard}
    >
      <View style={styles.coverageHeader}>
        <View style={styles.coverageHeading}>
          <Text style={styles.cardKicker}>Aussagekraft</Text>
          <Text style={styles.cardTitle}>{posture.coverage} % Evidenzabdeckung</Text>
        </View>
      </View>
      <Text style={styles.coverageMessage}>{posture.coverageMessage}</Text>
      <Text style={styles.coverageMeta}>Fragebogenstand: {formatDateTime(checkedAt)} · Evidenzfrische: {posture.freshnessLabel}</Text>
    </View>
  );
}

function TechnicalMetrics({ score, coverage, confidence, freshness }: { score: number; coverage: number; confidence: number; freshness: string }) {
  const metrics = [
    ["Fragebogen-Teilwert", `${score}/100`],
    ["Evidenzabdeckung", `${coverage} %`],
    ["Evidenzvertrauen", `${confidence} %`],
    ["Evidenzfrische", freshness]
  ];

  return (
    <View testID="dashboard-technical-metrics" style={styles.metrics}>
      {metrics.map(([label, value]) => (
        <View key={label} accessible accessibilityLabel={`${label}: ${value}`} style={styles.metricCard}>
          <Text style={styles.metricLabel}>{label}</Text>
          <Text style={styles.metricValue}>{value}</Text>
        </View>
      ))}
    </View>
  );
}

function NoOverallAssessment() {
  return (
    <View style={styles.stateCard}>
      <Text style={styles.stateTitle}>Noch keine übergreifende Einordnung</Text>
      <Text style={styles.stateText}>Die vorhandenen Teilprüfungen werden getrennt angezeigt. Für Ampel und Maßnahmen wird zuerst ein abgeschlossener Fragebogen benötigt.</Text>
    </View>
  );
}

function NoDataState() {
  return (
    <View style={styles.stateCard}>
      <Text style={styles.stateTitle}>Noch keine Prüfdaten vorhanden.</Text>
      <Text style={styles.stateText}>Starten Sie den Fragebogen oder WLAN-Scan.</Text>
      <View style={styles.actions}>
        <Pressable style={styles.actionButton} onPress={() => router.push("/(tabs)/check/questionnaire")}>
          <Text style={styles.actionText}>Fragebogen starten</Text>
        </Pressable>
        <Pressable style={styles.actionButtonSecondary} onPress={() => router.push("/(tabs)/check/wlan-scan")}>
          <Text style={styles.actionText}>WLAN-Scan starten</Text>
        </Pressable>
      </View>
    </View>
  );
}

function LatestDataCard({ dashboard, mode }: { dashboard: DashboardData; mode: DashboardViewMode }) {
  const items = [
    dashboard.latest.questionnaire
      ? {
          label: "Fragebogen",
          value: mode === "technical" ? `${dashboard.latest.questionnaire.score}/100 Teilwert` : "Ergebnis vorhanden",
          meta: sourceMeta(
            dashboard.latest.questionnaire.checkedAt,
            dashboard.latest.questionnaire.scoreReport?.evidence_coverage_score
          )
        }
      : null,
    dashboard.latest.wlanScan
      ? {
          label: "WLAN-Scan",
          value:
            mode === "technical"
              ? dashboard.latest.wlanScan.riskScore === null
                ? dashboard.latest.wlanScan.riskLevel ?? "gespeichert"
                : `${dashboard.latest.wlanScan.riskScore}/100 Teilwert`
              : "Ergebnis vorhanden",
          meta: sourceMeta(
            dashboard.latest.wlanScan.checkedAt,
            dashboard.latest.wlanScan.coverage?.score,
            dashboard.latest.wlanScan.coverage?.unsupported?.length
          )
        }
      : null,
    dashboard.latest.external
      ? {
          label: "Domain-Check",
          value: mode === "technical" ? `${dashboard.latest.external.score}/100 Teilwert` : "Ergebnis vorhanden",
          meta: sourceMeta(dashboard.latest.external.checkedAt, dashboard.latest.external.scoreReport?.evidence_coverage_score)
        }
      : null,
    dashboard.latest.monitoringSnapshot
      ? {
          label: "Monitoring",
          value: mode === "technical" ? `${dashboard.latest.monitoringSnapshot.score}/100 Teilwert` : "Ergebnis vorhanden",
          meta: sourceMeta(
            dashboard.latest.monitoringSnapshot.checkedAt,
            dashboard.latest.monitoringSnapshot.coverage?.score,
            dashboard.latest.monitoringSnapshot.coverage?.unsupported?.length
          )
        }
      : null
  ].filter((item): item is { label: string; value: string; meta: string } => item !== null);

  return (
    <View style={styles.latestCard}>
      <Text style={styles.latestTitle}>{mode === "technical" ? "Teilwerte nach Prüfbereich" : "Letzte Prüfungen"}</Text>
      {items.map((item) => (
        <View key={item.label} style={styles.latestRow}>
          <View>
            <Text style={styles.latestLabel}>{item.label}</Text>
            <Text style={styles.latestMeta}>{item.meta}</Text>
          </View>
          <Text style={styles.latestValue}>{item.value}</Text>
        </View>
      ))}
    </View>
  );
}

function historyPointToChartPoint(point: DashboardHistoryPoint) {
  return {
    day: formatHistoryLabel(point.checkedAt, point.type),
    score: point.score
  };
}

function formatHistoryLabel(value: string, type: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return type;
  return `${date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })} ${shortTypeLabel(type)}`;
}

function shortTypeLabel(type: string) {
  if (type === "questionnaire") return "F";
  if (type === "external") return "D";
  if (type === "monitoring") return "M";
  if (type === "wlan") return "W";
  return "S";
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Zeitpunkt unbekannt";
  return date.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function sourceMeta(checkedAt: string, coverage?: number | null, unsupportedCount = 0) {
  const coverageText = typeof coverage === "number" && Number.isFinite(coverage) ? ` · Abdeckung ${Math.round(coverage)} %` : "";
  const unsupportedText = unsupportedCount > 0 ? ` · ${unsupportedCount} plattformbedingt nicht unterstützt` : "";
  return `${formatDateTime(checkedAt)}${coverageText}${unsupportedText}`;
}

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  return "Unbekannter Fehler";
}

const styles = StyleSheet.create({
  top: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24
  },
  kicker: {
    color: colors.electric,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  title: {
    color: colors.ink,
    fontSize: 30,
    fontWeight: "900",
    marginTop: 6
  },
  settingsButton: {
    height: 48,
    width: 48,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.glassStrong,
    borderColor: colors.border,
    borderWidth: 1
  },
  viewSwitch: {
    backgroundColor: colors.glass,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    marginBottom: 18,
    padding: 4
  },
  viewOption: {
    alignItems: "center",
    borderRadius: 6,
    flex: 1,
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  viewOptionSelected: {
    backgroundColor: colors.electric
  },
  viewOptionText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "900"
  },
  viewOptionTextSelected: {
    color: colors.ink
  },
  coverageCard: {
    backgroundColor: colors.glass,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 18,
    padding: 16
  },
  coverageHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "space-between"
  },
  coverageHeading: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 180
  },
  cardKicker: {
    color: colors.electric,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  cardTitle: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: "900",
    marginTop: 5
  },
  coverageMessage: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 14
  },
  coverageMeta: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 10
  },
  metrics: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 18
  },
  metricCard: {
    backgroundColor: colors.glass,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: "47%",
    flexGrow: 1,
    minHeight: 86,
    padding: 14
  },
  metricLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17
  },
  metricValue: {
    color: colors.ink,
    fontSize: 19,
    fontWeight: "900",
    lineHeight: 25,
    marginTop: 7
  },
  scoreWrap: {
    alignItems: "center",
    marginBottom: 26
  },
  previewNotice: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 10,
    maxWidth: 280,
    textAlign: "center"
  },
  stateCard: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 18,
    padding: 18
  },
  stateTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "900",
    marginTop: 8,
    textAlign: "center"
  },
  stateText: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
    textAlign: "center"
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "center",
    marginTop: 16
  },
  actionButton: {
    backgroundColor: colors.electric,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  actionButtonSecondary: {
    backgroundColor: colors.glassStrong,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  actionText: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "900"
  },
  latestCard: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 18,
    padding: 16
  },
  latestTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 6
  },
  latestRow: {
    alignItems: "center",
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 54,
    paddingVertical: 10
  },
  latestLabel: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "800"
  },
  latestMeta: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 3
  },
  latestValue: {
    color: colors.electric,
    fontSize: 16,
    fontWeight: "900"
  },
});
