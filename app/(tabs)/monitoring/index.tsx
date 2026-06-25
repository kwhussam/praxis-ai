import { router } from "expo-router";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Download,
  MailCheck,
  Play,
  Server,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  XCircle
} from "lucide-react-native";
import { MotiView } from "moti";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { BarChart } from "@/components/charts/BarChart";
import { ScoreHistory } from "@/components/charts/ScoreHistory";
import { AnimatedButton } from "@/components/ui/AnimatedButton";
import { AmpelBadge } from "@/components/ui/AmpelBadge";
import { GlassCard } from "@/components/ui/GlassCard";
import { ScoreRing } from "@/components/ui/ScoreRing";
import { Screen } from "@/components/ui/Screen";
import { colors, riskColors, type RiskTone } from "@/constants/colors";
import {
  buildDemoDashboard,
  loadMonitoringDashboard,
  startManualMonitoringScan,
  subscribeToMonitoringRealtime
} from "@/lib/monitoring/service";
import { notifyCriticalMonitoringEvent } from "@/lib/monitoring/notifications";
import {
  categoryLabels,
  colorForScore,
  MONITORING_SCHEDULE,
  toneForScore,
  type DashboardData,
  type MonitoringEvent,
  type MonitoringSeverity,
  type MonitoringSnapshot
} from "@/lib/monitoring/types";
import { useSessionStore } from "@/lib/store/session";

type AlertFilter = "all" | MonitoringSeverity;

export default function MonitoringScreen() {
  const practice = useSessionStore((state) => state.practice);
  const practiceId = practice?.id ?? "demo-practice";
  const [dashboard, setDashboard] = useState<DashboardData>(() => buildDemoDashboard(practiceId));
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState<AlertFilter>("all");

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    loadMonitoringDashboard(practiceId)
      .then((data) => {
        if (mounted) setDashboard(data);
      })
      .catch(() => {
        if (mounted) setDashboard(buildDemoDashboard(practiceId));
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [practiceId]);

  useEffect(() => {
    return subscribeToMonitoringRealtime(practiceId, {
      onEvent: (event) => {
        setDashboard((current) => ({
          ...current,
          events: [event, ...current.events.filter((item) => item.id !== event.id)].slice(0, 40)
        }));
        void notifyCriticalMonitoringEvent(event);
      },
      onSnapshot: (snapshot) => {
        setDashboard((current) => ({
          ...current,
          snapshot,
          history: [...current.history, { day: formatHistoryDay(snapshot.checked_at), score: snapshot.score }].slice(-90)
        }));
      }
    });
  }, [practiceId]);

  const snapshot = dashboard.snapshot;
  const tone = toneForScore(snapshot.score);
  const statusLabel = tone === "critical" ? "Kritisch" : tone === "warning" ? "Beobachten" : "Stabil";
  const criticalCount = dashboard.events.filter((event) => event.severity === "critical" && !event.resolved_at).length;

  const categoryData = useMemo(
    () =>
      Object.entries(categoryLabels).map(([key, label]) => {
        const value = snapshot.category_scores[key] ?? 0;
        return {
          label,
          value,
          color: colorForScore(value)
        };
      }),
    [snapshot.category_scores]
  );

  const filteredEvents = useMemo(
    () => dashboard.events.filter((event) => filter === "all" || event.severity === filter),
    [dashboard.events, filter]
  );

  async function handleManualScan() {
    if (!practice) return;

    setScanning(true);
    setNotice(null);

    try {
      const result = await startManualMonitoringScan(practice);
      setDashboard((current) => ({
        snapshot: result.snapshot,
        events: [...result.events, ...current.events].slice(0, 40),
        history: [...current.history, { day: formatHistoryDay(result.snapshot.checked_at), score: result.snapshot.score }].slice(-90)
      }));
      setNotice("Manueller Scan abgeschlossen.");
    } catch {
      setNotice("Scan konnte nicht gestartet werden. Demo-Daten bleiben aktiv.");
    } finally {
      setScanning(false);
    }
  }

  return (
    <Screen>
      <View style={styles.header}>
        <View>
          <Text style={styles.live}>Realtime Monitoring</Text>
          <Text style={styles.title}>{practice?.name ?? "Praxis"} Security</Text>
          <Text style={styles.copy}>SSL, DNS, Ports, Leaks und Domain-Reputation laufen als Hintergrundchecks.</Text>
        </View>
        <MotiView
          from={{ opacity: 0.7, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ loop: true, type: "timing", duration: 1300 }}
          style={[styles.liveIcon, { borderColor: riskColors[tone] }]}
        >
          <Activity color={riskColors[tone]} size={22} />
        </MotiView>
      </View>

      <GlassCard style={styles.hero}>
        <View style={styles.heroTop}>
          <View>
            <Text style={styles.cardKicker}>Security Score</Text>
            <AmpelBadge tone={tone} label={statusLabel} pulsing={tone === "critical"} />
          </View>
          {loading ? <ActivityIndicator color={colors.electric} /> : <Text style={styles.sync}>Live</Text>}
        </View>
        <View style={styles.scoreArea}>
          <ScoreRing score={snapshot.score} size={214} stroke={18} />
        </View>
        <View style={styles.heroStats}>
          <Metric label="Kritische Alerts" value={`${criticalCount}`} tone={criticalCount > 0 ? "critical" : "safe"} />
          <Metric label="Letzter Lauf" value={relativeTime(snapshot.checked_at)} tone="info" />
        </View>
      </GlassCard>

      <View style={styles.actions}>
        <AnimatedButton
          label={scanning ? "Scan läuft" : "Scan starten"}
          icon={scanning ? <ActivityIndicator color={colors.ink} /> : <Play color={colors.ink} size={18} />}
          onPress={handleManualScan}
          style={styles.actionButton}
        />
        <AnimatedButton
          label="Bericht exportieren"
          icon={<Download color={colors.ink} size={18} />}
          onPress={() => router.push("/(tabs)/report")}
          variant="ghost"
          style={styles.actionButton}
        />
      </View>
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}

      <LiveFeed events={dashboard.events.slice(0, 5)} />
      <BarChart title="Kategorie-Scores" data={categoryData} />

      <View style={styles.detailGrid}>
        <SslCountdown snapshot={snapshot} />
        <EmailSecurity status={snapshot.email_security} />
        <DeviceStatus snapshot={snapshot} />
      </View>

      <ScoreHistory data={dashboard.history} />
      <AlertHistory events={filteredEvents} activeFilter={filter} onFilterChange={setFilter} />
      <ScheduleCard />
    </Screen>
  );
}

