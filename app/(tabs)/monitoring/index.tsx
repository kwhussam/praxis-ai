import { router } from "expo-router";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Download,
  MailCheck,
  Play,
  Plus,
  Server,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  XCircle
} from "lucide-react-native";
import { MotiView } from "moti";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { BarChart } from "@/components/charts/BarChart";
import { ScoreHistory } from "@/components/charts/ScoreHistory";
import { PracticeGuidanceCard } from "@/components/modules/PracticeGuidanceCard";
import { AnimatedButton } from "@/components/ui/AnimatedButton";
import { AmpelBadge } from "@/components/ui/AmpelBadge";
import { GlassCard } from "@/components/ui/GlassCard";
import { ScoreRing } from "@/components/ui/ScoreRing";
import { Screen } from "@/components/ui/Screen";
import { colors, riskColors, type RiskTone } from "@/constants/colors";
import { AppConfig } from "@/lib/config/environment";
import {
  buildEmptyDashboard,
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
  type MonitoringSnapshot,
  type MonitoringTargets,
  type RiskHistoryState
} from "@/lib/monitoring/types";
import type { InventoryItemType } from "@/lib/inventory/types";
import { guidanceFromMonitoring } from "@/lib/security/practiceGuidance";
import { useInventoryStore } from "@/lib/store/inventory";
import { useSessionStore } from "@/lib/store/session";

type AlertFilter = "all" | MonitoringSeverity;

