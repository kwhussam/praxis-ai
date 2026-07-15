import { BellRing } from "lucide-react-native";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { ScoreHistory } from "@/components/charts/ScoreHistory";
import { EvidenceCoveragePanel } from "@/components/modules/EvidenceCoveragePanel";
import { PracticeGuidanceCard } from "@/components/modules/PracticeGuidanceCard";
import { ScoreRing } from "@/components/ui/ScoreRing";
import { Screen } from "@/components/ui/Screen";
import { colors } from "@/constants/colors";
import { PLANS } from "@/lib/billing/plans";
import { loadDashboardData } from "@/lib/dashboard/service";
import type { DashboardData, DashboardHistoryPoint } from "@/lib/dashboard/types";
import { guidanceFromScoreReport } from "@/lib/security/practiceGuidance";
import { useSessionStore } from "@/lib/store/session";

export default function DashboardScreen() {
  const practice = useSessionStore((state) => state.practice);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const plan = PLANS[practice?.plan ?? "free"];
  const scoreReport = dashboard?.latest.questionnaire?.scoreReport ?? null;
  const guidance = scoreReport ? guidanceFromScoreReport(scoreReport) : null;
  const primaryScore = dashboard ? primaryScoreFromDashboard(dashboard) : null;
  const historyData = useMemo(() => (dashboard ? dashboard.history.map(historyPointToChartPoint) : []), [dashboard]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!practice?.id) {
        setDashboard(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setLoadError(null);

      try {
        const nextDashboard = await loadDashboardData(practice.id);
        if (!cancelled) setDashboard(nextDashboard);
      } catch (error) {
        console.error("dashboard_load_failed", error);
        if (!cancelled) {
          setDashboard(null);
          setLoadError(errorMessage(error));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [practice?.id]);

  return (
    <Screen>
      <View style={styles.top}>
        <View>
          <Text style={styles.kicker}>Praxis-Sicherheitsüberblick</Text>
          <Text style={styles.title}>{practice?.name ?? "Praxis"}</Text>
        </View>
        <View style={styles.alertIcon}>
          <BellRing color={colors.warning} size={22} />
        </View>
      </View>
      {loading ? (
        <View style={styles.stateCard}>
          <ActivityIndicator color={colors.electric} />
          <Text style={styles.stateTitle}>Dashboard wird geladen</Text>
          <Text style={styles.stateText}>Echte Prüfdaten werden autorisiert über den Worker abgefragt.</Text>
        </View>
      ) : loadError ? (
        <View style={styles.stateCard}>
          <Text style={styles.stateTitle}>Dashboard konnte nicht geladen werden</Text>
          <Text style={styles.stateText}>{loadError}</Text>
        </View>
      ) : dashboard && !dashboard.hasData ? (
        <NoDataState />
      ) : dashboard && primaryScore ? (
        <>
          {guidance ? <PracticeGuidanceCard guidance={guidance} /> : null}
          <View style={styles.scoreWrap}>
            <ScoreRing score={primaryScore.score} label={primaryScore.label} />
            <Text style={styles.previewNotice}>{primaryScore.description}</Text>
          </View>
          {scoreReport ? <EvidenceCoveragePanel report={scoreReport} /> : null}
          <LatestDataCard dashboard={dashboard} />
        </>
      ) : dashboard ? (
        <LatestDataCard dashboard={dashboard} />
      ) : null}
      <View style={styles.planCard}>
        <Text style={styles.planKicker}>Aktueller Tarif</Text>
        <View style={styles.planHeader}>
          <Text style={styles.planName}>{plan.name}</Text>
          <Text style={styles.planPrice}>
            {plan.price === 0 ? "0 EUR" : `${plan.price} EUR`}
            {plan.billing ? ` / ${plan.billing}` : ""}
          </Text>
        </View>
        {plan.features.slice(0, 4).map((feature) => (
          <Text key={feature} style={styles.planFeature}>
            {feature}
          </Text>
        ))}
      </View>
      {dashboard?.hasData ? <ScoreHistory data={historyData} /> : null}
    </Screen>
  );
}

function NoDataState() {
  return (
    <View style={styles.stateCard}>
      <Text style={styles.stateTitle}>Noch keine echten Prüfdaten vorhanden.</Text>
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

function LatestDataCard({ dashboard }: { dashboard: DashboardData }) {
  const items = [
    dashboard.latest.questionnaire
      ? {
          label: "Fragebogen",
          value: `${dashboard.latest.questionnaire.score}/100`,
          meta: formatDateTime(dashboard.latest.questionnaire.checkedAt)
        }
      : null,
    dashboard.latest.wlanScan
      ? {
          label: "WLAN-Scan",
          value: dashboard.latest.wlanScan.riskScore === null ? dashboard.latest.wlanScan.riskLevel ?? "gespeichert" : `${dashboard.latest.wlanScan.riskScore}/100`,
          meta: formatDateTime(dashboard.latest.wlanScan.checkedAt)
        }
      : null,
    dashboard.latest.external
      ? {
          label: "Domain-Check",
          value: `${dashboard.latest.external.score}/100`,
          meta: formatDateTime(dashboard.latest.external.checkedAt)
        }
      : null,
    dashboard.latest.monitoringSnapshot
      ? {
          label: "Monitoring",
          value: `${dashboard.latest.monitoringSnapshot.score}/100`,
          meta: formatDateTime(dashboard.latest.monitoringSnapshot.checkedAt)
        }
      : null
  ].filter((item): item is { label: string; value: string; meta: string } => item !== null);

  return (
    <View style={styles.latestCard}>
      <Text style={styles.latestTitle}>Letzte echte Prüfdaten</Text>
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

function primaryScoreFromDashboard(dashboard: DashboardData) {
  const candidates = [
    dashboard.latest.questionnaire
      ? {
          score: dashboard.latest.questionnaire.score,
          checkedAt: dashboard.latest.questionnaire.checkedAt,
          label: "Echter Fragebogen-Score",
          description: `Aus dem neuesten gespeicherten Fragebogen vom ${formatDateTime(dashboard.latest.questionnaire.checkedAt)}.`
        }
      : null,
    dashboard.latest.external
      ? {
          score: dashboard.latest.external.score,
          checkedAt: dashboard.latest.external.checkedAt,
          label: "Echter Domain-Check",
          description: `Aus dem neuesten gespeicherten Domain-Check vom ${formatDateTime(dashboard.latest.external.checkedAt)}.`
        }
      : null,
    dashboard.latest.monitoringSnapshot
      ? {
          score: dashboard.latest.monitoringSnapshot.score,
          checkedAt: dashboard.latest.monitoringSnapshot.checkedAt,
          label: "Echter Monitoring-Score",
          description: `Aus dem neuesten Monitoring-Snapshot vom ${formatDateTime(dashboard.latest.monitoringSnapshot.checkedAt)}.`
        }
      : null,
    dashboard.latest.wlanScan && dashboard.latest.wlanScan.riskScore !== null
      ? {
          score: dashboard.latest.wlanScan.riskScore,
          checkedAt: dashboard.latest.wlanScan.checkedAt,
          label: "Echter WLAN-Scan",
          description: `Aus dem neuesten gespeicherten WLAN-Scan vom ${formatDateTime(dashboard.latest.wlanScan.checkedAt)}.`
        }
      : null
  ].filter((item): item is { score: number; checkedAt: string; label: string; description: string } => item !== null);

  return candidates.sort((left, right) => new Date(right.checkedAt).getTime() - new Date(left.checkedAt).getTime())[0] ?? null;
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
  alertIcon: {
    height: 48,
    width: 48,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,165,2,0.13)",
    borderColor: colors.border,
    borderWidth: 1
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
  planCard: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 18,
    padding: 16
  },
  planKicker: {
    color: colors.electric,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  planHeader: {
    alignItems: "baseline",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
    marginTop: 8
  },
  planName: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: "900"
  },
  planPrice: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "800"
  },
  planFeature: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8
  }
});
