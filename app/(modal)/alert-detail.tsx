import { useLocalSearchParams, router } from "expo-router";
import { AlertTriangle, CheckCircle2, Copy, Mail, Send } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";

import { AnimatedButton } from "@/components/ui/AnimatedButton";
import { GlassCard } from "@/components/ui/GlassCard";
import { Screen } from "@/components/ui/Screen";
import { colors, riskColors, type RiskTone } from "@/constants/colors";
import type { MonitoringEventType, MonitoringSeverity } from "@/lib/monitoring/types";

type AlertDetail = {
  tone: RiskTone;
  headline: string;
  plainSummary: string;
  action: string;
  owner: string;
  deadline: string;
  affectedSystem: string;
  partnerMessage: string;
};

export default function AlertDetailModal() {
  const params = useLocalSearchParams<{
    type?: string;
    severity?: string;
    title?: string;
    message?: string;
    createdAt?: string;
    details?: string;
  }>();
  const type = normalizeType(params.type);
  const severity = normalizeSeverity(params.severity);
  const details = parseDetails(params.details);
  const detail = buildAlertDetail({
    type,
    severity,
    title: singleParam(params.title) ?? "Warnung",
    message: singleParam(params.message) ?? "",
    createdAt: singleParam(params.createdAt),
    details
  });

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Handlungsseite</Text>
        <Text style={styles.title}>{detail.headline}</Text>
        <Text style={styles.copy}>{detail.plainSummary}</Text>
      </View>

      <GlassCard tone={detail.tone} criticalGlow={detail.tone === "critical"} style={styles.card}>
        <View style={styles.row}>
          <View style={[styles.iconBubble, { backgroundColor: `${riskColors[detail.tone]}22` }]}>
            <AlertTriangle color={riskColors[detail.tone]} size={22} />
          </View>
          <View style={styles.rowText}>
            <Text style={styles.sectionTitle}>Was muss ich jetzt tun?</Text>
            <Text style={styles.action}>{detail.action}</Text>
          </View>
        </View>
        <View style={styles.metaGrid}>
          <Meta label="Wer?" value={detail.owner} />
          <Meta label="Bis wann?" value={detail.deadline} />
          <Meta label="Betroffen" value={detail.affectedSystem} />
        </View>
      </GlassCard>

      <GlassCard style={styles.card}>
        <View style={styles.messageHeader}>
          <Mail color={colors.electric} size={20} />
          <Text style={styles.sectionTitle}>Fertige Nachricht an IT-Partner/Hoster</Text>
        </View>
        <Text selectable style={styles.partnerMessage}>{detail.partnerMessage}</Text>
        <View style={styles.copyHint}>
          <Copy color={colors.electric} size={16} />
          <Text style={styles.hintText}>Text markieren und in E-Mail, Ticket oder Messenger kopieren.</Text>
        </View>
      </GlassCard>

      <GlassCard style={styles.card}>
        <Text style={styles.sectionTitle}>Danach prüfen</Text>
        <View style={styles.checkRow}>
          <CheckCircle2 color={colors.safe} size={18} />
          <Text style={styles.checkText}>Nach Rückmeldung des IT-Partners die Prüfung erneut starten.</Text>
        </View>
        <View style={styles.checkRow}>
          <CheckCircle2 color={colors.safe} size={18} />
          <Text style={styles.checkText}>Wenn die Warnung weiter auftaucht, das Ticket mit Screenshot erneut senden.</Text>
        </View>
      </GlassCard>

      <AnimatedButton
        label="Zum Monitoring zurück"
        icon={<Send color={colors.ink} size={18} />}
        onPress={() => router.back()}
      />
    </Screen>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaBox}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