export default function MonitoringScreen() {
  const practice = useSessionStore((state) => state.practice);
  const practiceId = practice?.id ?? "";
  const ensurePracticeInventory = useInventoryStore((state) => state.ensurePracticeInventory);
  const inventoryItems = useInventoryStore((state) => state.getItems(practiceId));
  const addInventoryItem = useInventoryStore((state) => state.addItem);
  const removeInventoryItem = useInventoryStore((state) => state.removeItem);
  const [dashboard, setDashboard] = useState<DashboardData>(() =>
    AppConfig.isDemoMode && practiceId.startsWith("demo-") ? buildDemoDashboard(practiceId) : buildEmptyDashboard(practiceId)
  );
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState<AlertFilter>("all");
  const [domainDraft, setDomainDraft] = useState("");
  const [subdomainDraft, setSubdomainDraft] = useState("");
  const [emailDraft, setEmailDraft] = useState("");
  const [leakConsentAccepted, setLeakConsentAccepted] = useState(false);

  useEffect(() => {
    ensurePracticeInventory(practice);
  }, [ensurePracticeInventory, practice]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    loadMonitoringDashboard(practiceId)
      .then((data) => {
        if (mounted) setDashboard(data);
      })
      .catch((loadError) => {
        if (mounted) {
          setNotice(loadError instanceof Error ? loadError.message : "Monitoring-Daten konnten nicht geladen werden.");
          setDashboard(buildEmptyDashboard(practiceId));
        }
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
  const monitoringTargets = useMemo<MonitoringTargets>(() => {
    const domains = uniqueStrings([
      practice?.domain,
      ...inventoryItems.filter((item) => item.type === "domain").map((item) => item.name)
    ].filter((value): value is string => Boolean(value)).map(normalizeDomainInput));
    const subdomains = uniqueStrings(
      inventoryItems.filter((item) => item.type === "subdomain").map((item) => normalizeDomainInput(item.name))
    );
    const emails = uniqueStrings([
      practice?.email,
      ...inventoryItems.filter((item) => item.type === "email").map((item) => item.name)
    ].filter((value): value is string => Boolean(value)).map((value) => value.trim().toLowerCase()));

    return {
      domains,
      subdomains,
      emails,
      leakConsentAccepted
    };
  }, [inventoryItems, leakConsentAccepted, practice?.domain, practice?.email]);

  async function handleManualScan() {
    if (!practice) return;

    setScanning(true);
    setNotice(null);

    try {
      const result = await startManualMonitoringScan(practice, monitoringTargets);
      setDashboard((current) => ({
        snapshot: result.snapshot,
        events: [...result.events, ...current.events].slice(0, 40),
        history: [...current.history, { day: formatHistoryDay(result.snapshot.checked_at), score: result.snapshot.score }].slice(-90)
      }));
      setNotice("Manueller Scan abgeschlossen.");
    } catch {
      setNotice("Scan konnte nicht gestartet werden. Bitte prüfen Sie Verbindung und Berechtigungen.");
    } finally {
      setScanning(false);
    }
  }

  function handleAddTarget(type: InventoryItemType, rawValue: string, clear: (value: string) => void) {
    if (!practice) return;
    const value = type === "email" ? rawValue.trim().toLowerCase() : normalizeDomainInput(rawValue);
    if (!value) {
      Alert.alert("Monitoring-Ziel", "Bitte einen gültigen Wert eintragen.");
      return;
    }
    addInventoryItem(practice.id, {
      type,
      name: value,
      detail: type === "email" ? "Für Leak-Prüfung freigegebene Adresse" : "Externes Monitoring-Ziel",
      criticality: type === "domain" ? "high" : "medium"
    });
    clear("");
  }

  return (
    <Screen>
      <View style={styles.header}>
        <View>
          <Text style={styles.live}>Laufende Überwachung</Text>
          <Text style={styles.title}>{practice?.name ?? "Praxis"} Sicherheit</Text>
          <Text style={styles.copy}>Die wichtigsten Online-Zugänge werden regelmäßig im Hintergrund geprüft.</Text>
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
            <Text style={styles.cardKicker}>Praxiszustand</Text>
            <AmpelBadge tone={tone} label={statusLabel} pulsing={tone === "critical"} />
          </View>
          {loading ? <ActivityIndicator color={colors.electric} /> : <Text style={styles.sync}>Live</Text>}
        </View>
        <View style={styles.scoreArea}>
          <ScoreRing score={snapshot.score} size={214} stroke={18} label="Sicherheitswert" />
        </View>
        <View style={styles.heroStats}>
          <Metric label="Kritische Alerts" value={`${criticalCount}`} tone={criticalCount > 0 ? "critical" : "safe"} />
          <Metric label="Letzter Lauf" value={relativeTime(snapshot.checked_at)} tone="info" />
        </View>
      </GlassCard>
      <PracticeGuidanceCard guidance={guidanceFromMonitoring(snapshot.score, criticalCount)} />

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

      <MonitoringTargetCard
        targets={monitoringTargets}
        domainDraft={domainDraft}
        subdomainDraft={subdomainDraft}
        emailDraft={emailDraft}
        leakConsentAccepted={leakConsentAccepted}
        onDomainDraftChange={setDomainDraft}
        onSubdomainDraftChange={setSubdomainDraft}
        onEmailDraftChange={setEmailDraft}
        onAddDomain={() => handleAddTarget("domain", domainDraft, setDomainDraft)}
        onAddSubdomain={() => handleAddTarget("subdomain", subdomainDraft, setSubdomainDraft)}
        onAddEmail={() => handleAddTarget("email", emailDraft, setEmailDraft)}
        onToggleLeakConsent={() => setLeakConsentAccepted((current) => !current)}
        onRemoveTarget={(value) => {
          if (!practice) return;
          const item = inventoryItems.find((candidate) => candidate.name === value && (candidate.type === "domain" || candidate.type === "subdomain" || candidate.type === "email"));
          if (item) removeInventoryItem(practice.id, item.id);
        }}
      />

      <LiveFeed events={dashboard.events.slice(0, 5)} />
      <BarChart title="Kategorie-Überblick" data={categoryData} />

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

function MonitoringTargetCard({
  targets,
  domainDraft,
  subdomainDraft,
  emailDraft,
  leakConsentAccepted,
  onDomainDraftChange,
  onSubdomainDraftChange,
  onEmailDraftChange,
  onAddDomain,
  onAddSubdomain,
  onAddEmail,
  onToggleLeakConsent,
  onRemoveTarget
}: {
  targets: MonitoringTargets;
  domainDraft: string;
  subdomainDraft: string;
  emailDraft: string;
  leakConsentAccepted: boolean;
  onDomainDraftChange: (value: string) => void;
  onSubdomainDraftChange: (value: string) => void;
  onEmailDraftChange: (value: string) => void;
  onAddDomain: () => void;
  onAddSubdomain: () => void;
  onAddEmail: () => void;
  onToggleLeakConsent: () => void;
  onRemoveTarget: (value: string) => void;
}) {
  return (
    <GlassCard style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Prüfziele</Text>
        <Text style={styles.sectionMeta}>{targets.domains.length + targets.subdomains.length + targets.emails.length} Ziele</Text>
      </View>
      <Text style={styles.detailCopy}>
        Praxisadressen und Unterseiten werden von außen auf erreichbare Dienste, Verschlüsselung und Warnzeichen geprüft. E-Mail-Adressen werden nur nach separater Einwilligung für Datenleck-Hinweise verwendet.
      </Text>

      <TargetInput label="Praxisadresse" value={domainDraft} placeholder="praxis.de" onChangeText={onDomainDraftChange} onAdd={onAddDomain} />
      <TargetInput label="Unteradresse" value={subdomainDraft} placeholder="vpn.praxis.de" onChangeText={onSubdomainDraftChange} onAdd={onAddSubdomain} />
      <TargetInput label="E-Mail" value={emailDraft} placeholder="kontakt@praxis.de" onChangeText={onEmailDraftChange} onAdd={onAddEmail} keyboardType="email-address" />

      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: leakConsentAccepted }}
        accessibilityLabel="Einwilligung zur Datenleck-Prüfung der E-Mail-Adressen"
        style={styles.consentRow}
        onPress={onToggleLeakConsent}
      >
        <View style={[styles.checkbox, leakConsentAccepted ? styles.checkboxActive : null]}>
          {leakConsentAccepted ? <CheckCircle2 color={colors.ink} size={14} /> : null}
        </View>
        <Text style={styles.consentText}>
          Ich bin berechtigt, die freigegebenen Praxis-E-Mail-Adressen für Datenleck-Prüfungen zu verwenden. Es werden nur Treffer-Metadaten verarbeitet.
        </Text>
      </Pressable>

      <TargetList title="Praxisadressen" items={targets.domains} onRemove={onRemoveTarget} />
      <TargetList title="Unteradressen" items={targets.subdomains} onRemove={onRemoveTarget} />
      <TargetList title="E-Mail-Adressen" items={targets.emails} onRemove={onRemoveTarget} disabled={!leakConsentAccepted} />
    </GlassCard>
  );
}

function TargetInput({
  label,
  value,
  placeholder,
  keyboardType,
  onChangeText,
  onAdd
}: {
  label: string;
  value: string;
  placeholder: string;
  keyboardType?: "email-address";
  onChangeText: (value: string) => void;
  onAdd: () => void;
}) {
  return (
    <View style={styles.targetInputRow}>
      <View style={styles.targetInputBody}>
        <Text style={styles.targetLabel}>{label}</Text>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          keyboardType={keyboardType}
          autoCapitalize="none"
          style={styles.input}
        />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label} hinzufügen`}
        style={styles.iconButton}
        onPress={onAdd}
      >
        <Plus color={colors.ink} size={16} />
      </Pressable>
    </View>
  );
}

function TargetList({ title, items, disabled, onRemove }: { title: string; items: string[]; disabled?: boolean; onRemove: (value: string) => void }) {
  if (items.length === 0) return null;

  return (
    <View style={styles.targetList}>
      <Text style={styles.targetLabel}>{title}</Text>
      <View style={styles.targetChips}>
        {items.map((item) => (
          <Pressable
            key={item}
            accessibilityRole="button"
            accessibilityLabel={`${item} entfernen`}
            style={[styles.targetChip, disabled ? styles.targetChipDisabled : null]}
            onPress={() => onRemove(item)}
          >
            <Text style={styles.targetChipText}>{item}</Text>
          </Pressable>
        ))}
      </View>
      {disabled ? <Text style={styles.privacyHint}>Leak-Prüfung für E-Mail-Adressen ist bis zur Einwilligung deaktiviert.</Text> : null}
    </View>
  );
}

function LiveFeed({ events }: { events: MonitoringEvent[] }) {
  return (
    <GlassCard style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Aktuelle Warnungen</Text>
        <Text style={styles.sectionMeta}>Automatisch geprüft</Text>
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
      <Text style={styles.detailTitle}>Zertifikat läuft ab</Text>
      <Text style={styles.bigMetric}>{days === null ? "Unbekannt" : `${days} Tage`}</Text>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${Math.max(4, progress)}%`, backgroundColor: riskColors[tone] }]} />
      </View>
        <Text style={styles.detailCopy}>{snapshot.ssl.grade ? "Verschlüsselung wirkt aktuell stabil." : "Zertifikat wird automatisch überwacht."}</Text>
    </GlassCard>
  );
}

