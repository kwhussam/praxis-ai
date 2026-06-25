import { Ionicons } from "@expo/vector-icons";
import { MotiView } from "moti";
import type { ComponentProps } from "react";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AnimatedButton } from "@/components/ui/AnimatedButton";
import { AmpelBadge } from "@/components/ui/AmpelBadge";
import { GlassCard } from "@/components/ui/GlassCard";
import { ScanAnimation, type ScanNode } from "@/components/ui/ScanAnimation";
import { ScoreRing } from "@/components/ui/ScoreRing";
import { VulnerabilityCard } from "@/components/ui/VulnerabilityCard";
import { colors, type RiskTone } from "@/constants/colors";
import { useCheckStore } from "@/lib/store/check";
import {
  mapWlanVulnerabilitiesToFindings,
  runWlanSecurityScan,
  SCAN_PHASES,
  syncWlanScanResultToSupabase,
  type DeviceInfo,
  type Vulnerability,
  type WlanScanProgress,
  type WlanScanResult
} from "@/lib/security/wlan";
import { useSessionStore } from "@/lib/store/session";

type ScannerState = "consent" | "idle" | "scanning" | "done" | "error";
type IoniconName = ComponentProps<typeof Ionicons>["name"];

export function WlanScanner() {
  const recalculateScore = useCheckStore((store) => store.recalculate);
  const practiceId = useSessionStore((store) => store.practice?.id);
  const [state, setState] = useState<ScannerState>("consent");
  const [accepted, setAccepted] = useState(false);
  const [progress, setProgress] = useState<WlanScanProgress | null>(null);
  const [result, setResult] = useState<WlanScanResult | null>(null);
  const [visibleDevices, setVisibleDevices] = useState<DeviceInfo[]>([]);
  const [error, setError] = useState<string | null>(null);

  const phase = progress ? SCAN_PHASES[progress.phaseIndex] : SCAN_PHASES[0];
  const displayedDevices = visibleDevices.length > 0 ? visibleDevices : result?.connectedDevices ?? [];
  const sortedVulnerabilities = useMemo(() => sortVulnerabilities(result?.vulnerabilities ?? []), [result]);
  const scanNodes = useMemo(
    () => mapDevicesToScanNodes(displayedDevices, progress?.vulnerabilities ?? result?.vulnerabilities ?? []),
    [displayedDevices, progress, result]
  );

  async function scan() {
    setState("scanning");
    setResult(null);
    setError(null);
    setVisibleDevices([]);

    try {
      const nextResult = await runWlanSecurityScan({
        phaseDelayMs: 260,
        onProgress: (nextProgress) => {
          setProgress(nextProgress);
          if (nextProgress.discoveredDevices.length > 0) {
            setVisibleDevices(nextProgress.discoveredDevices);
          }
        }
      });

      setResult(nextResult);
      setVisibleDevices(nextResult.connectedDevices);
      recalculateScore({ wlanFindings: mapWlanVulnerabilitiesToFindings(nextResult.vulnerabilities) });
      if (practiceId) void syncWlanScanResultToSupabase(practiceId, nextResult).catch(() => undefined);
      setState("done");
    } catch {
      setError("Der WLAN-Scan konnte auf diesem Gerät nicht abgeschlossen werden. Prüfen Sie WLAN-Berechtigungen und Verbindung.");
      setState("error");
    }
  }

  if (state === "consent") {
    return (
      <GlassCard style={styles.card}>
        <View style={styles.headerRow}>
          <View style={styles.iconBubble}>
            <Ionicons name="shield-checkmark" size={24} color={colors.electric} />
          </View>
          <AmpelBadge tone="info" label="Einwilligung" />
        </View>
        <Text style={styles.title}>WLAN-Sicherheitsscanner</Text>
        <Text style={styles.copy}>
          Der Scan analysiert nur Netzwerkstruktur, WLAN-Konfiguration und sichtbare Dienste. Wir greifen NICHT auf
          Patientendaten, Praxissoftware-Inhalte oder Dateien zu.
        </Text>
        <View style={styles.noticeBox}>
          <Text style={styles.noticeTitle}>Rechtlicher Hinweis</Text>
          <Text style={styles.noticeText}>Nur im eigenen Praxisnetz oder mit ausdrücklicher Erlaubnis verwenden.</Text>
          <Text style={styles.noticeText}>
            Ergebnisse werden lokal verschlüsselt gespeichert und enthalten keine Patientendaten.
          </Text>
        </View>
        <Pressable style={styles.consentRow} onPress={() => setAccepted((current) => !current)}>
          <View style={[styles.checkbox, accepted ? styles.checkboxActive : null]}>
            {accepted ? <Ionicons name="checkmark" size={16} color={colors.ink} /> : null}
          </View>
          <Text style={styles.consentText}>Ich darf dieses Netzwerk prüfen und stimme dem lokalen Scan zu.</Text>
        </Pressable>
        <AnimatedButton
          label="Scan vorbereiten"
          onPress={() => {
            if (accepted) setState("idle");
          }}
          style={[styles.button, !accepted ? styles.buttonDisabled : null]}
          icon={<Ionicons name="wifi" size={18} color={colors.ink} />}
        />
        {!accepted ? <Text style={styles.helper}>Bitte Einverständnis bestätigen, bevor der Scan startet.</Text> : null}
      </GlassCard>
    );
  }

  return (
    <GlassCard style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.iconBubble}>
          <Ionicons name="radio" size={23} color={colors.electric} />
        </View>
        <AmpelBadge tone={result ? scoreTone(result.riskScore) : "info"} label={stateLabel(state, result)} pulsing={state === "scanning"} />
      </View>

      <Text style={styles.title}>WLAN-Sicherheitscheck</Text>
      <Text style={styles.copy}>
        Lokaler Best-Effort-Scan für das verbundene Praxis-WLAN. Keine Inhalte, Dateien oder Patientendaten werden gelesen.
      </Text>

      <View style={styles.scannerGrid}>
        <ScanAnimation
          nodes={scanNodes}
          scanning={state === "scanning"}
          progress={state === "done" ? 1 : progress?.progress ?? 0}
        />
        <View style={styles.phasePanel}>
          <Text style={styles.phaseEyebrow}>
            Phase {state === "scanning" && progress ? progress.phaseIndex + 1 : result ? SCAN_PHASES.length : 1}/
            {SCAN_PHASES.length}
          </Text>
          <Text style={styles.phaseTitle}>{state === "done" ? "Scan abgeschlossen" : phase.label}</Text>
          <Text style={styles.phaseCheck}>
            {state === "scanning" && progress ? progress.check : "Bereit für Gateway-, DNS- und Geräteanalyse."}
          </Text>
          <ProgressBar value={state === "done" ? 1 : progress?.progress ?? 0} />
        </View>
      </View>

      {state === "idle" ? (
        <AnimatedButton
          label="WLAN jetzt prüfen"
          onPress={scan}
          style={styles.button}
          icon={<Ionicons name="scan" size={18} color={colors.ink} />}
        />
      ) : null}

      {state === "scanning" ? (
        <View style={styles.liveList}>
          {phase.checks.map((check) => (
            <View key={check} style={styles.checkRow}>
              <Ionicons name={check === progress?.check ? "radio-button-on" : "checkmark-circle"} size={16} color={check === progress?.check ? colors.electric : colors.safe} />
              <Text style={styles.checkText}>{check}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {state === "done" && result ? (
        <View style={styles.results}>
          <View style={styles.scoreRow}>
            <ScoreRing score={result.riskScore} size={128} stroke={12} />
            <View style={styles.scoreCopy}>
              <Text style={styles.resultTitle}>{result.networkName}</Text>
              <Text style={styles.meta}>IP {result.ipAddress} · Gateway {result.gatewayIp || "unbekannt"}</Text>
              <Text style={styles.meta}>
                Verschlüsselung: {result.securityProtocol} · Geräte: {result.connectedDevices.length}
              </Text>
            </View>
          </View>

          <DeviceList devices={result.connectedDevices} />
          <VulnerabilityList vulnerabilities={sortedVulnerabilities} />
        </View>
      ) : null}

      {state === "error" ? (
        <View style={styles.errorBox}>
          <Ionicons name="warning" size={18} color={colors.warning} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
    </GlassCard>
  );
}

function ProgressBar({ value }: { value: number }) {
  return (
    <View style={styles.progressTrack}>
      <MotiView
        animate={{ width: `${Math.max(4, Math.round(value * 100))}%` }}
        transition={{ type: "timing", duration: 260 }}
        style={styles.progressFill}
      />
    </View>
  );
}

function DeviceList({ devices }: { devices: DeviceInfo[] }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Gefundene Netzwerkgeräte</Text>
      {devices.map((device) => (
        <View key={device.id} style={styles.deviceRow}>
          <View style={styles.deviceIcon}>
            <Ionicons name={deviceIcon(device)} size={18} color={device.isKnown ? colors.electric : colors.warning} />
          </View>
          <View style={styles.deviceText}>
            <Text style={styles.deviceName}>{device.hostname}</Text>
            <Text style={styles.meta}>
              {device.ipAddress} · {device.deviceType} · {device.openPorts.filter((port) => port.state === "open").length} offene Ports
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function VulnerabilityList({ vulnerabilities }: { vulnerabilities: Vulnerability[] }) {
  if (vulnerabilities.length === 0) {
    return (
      <View style={styles.safeBox}>
        <Ionicons name="shield-checkmark" size={18} color={colors.safe} />
        <Text style={styles.safeText}>Keine kritischen WLAN-Schwachstellen im mobilen Scan sichtbar.</Text>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Gefundene Schwachstellen</Text>
      {vulnerabilities.map((vulnerability) => (
        <VulnerabilityCard
          key={vulnerability.id}
          title={vulnerability.title}
          description={vulnerability.description}
          remediation={vulnerability.remediation}
          severity={vulnerability.severity}
          category={vulnerabilityCategory(vulnerability)}
          defaultExpanded={vulnerability.severity === "critical"}
          style={styles.vulnerabilityCard}
        />
      ))}
    </View>
  );
}

function mapDevicesToScanNodes(devices: DeviceInfo[], vulnerabilities: Vulnerability[]): ScanNode[] {
  return devices.map((device) => {
    const hasFinding = vulnerabilities.some((vulnerability) => {
      return device.openPorts.some((port) => vulnerability.description.includes(String(port.port)));
    });
    const tone = hasFinding || !device.isKnown ? colors.warning : device.isGateway ? colors.electric : colors.safe;

    return {
      id: device.id,
      icon: deviceIcon(device),
      tone,
      hasFinding
    };
  });
}

function stateLabel(state: ScannerState, result: WlanScanResult | null) {
  if (state === "scanning") return "Scan läuft";
  if (state === "done" && result) return result.riskScore >= 80 ? "Unauffällig" : "Handlungsbedarf";
  if (state === "error") return "Fehler";
  return "Bereit";
}

function scoreTone(score: number): RiskTone {
  if (score >= 80) return "safe";
  if (score >= 55) return "warning";
  return "critical";
}

function vulnerabilityCategory(vulnerability: Vulnerability) {
  const text = `${vulnerability.title} ${vulnerability.description}`.toLowerCase();
  if (text.includes("wlan") || text.includes("wifi") || text.includes("verschlüsselung")) return "wifi";
  if (text.includes("mail") || text.includes("dmarc") || text.includes("spf")) return "email";
  if (text.includes("port") || text.includes("gateway") || text.includes("dns")) return "network";
  if (text.includes("web") || text.includes("ssl") || text.includes("tls")) return "web";
  if (text.includes("gerät") || text.includes("device")) return "device";
  return "general";
}

function sortVulnerabilities(vulnerabilities: Vulnerability[]) {
  const order = { critical: 0, high: 1, medium: 2, low: 3 };
  return [...vulnerabilities].sort((a, b) => order[a.severity] - order[b.severity]);
}

function deviceIcon(device: DeviceInfo): IoniconName {
  if (device.deviceType === "gateway") return "server";
  if (device.deviceType === "phone") return "phone-portrait";
  if (device.deviceType === "printer") return "print";
  if (device.deviceType === "workstation") return "desktop";
  if (device.deviceType === "server") return "file-tray-stacked";
  if (device.deviceType === "iot") return "hardware-chip";
  return "help-circle";
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 18
  },
  headerRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16
  },
  iconBubble: {
    alignItems: "center",
    backgroundColor: colors.electricSoft,
    borderColor: "rgba(45, 126, 248, 0.36)",
    borderRadius: 16,
    borderWidth: 1,
    height: 48,
    justifyContent: "center",
    width: 48
  },
  title: {
    color: colors.ink,
    fontSize: 24,
    fontWeight: "900"
  },
  copy: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 10
  },
  noticeBox: {
    backgroundColor: "rgba(45, 126, 248, 0.1)",
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 18,
    padding: 14
  },
  noticeTitle: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 6
  },
  noticeText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4
  },
  consentRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    marginTop: 18
  },
  checkbox: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    height: 28,
    justifyContent: "center",
    width: 28
  },
  checkboxActive: {
    backgroundColor: colors.electric,
    borderColor: colors.electric
  },
  consentText: {
    color: colors.ink,
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20
  },
  helper: {
    color: colors.warning,
    fontSize: 13,
    marginTop: 10
  },
  button: {
    marginTop: 20
  },
  buttonDisabled: {
    opacity: 0.45
  },
  scannerGrid: {
    gap: 18,
    marginTop: 20
  },
  phasePanel: {
    backgroundColor: colors.glass,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    padding: 14
  },
  phaseEyebrow: {
    color: colors.electric,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  phaseTitle: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "900",
    marginTop: 6
  },
  phaseCheck: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6
  },
  progressTrack: {
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 999,
    height: 8,
    marginTop: 14,
    overflow: "hidden"
  },
  progressFill: {
    backgroundColor: colors.electric,
    borderRadius: 999,
    height: 8
  },
  liveList: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    gap: 10,
    marginTop: 18,
    paddingTop: 16
  },
  checkRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10
  },
  checkText: {
    color: colors.muted,
    flex: 1,
    fontSize: 13,
    lineHeight: 18
  },
  results: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    marginTop: 18,
    paddingTop: 18
  },
  scoreRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 16
  },
  scoreCopy: {
    flex: 1
  },
  resultTitle: {
    color: colors.ink,
    fontSize: 19,
    fontWeight: "900",
    marginBottom: 8
  },
  meta: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19
  },
  section: {
    marginTop: 20
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "900",
    marginBottom: 12
  },
  deviceRow: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 16,
    flexDirection: "row",
    gap: 12,
    marginBottom: 10,
    padding: 12
  },
  deviceIcon: {
    alignItems: "center",
    backgroundColor: colors.electricSoft,
    borderRadius: 14,
    height: 42,
    justifyContent: "center",
    width: 42
  },
  deviceText: {
    flex: 1
  },
  deviceName: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "800"
  },
  vulnerabilityCard: {
    marginBottom: 12
  },
  safeBox: {
    alignItems: "center",
    backgroundColor: "rgba(46, 213, 115, 0.12)",
    borderColor: "rgba(46, 213, 115, 0.32)",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    marginTop: 18,
    padding: 14
  },
  safeText: {
    color: colors.ink,
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20
  },
  errorBox: {
    alignItems: "center",
    backgroundColor: "rgba(255, 165, 2, 0.12)",
    borderRadius: 16,
    flexDirection: "row",
    gap: 10,
    marginTop: 18,
    padding: 14
  },
  errorText: {
    color: colors.ink,
    flex: 1,
    fontSize: 14,
    lineHeight: 20
  }
});