function buildAlertDetail(input: {
  type: MonitoringEventType;
  severity: MonitoringSeverity;
  title: string;
  message: string;
  createdAt?: string;
  details: Record<string, unknown>;
}): AlertDetail {
  const tone = input.severity === "critical" ? "critical" : input.severity === "warning" ? "warning" : "info";
  const days = readNumber(input.details, "days_remaining");
  const domain = readString(input.details, "domain") ?? "unsere Praxisadresse";
  const email = readString(input.details, "email") ?? "unsere Praxis-E-Mail";
  const when = input.createdAt ? new Date(input.createdAt).toLocaleDateString("de-DE") : "heute";

  if (input.type === "ssl_expiry") {
    const daysText = typeof days === "number" ? `Es läuft in ${days} Tagen ab.` : "Es läuft bald ab.";
    return {
      tone,
      headline: "Verschlüsselung läuft bald ab",
      plainSummary: `Das Zertifikat schützt die Verbindung zur Praxis-Webseite. ${daysText}`,
      action: "Bitten Sie Ihren Hoster oder IT-Partner, das Zertifikat zu erneuern.",
      owner: "Hoster oder IT-Partner",
      deadline: typeof days === "number" && days <= 14 ? "heute" : "bis Freitag",
      affectedSystem: domain,
      partnerMessage: `Bitte erneuern Sie unser Zertifikat für ${domain}. ${daysText} Bitte geben Sie uns kurz Bescheid, sobald die Erneuerung abgeschlossen ist.`
    };
  }

  if (input.type === "dmarc_missing") {
    return {
      tone,
      headline: "Schutz gegen gefälschte Praxis-Mails fehlt",
      plainSummary: "E-Mails könnten leichter so aussehen, als kämen sie von Ihrer Praxis.",
      action: "Bitten Sie Ihren IT-Partner, den Schutz gegen gefälschte Praxis-Mails wieder einzurichten.",
      owner: "IT-Partner oder Mail-Hoster",
      deadline: "bis Freitag",
      affectedSystem: email,
      partnerMessage: `Bitte richten Sie den Schutz gegen gefälschte Praxis-Mails für ${email} wieder ein. Die Überwachung meldet seit ${when}, dass dieser Schutz fehlt. Bitte prüfen Sie auch die erlaubten Versandquellen.`
    };
  }

  if (input.type === "leak_detected") {
    return {
      tone,
      headline: "Möglicher Datenleck-Hinweis",
      plainSummary: "Eine freigegebene Praxis-E-Mail-Adresse wurde in einem Datenleck-Hinweis gefunden.",
      action: "Ändern Sie das Passwort und aktivieren Sie eine zweite Bestätigung beim Einloggen.",
      owner: "Praxisleitung mit IT-Partner",
      deadline: "heute",
      affectedSystem: email,
      partnerMessage: `Bitte prüfen Sie die Praxis-E-Mail ${email}. Es gibt einen Datenleck-Hinweis. Bitte ändern Sie das Passwort, prüfen Sie Anmeldungen und aktivieren Sie eine zweite Bestätigung beim Einloggen.`
    };
  }

  if (input.type === "port_open") {
    return {
      tone,
      headline: "Ein kritischer Dienst ist erreichbar",
      plainSummary: "Ein Dienst wirkt von außen erreichbar. Das sollte geprüft werden, damit keine unnötige Angriffsfläche offen bleibt.",
      action: "Bitten Sie Ihren IT-Partner, den erreichbaren Dienst zu prüfen und zu schließen, wenn er nicht benötigt wird.",
      owner: "IT-Partner",
      deadline: "heute",
      affectedSystem: domain,
      partnerMessage: `Bitte prüfen Sie ${domain}. Die Überwachung meldet einen von außen erreichbaren kritischen Dienst. Bitte schließen Sie ihn, falls er nicht ausdrücklich benötigt wird, oder dokumentieren Sie den Zweck.`
    };
  }

  if (input.type === "domain_blacklisted") {
    return {
      tone,
      headline: "Praxisadresse steht auf einer Warnliste",
      plainSummary: "Die Praxisadresse wurde auf einer Warnliste gefunden. Das kann E-Mail-Zustellung oder Vertrauen beeinträchtigen.",
      action: "Bitten Sie Hoster oder IT-Partner, Ursache und Entfernung von der Warnliste zu prüfen.",
      owner: "Hoster oder IT-Partner",
      deadline: "heute",
      affectedSystem: domain,
      partnerMessage: `Bitte prüfen Sie, warum ${domain} auf einer Warnliste steht. Bitte beheben Sie die Ursache und beantragen Sie die Entfernung von der Liste.`
    };
  }

  if (input.type === "dns_changed") {
    return {
      tone,
      headline: "Praxisadresse wurde geändert",
      plainSummary: "Die Einstellungen der Praxisadresse haben sich geändert. Das kann gewollt sein, sollte aber bestätigt werden.",
      action: "Fragen Sie Ihren IT-Partner, ob diese Änderung geplant war.",
      owner: "IT-Partner oder Hoster",
      deadline: "bis morgen",
      affectedSystem: domain,
      partnerMessage: `Bitte bestätigen Sie, ob die Änderung an unserer Praxisadresse ${domain} geplant war. Falls nicht, prüfen Sie bitte die Ursache und stellen Sie die sichere Einstellung wieder her.`
    };
  }

  if (input.type === "monitoring_run") {
    return {
      tone,
      headline: "Prüfung abgeschlossen",
      plainSummary: input.message || "Die wichtigsten Online-Zugänge wurden geprüft.",
      action: "Öffnen Sie kritische Warnungen zuerst. Wenn keine Warnung offen ist, ist gerade keine Sofortmaßnahme nötig.",
      owner: "Praxisleitung",
      deadline: "bei der nächsten Warnung",
      affectedSystem: domain,
      partnerMessage: `Zur Info: Die automatische Sicherheitsprüfung wurde am ${when} abgeschlossen. Aktuell ist aus diesem Ereignis keine direkte Aufgabe für den IT-Partner nötig.`
    };
  }

  return {
    tone,
    headline: input.title,
    plainSummary: input.message || "Die Überwachung hat einen Hinweis gefunden.",
    action: "Prüfen Sie den Hinweis mit Ihrem IT-Partner.",
    owner: "Praxisleitung und IT-Partner",
    deadline: "bis morgen",
    affectedSystem: domain,
    partnerMessage: `Bitte prüfen Sie diese Monitoring-Warnung: "${input.title}". ${input.message} Bitte geben Sie uns eine kurze Einschätzung und den nächsten Schritt.`
  };
}