function EmailSecurity({ status }: { status: MonitoringSnapshot["email_security"] }) {
  return (
    <GlassCard style={styles.detailCard}>
      <View style={styles.iconBubble}>
        <MailCheck color={colors.electric} size={20} />
      </View>
      <Text style={styles.detailTitle}>Schutz vor gefälschten E-Mails</Text>
      <View style={styles.mailRows}>
        <MailStatus label="Absender passt" ok={status.spf} />
        <MailStatus label="Signatur aktiv" ok={status.dkim} />
        <MailStatus label="Fälschungen blockieren" ok={status.dmarc} />
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
        <Text style={styles.sectionTitle}>Warnungsverlauf</Text>
        <Text style={styles.sectionMeta}>{events.length} Treffer</Text>
      </View>
      <View style={styles.filters}>
        {filters.map((item) => (
          <Pressable
            key={item.value}
            accessibilityRole="button"
            accessibilityState={{ selected: activeFilter === item.value }}
            accessibilityLabel={`Filter: ${item.label}`}
            onPress={() => onFilterChange(item.value)}
          >
            <View style={[styles.filterChip, activeFilter === item.value ? styles.filterChipActive : null]}>
              <Text style={[styles.filterText, activeFilter === item.value ? styles.filterTextActive : null]}>{item.label}</Text>
            </View>
          </Pressable>
        ))}
      </View>
      <View style={styles.feed}>
        {events.length === 0 ? <Text style={styles.empty}>Keine Warnungen in diesem Filter.</Text> : null}
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
      <Text style={styles.sectionTitle}>Automatische Prüfungen</Text>
      <View style={styles.scheduleRows}>
        {Object.entries(MONITORING_SCHEDULE).map(([key, cron]) => (
          <View key={key} style={styles.scheduleRow}>
            <Server color={colors.muted} size={16} />
            <Text style={styles.scheduleLabel}>{scheduleLabel(key)}</Text>
            <Text style={styles.scheduleCron}>{scheduleText(cron)}</Text>
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
    <Pressable accessibilityRole="button" style={styles.eventRow} onPress={() => openAlertDetail(event)}>
      <View style={[styles.eventIcon, { backgroundColor: `${color}20` }]}>
        <Icon color={color} size={18} />
      </View>
      <View style={styles.eventBody}>
        <View style={styles.eventTitleRow}>
          <Text style={styles.eventTitle}>{event.title}</Text>
          {event.risk_state ? <RiskStateBadge state={event.risk_state} /> : null}
        </View>
        {!compact ? <Text style={styles.eventMessage}>{event.message}</Text> : null}
        <Text style={styles.eventTime}>{relativeTime(event.created_at)}</Text>
      </View>
    </Pressable>
  );
}

function openAlertDetail(event: MonitoringEvent) {
  router.push({
    pathname: "/(modal)/alert-detail",
    params: {
      id: event.id,
      type: event.type,
      severity: event.severity,
      title: event.title,
      message: event.message,
      createdAt: event.created_at,
      details: JSON.stringify(event.details ?? {})
    }
  });
}

function RiskStateBadge({ state }: { state: RiskHistoryState }) {
  const tone: RiskTone = state === "new" ? "critical" : state === "recurring" ? "warning" : state === "resolved" ? "safe" : "info";
  return (
    <View style={[styles.riskStateBadge, { borderColor: riskColors[tone] }]}>
      <Text style={[styles.riskStateText, { color: riskColors[tone] }]}>{riskStateLabel(state)}</Text>
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

function riskStateLabel(state: RiskHistoryState) {
  if (state === "new") return "Neu";
  if (state === "recurring") return "Wiederkehrend";
  if (state === "resolved") return "Behoben";
  return "Unverändert";
}

function scheduleLabel(key: string) {
  const labels: Record<string, string> = {
    ssl_check: "Verschlüsselung prüfen",
    dns_check: "Praxisadresse prüfen",
    port_scan: "Erreichbare Dienste prüfen",
    leak_check: "Datenleck-Hinweise prüfen",
    reputation_check: "Warnlisten prüfen"
  };

  return labels[key] ?? "Prüfung";
}

function scheduleText(cron: string) {
  const labels: Record<string, string> = {
    "0 */4 * * *": "mehrmals täglich",
    "0 */6 * * *": "mehrmals täglich",
    "0 */12 * * *": "zweimal täglich",
    "0 2 * * *": "täglich nachts",
    "0 3 * * *": "täglich nachts"
  };

  return labels[cron] ?? "regelmäßig";
}

function normalizeDomainInput(value: string) {
  return value.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0].split(":")[0];
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
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
  eventTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  eventTitle: {
    color: colors.ink,
    flexShrink: 1,
    fontSize: 15,
    fontWeight: "800"
  },
  riskStateBadge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3
  },
  riskStateText: {
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase"
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
  targetInputRow: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: 10,
    marginTop: 12
  },
  targetInputBody: {
    flex: 1
  },
  targetLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "900",
    marginBottom: 6,
    textTransform: "uppercase"
  },
  input: {
    backgroundColor: colors.glassStrong,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 14,
    fontWeight: "700",
    minHeight: 44,
    paddingHorizontal: 12
  },
  iconButton: {
    alignItems: "center",
    backgroundColor: colors.electric,
    borderRadius: 12,
    height: 44,
    justifyContent: "center",
    width: 44
  },
  consentRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
    marginTop: 14
  },
  checkbox: {
    alignItems: "center",
    borderColor: colors.borderStrong,
    borderRadius: 6,
    borderWidth: 1,
    height: 22,
    justifyContent: "center",
    marginTop: 2,
    width: 22
  },
  checkboxActive: {
    backgroundColor: colors.electric,
    borderColor: colors.electric
  },
  consentText: {
    color: colors.ink,
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19
  },
  targetList: {
    marginTop: 14
  },
  targetChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  targetChip: {
    backgroundColor: colors.glassStrong,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 8
  },
  targetChipDisabled: {
    opacity: 0.55
  },
  targetChipText: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: "800"
  },
  privacyHint: {
    color: colors.warning,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 8
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