function LiveFeed({ events }: { events: MonitoringEvent[] }) {
  return (
    <GlassCard style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Live-Feed</Text>
        <Text style={styles.sectionMeta}>Supabase Realtime</Text>
      </View>
      <View style={styles.feed}>
        {events.map((event) => (
          <EventRow key={event.id} event={event} compact />
        ))}
      </View>
    </GlassCard>
  );
}

function SslCountdown({ snapshot }: { snapshot: MonitoringSnapshot }) {
  const days = snapshot.ssl.days_remaining;
  const progress = days === null ? 0 : Math.max(0, Math.min(100, (days / 90) * 100));
  const tone = days === null || days > 30 ? "safe" : days > 14 ? "warning" : "critical";

  return (
    <GlassCard style={styles.detailCard}>
      <View style={styles.iconBubble}>
        <Clock3 color={riskColors[tone]} size={20} />
      </View>
      <Text style={styles.detailTitle}>SSL-Countdown</Text>
      <Text style={styles.bigMetric}>{days === null ? "Unbekannt" : `${days} Tage`}</Text>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${Math.max(4, progress)}%`, backgroundColor: riskColors[tone] }]} />
      </View>
      <Text style={styles.detailCopy}>{snapshot.ssl.grade ? `Grade ${snapshot.ssl.grade}` : "Zertifikat wird automatisch überwacht."}</Text>
    </GlassCard>
  );
}

function EmailSecurity({ status }: { status: MonitoringSnapshot["email_security"] }) {
  return (
    <GlassCard style={styles.detailCard}>
      <View style={styles.iconBubble}>
        <MailCheck color={colors.electric} size={20} />
      </View>
      <Text style={styles.detailTitle}>E-Mail-Security</Text>
      <View style={styles.mailRows}>
        <MailStatus label="SPF" ok={status.spf} />
        <MailStatus label="DKIM" ok={status.dkim} />
        <MailStatus label="DMARC" ok={status.dmarc} />
      </View>
    </GlassCard>
  );
}

function DeviceStatus({ snapshot }: { snapshot: MonitoringSnapshot }) {
  const total = snapshot.devices.known + snapshot.devices.unknown;
  const unknownPercent = total === 0 ? 0 : Math.round((snapshot.devices.unknown / total) * 100);

  return (
    <GlassCard style={styles.detailCard}>
      <View style={styles.iconBubble}>
        <Smartphone color={unknownPercent > 10 ? colors.warning : colors.safe} size={20} />
      </View>
      <Text style={styles.detailTitle}>Geräte</Text>
      <View style={styles.deviceSplit}>
        <Metric label="Bekannt" value={`${snapshot.devices.known}`} tone="safe" />
        <Metric label="Unbekannt" value={`${snapshot.devices.unknown}`} tone={snapshot.devices.unknown > 0 ? "warning" : "safe"} />
      </View>
      <Text style={styles.detailCopy}>{unknownPercent}% unbekannte Geräte im letzten Scan.</Text>
    </GlassCard>
  );
}

function AlertHistory({
  events,
  activeFilter,
  onFilterChange
}: {
  events: MonitoringEvent[];
  activeFilter: AlertFilter;
  onFilterChange: (filter: AlertFilter) => void;
}) {
  const filters: Array<{ label: string; value: AlertFilter }> = [
    { label: "Alle", value: "all" },
    { label: "Kritisch", value: "critical" },
    { label: "Warnung", value: "warning" },
    { label: "Info", value: "info" }
  ];

  return (
    <GlassCard style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Alert-History</Text>
        <Text style={styles.sectionMeta}>{events.length} Treffer</Text>
      </View>
      <View style={styles.filters}>
        {filters.map((item) => (
          <Pressable key={item.value} onPress={() => onFilterChange(item.value)}>
            <View style={[styles.filterChip, activeFilter === item.value ? styles.filterChipActive : null]}>
              <Text style={[styles.filterText, activeFilter === item.value ? styles.filterTextActive : null]}>{item.label}</Text>
            </View>
          </Pressable>
        ))}
      </View>
      <View style={styles.feed}>
        {events.length === 0 ? <Text style={styles.empty}>Keine Alerts in diesem Filter.</Text> : null}
        {events.map((event) => (
          <EventRow key={event.id} event={event} />
        ))}
      </View>
    </GlassCard>
  );
}

function ScheduleCard() {
  return (
    <GlassCard style={styles.section}>
      <Text style={styles.sectionTitle}>Monitoring-Takt</Text>
      <View style={styles.scheduleRows}>
        {Object.entries(MONITORING_SCHEDULE).map(([key, cron]) => (
          <View key={key} style={styles.scheduleRow}>
            <Server color={colors.muted} size={16} />
            <Text style={styles.scheduleLabel}>{key.replace("_", " ")}</Text>
            <Text style={styles.scheduleCron}>{cron}</Text>
          </View>
        ))}
      </View>
    </GlassCard>
  );
}

function EventRow({ event, compact = false }: { event: MonitoringEvent; compact?: boolean }) {
  const color = riskColors[event.severity === "critical" ? "critical" : event.severity === "warning" ? "warning" : "info"];
  const Icon = event.severity === "critical" ? ShieldAlert : event.severity === "warning" ? AlertTriangle : ShieldCheck;

  return (
    <View style={styles.eventRow}>
      <View style={[styles.eventIcon, { backgroundColor: `${color}20` }]}>
        <Icon color={color} size={18} />
      </View>
      <View style={styles.eventBody}>
        <Text style={styles.eventTitle}>{event.title}</Text>
        {!compact ? <Text style={styles.eventMessage}>{event.message}</Text> : null}
        <Text style={styles.eventTime}>{relativeTime(event.created_at)}</Text>
      </View>
    </View>
  );
}

function MailStatus({ label, ok }: { label: string; ok: boolean }) {
  return (
    <View style={styles.mailStatus}>
      {ok ? <CheckCircle2 color={colors.safe} size={20} /> : <XCircle color={colors.critical} size={20} />}
      <Text style={styles.mailLabel}>{label}</Text>
    </View>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone: RiskTone }) {
  return (
    <View style={styles.metricBox}>
      <Text style={[styles.metricValue, { color: riskColors[tone] }]}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function relativeTime(value: string) {
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.round(diff / 60_000));

  if (minutes < 1) return "gerade eben";
  if (minutes < 60) return `vor ${minutes} Min.`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `vor ${hours} Std.`;

  return new Date(value).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
}

function formatHistoryDay(value: string) {
  return new Date(value).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 14,
    marginBottom: 18
  },
  live: {
    color: colors.safe,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  title: {
    color: colors.ink,
    fontSize: 34,
    fontWeight: "900",
    marginTop: 8
  },
  copy: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
    maxWidth: 300
  },
  liveIcon: {
    height: 48,
    width: 48,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.glass
  },
  hero: {
    marginBottom: 16
  },
  heroTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start"
  },
  cardKicker: {
    color: colors.electric,
    fontSize: 12,
    fontWeight: "900",
    marginBottom: 10,
    textTransform: "uppercase"
  },
  sync: {
    color: colors.safe,
    fontSize: 13,
    fontWeight: "900"
  },
  scoreArea: {
    alignItems: "center",
    marginVertical: 8
  },
  heroStats: {
    flexDirection: "row",
    gap: 12
  },
  actions: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 8
  },
  actionButton: {
    flex: 1
  },
  notice: {
    color: colors.warning,
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 14
  },
  section: {
    marginBottom: 16
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "900"
  },
  sectionMeta: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800"
  },
  feed: {
    gap: 12
  },
  eventRow: {
    flexDirection: "row",
    gap: 12
  },
  eventIcon: {
    height: 38,
    width: 38,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center"
  },
  eventBody: {
    flex: 1
  },
  eventTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "800"
  },
  eventMessage: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 3
  },
  eventTime: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4
  },
  detailGrid: {
    gap: 14,
    marginBottom: 16
  },
  detailCard: {
    marginBottom: 0
  },
  iconBubble: {
    height: 42,
    width: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.glassStrong,
    marginBottom: 14
  },
  detailTitle: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: "900",
    marginBottom: 8
  },
  bigMetric: {
    color: colors.ink,
    fontSize: 34,
    fontWeight: "900"
  },
  progressTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.1)",
    overflow: "hidden",
    marginTop: 12
  },
  progressFill: {
    height: "100%",
    borderRadius: 999
  },
  detailCopy: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 10
  },
  mailRows: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap"
  },
  mailStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: colors.glassStrong
  },
  mailLabel: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "900"
  },
  deviceSplit: {
    flexDirection: "row",
    gap: 10
  },
  metricBox: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 13,
    backgroundColor: "rgba(255,255,255,0.06)"
  },
  metricValue: {
    fontSize: 24,
    fontWeight: "900"
  },
  metricLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 3
  },
  filters: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 14
  },
  filterChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  filterChipActive: {
    backgroundColor: colors.electric,
    borderColor: colors.electric
  },
  filterText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "900"
  },
  filterTextActive: {
    color: colors.ink
  },
  empty: {
    color: colors.muted,
    fontSize: 14
  },
  scheduleRows: {
    gap: 10,
    marginTop: 14
  },
  scheduleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  scheduleLabel: {
    flex: 1,
    color: colors.ink,
    fontSize: 14,
    fontWeight: "800",
    textTransform: "capitalize"
  },
  scheduleCron: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800"
  }
});