function normalizeType(value: unknown): MonitoringEventType {
  const raw = singleParam(value);
  if (
    raw === "ssl_expiry" ||
    raw === "dmarc_missing" ||
    raw === "leak_detected" ||
    raw === "port_open" ||
    raw === "domain_blacklisted" ||
    raw === "dns_changed" ||
    raw === "monitoring_run"
  ) {
    return raw;
  }

  return "monitoring_run";
}

function normalizeSeverity(value: unknown): MonitoringSeverity {
  const raw = singleParam(value);
  if (raw === "critical" || raw === "warning" || raw === "info") return raw;
  return "info";
}

function singleParam(value: unknown) {
  if (Array.isArray(value)) return value[0];
  return typeof value === "string" ? value : undefined;
}

function parseDetails(value: unknown) {
  const raw = singleParam(value);
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function readString(details: Record<string, unknown>, key: string) {
  const value = details[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readNumber(details: Record<string, unknown>, key: string) {
  const value = details[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

const styles = StyleSheet.create({
  header: {
    marginBottom: 18
  },
  eyebrow: {
    color: colors.electric,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  title: {
    color: colors.ink,
    fontSize: 34,
    fontWeight: "900",
    lineHeight: 39,
    marginTop: 8
  },
  copy: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 23,
    marginTop: 10
  },
  card: {
    marginBottom: 16
  },
  row: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12
  },
  iconBubble: {
    alignItems: "center",
    borderRadius: 15,
    height: 44,
    justifyContent: "center",
    width: 44
  },
  rowText: {
    flex: 1
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "900",
    lineHeight: 24
  },
  action: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 22,
    marginTop: 8
  },
  metaGrid: {
    gap: 10,
    marginTop: 18
  },
  metaBox: {
    backgroundColor: colors.glassStrong,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    padding: 12
  },
  metaLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  metaValue: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 20,
    marginTop: 4
  },
  messageHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    marginBottom: 12
  },
  partnerMessage: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 21,
    padding: 12
  },
  copyHint: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 8,
    marginTop: 12
  },
  hintText: {
    color: colors.muted,
    flex: 1,
    fontSize: 12,
    lineHeight: 18
  },
  checkRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
    marginTop: 12
  },
  checkText: {
    color: colors.ink,
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20
  }
});
