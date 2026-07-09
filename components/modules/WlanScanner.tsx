import { Ionicons } from "@expo/vector-icons";
import { MotiView } from "moti";
import type { ComponentProps } from "react";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AnimatedButton } from "@/components/ui/AnimatedButton";
import { AmpelBadge } from "@/components/ui/AmpelBadge";
import { FindingBadge } from "@/components/ui/FindingBadge";
import { GlassCard } from "@/components/ui/GlassCard";
import { ScanAnimation, type ScanNode } from "@/components/ui/ScanAnimation";
import { ScoreRing } from "@/components/ui/ScoreRing";
import { VulnerabilityCard } from "@/components/ui/VulnerabilityCard";
import { colors, type RiskTone } from "@/constants/colors";
import { apiRequest } from "@/lib/api/client";
import { useInventoryStore } from "@/lib/store/inventory";
import { useCheckStore } from "@/lib/store/check";
import {
  mapWlanVulnerabilitiesToFindings,
  runWlanSecurityScan,
  SCAN_PHASES,
  syncWlanScanResultToSupabase,
  type DeviceInfo,
  type NetworkSegmentId,
  type NetworkSecurityFinding,
  type Vulnerability,
  type WlanScanProgress,
  type WlanScanResult
} from "@/lib/security/wlan";
import { NETWORK_SEGMENTS } from "@/lib/security/segmentationAssessment";
import { useSessionStore } from "@/lib/store/session";

type ScannerState = "consent" | "idle" | "scanning" | "done" | "error";
type IoniconName = ComponentProps<typeof Ionicons>["name"];

export function WlanScanner() {
  const recalculateScore = useCheckStore((store) => store.recalculate);
  const questionnaireAnswers = useCheckStore((store) => store.answers);
  const practiceId = useSessionStore((store) => store.practice?.id);
  const knownDevices = useInventoryStore((store) => store.getKnownDevices(practiceId));
  const accessPoints = useInventoryStore((store) => store.getAccessPoints(practiceId));
  const [state, setState] = useState<ScannerState>("consent");
  const [accepted, setAccepted] = useState(false);
  const [progress, setProgress] = useState<WlanScanProgress | null>(null);
  const [result, setResult] = useState<WlanScanResult | null>(null);
  const [visibleDevices, setVisibleDevices] = useState<DeviceInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [auditMode, setAuditMode] = useState(false);
  const [auditAccepted, setAuditAccepted] = useState(false);
  const [ipv6Accepted, setIpv6Accepted] = useState(false);
  const [scanSegment, setScanSegment] = useState<NetworkSegmentId>("practice_wifi");

  const phase = progress ? SCAN_PHASES[progress.phaseIndex] : SCAN_PHASES[0];
  const displayedDevices = visibleDevices.length > 0 ? visibleDevices : result?.connectedDevices ?? [];
  const sortedVulnerabilities = useMemo(() => sortVulnerabilities(result?.vulnerabilities ?? []), [result]);
  const scanDisabled = state === "scanning" || (auditMode && !auditAccepted);
  const scanNodes = useMemo(
    () => mapDevicesToScanNodes(displayedDevices, progress?.vulnerabilities ?? result?.vulnerabilities ?? []),
    [displayedDevices, progress, result]
  );

  async function scan() {
    if (!practiceId) {
      setError("WLAN-Scan erfordert eine angemeldete Praxis.");
      setState("error");
      return;
    }

    setState("scanning");
    setResult(null);
    setError(null);
    setVisibleDevices([]);

    try {
      void recordWlanScanConsent(practiceId, auditMode && auditAccepted, ipv6Accepted);

      const nextResult = await runWlanSecurityScan({
        phaseDelayMs: 260,
        knownDevices,
        accessPoints,
        scanSegment,
        networkStructure: {
          guestWifiExists: questionnaireAnswers.vlanGuests,
          guestWifiClientIsolation: questionnaireAnswers.guestWifiClientIsolation,
          networkStructureDocumented: questionnaireAnswers.networkStructureDocumented
        },
        dnsOperation: {
          resolverDocumented: questionnaireAnswers.dnsResolverDocumented,
          filterEnabled: questionnaireAnswers.dnsFilterEnabled,
          privacyReviewed: questionnaireAnswers.dnsPrivacyReviewed,
          providerDocumented: questionnaireAnswers.dnsProviderDocumented,
          configurationDocumented: questionnaireAnswers.dnsConfigurationDocumented
        },
        ipv6Security: {
          usedIntentionally: questionnaireAnswers.ipv6UsedIntentionally,
          firewallRulesCovered: questionnaireAnswers.ipv6FirewallRulesCovered,
          dnsRulesCovered: questionnaireAnswers.ipv6DnsRulesCovered,
          reachabilityConsentAccepted: ipv6Accepted
        },
        auditMode: {
          enabled: auditMode,
          consentAccepted: auditAccepted
        },
        onProgress: (nextProgress) => {
          setProgress(nextProgress);
          if (nextProgress.discoveredDevices.length > 0) {
            setVisibleDevices(nextProgress.discoveredDevices);
          }
        }
      });

      setResult(nextResult);
      setVisibleDevices(nextResult.connectedDevices);
      recalculateScore({
        encryption: nextResult.securityProtocol,
        wlanFindings: mapWlanVulnerabilitiesToFindings(nextResult.vulnerabilities),
        wlanSecurityFindings: nextResult.securityFindings
      });
      if (practiceId) void syncWlanScanResultToSupabase(practiceId, nextResult).catch(() => undefined);
      setState("done");
    } catch (scanError) {
      setError(scanErrorMessage(scanError));
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

      <View style={styles.segmentBox}>
        <Text style={styles.segmentTitle}>Ausgeführtes Netz</Text>
        <View style={styles.segmentOptions}>
          {NETWORK_SEGMENTS.map((segment) => (
            <Pressable
              key={segment.id}
              style={[styles.segmentOption, scanSegment === segment.id ? styles.segmentOptionActive : null]}
              onPress={() => setScanSegment(segment.id)}
            >
              <Text style={[styles.segmentOptionText, scanSegment === segment.id ? styles.segmentOptionTextActive : null]}>
                {segment.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.auditBox}>
        <Pressable
          style={styles.consentRow}
          onPress={() => {
            setAuditMode((current) => {
              if (current) setAuditAccepted(false);
              return !current;
            });
          }}
        >
          <View style={[styles.checkbox, auditMode ? styles.checkboxActive : null]}>
            {auditMode ? <Ionicons name="checkmark" size={16} color={colors.ink} /> : null}
          </View>
          <View style={styles.auditText}>
            <Text style={styles.auditTitle}>Audit-Modus</Text>
            <Text style={styles.auditDescription}>Langsamer TCP-Connect-Scan über das erkannte lokale IPv4-Subnetz.</Text>
          </View>
        </Pressable>
        {auditMode ? (
          <Pressable style={styles.consentRow} onPress={() => setAuditAccepted((current) => !current)}>
            <View style={[styles.checkbox, auditAccepted ? styles.checkboxActive : null]}>
              {auditAccepted ? <Ionicons name="checkmark" size={16} color={colors.ink} /> : null}
            </View>
            <Text style={styles.consentText}>Ich habe die Berechtigung für einen vollständigen lokalen Audit-Scan.</Text>
          </Pressable>
        ) : null}
        <Pressable style={styles.consentRow} onPress={() => setIpv6Accepted((current) => !current)}>
          <View style={[styles.checkbox, ipv6Accepted ? styles.checkboxActive : null]}>
            {ipv6Accepted ? <Ionicons name="checkmark" size={16} color={colors.ink} /> : null}
          </View>
          <View style={styles.auditText}>
            <Text style={styles.auditTitle}>IPv6-Erreichbarkeit prüfen</Text>
            <Text style={styles.auditDescription}>Optionale lokale IPv6-Portprüfung für erkannte ULA-/Link-Local-Adressen.</Text>
          </View>
        </Pressable>
      </View>

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
          label={auditMode ? "Audit-Scan starten" : "WLAN jetzt prüfen"}
          onPress={() => {
            if (!scanDisabled) void scan();
          }}
          style={[styles.button, scanDisabled ? styles.buttonDisabled : null]}
          icon={<Ionicons name="scan" size={18} color={colors.ink} />}
        />
      ) : null}
      {state === "idle" && auditMode && !auditAccepted ? (
        <Text style={styles.helper}>Für den Audit-Modus ist eine separate Einwilligung erforderlich.</Text>
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
              <FindingRow label={`IP ${result.ipAddress}`} source={result.findings.ipAddress.source} />
              <FindingRow label={`Gateway ${result.gatewayIp || "unbekannt"}`} source={result.findings.gatewayIp.source} />
              <FindingRow label={`Verschlüsselung: ${result.securityProtocol}`} source={result.findings.securityProtocol.source} />
              <FindingRow label={`Geräte: ${result.connectedDevices.length}`} source={result.findings.connectedDevices.source} />
              <FindingRow label={`Segment: ${segmentLabel(result.scanSegment)}`} source="questionnaire" />
              <FindingRow label={`Scanmodus: ${result.scanMode === "audit" ? "Audit" : "Standard"}`} source={result.findings.openPorts.source} />
            </View>
          </View>

          <Methodology result={result} />
          <SecurityCheckList findings={result.securityFindings} />
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

async function recordWlanScanConsent(practiceId: string, auditConsent: boolean, ipv6Consent: boolean) {
  try {
    await apiRequest("/api/legal/consent", {
      method: "POST",
      body: {
        practiceId,
        type: "wlan_scan",
        version: "1.0",
        accepted: true
      }
    });
    if (auditConsent) {
      await apiRequest("/api/legal/consent", {
        method: "POST",
        body: {
          practiceId,
          type: "wlan_audit_scan",
          version: "1.0",
          accepted: true
        }
      });
    }
    if (ipv6Consent) {
      await apiRequest("/api/legal/consent", {
        method: "POST",
        body: {
          practiceId,
          type: "wlan_ipv6_reachability_scan",
          version: "1.0",
          accepted: true
        }
      });
    }
  } catch {
    // Local-first scan: API consent sync must not block diagnostics when the worker is offline.
  }
}

function scanErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.length > 0) {
    return `Der lokale WLAN-Scan konnte nicht abgeschlossen werden: ${error.message}`;
  }

  return "Der lokale WLAN-Scan konnte nicht abgeschlossen werden. Prüfen Sie WLAN-Berechtigungen und ob das Gerät mit dem Praxis-WLAN verbunden ist.";
}

function segmentLabel(segmentId: NetworkSegmentId) {
  return NETWORK_SEGMENTS.find((segment) => segment.id === segmentId)?.label ?? segmentId;
}

function FindingRow({ label, source }: { label: string; source: WlanScanResult["findings"]["networkName"]["source"] }) {
  return (
    <View style={styles.findingRow}>
      <Text style={styles.meta}>{label}</Text>
      <FindingBadge source={source} />
    </View>
  );
}

function Methodology({ result }: { result: WlanScanResult }) {
  return (
    <View style={styles.methodologyBox}>
      <Text style={styles.methodologyTitle}>Methodik & Einschränkungen</Text>
      <FindingRow label={`DNS-Server: ${result.dnsServers.length || "nicht sichtbar"}`} source={result.findings.dnsServers.source} />
      <FindingRow label={`Gateway-Ports: ${result.findings.openPorts.value.length}`} source={result.findings.openPorts.source} />
      <FindingRow
        label={`Subnetz-Hosts: ${result.subnetScan.scannedHosts}/${result.subnetScan.candidateHosts || result.subnetScan.scannedHosts}`}
        source={result.findings.openPorts.source}
      />
      {result.methodology.slice(0, 3).map((item) => (
        <Text key={item} style={styles.methodologyText}>{item}</Text>
      ))}
    </View>
  );
}

function SecurityCheckList({ findings }: { findings: NetworkSecurityFinding[] }) {
  if (findings.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Sicherheitsprüfungen</Text>
      {findings.map((finding) => (
        <View key={finding.id} style={styles.securityCheckRow}>
          <View style={[styles.securityCheckIcon, { borderColor: statusColor(finding), backgroundColor: statusBackground(finding) }]}>
            <Ionicons name={securityCheckIcon(finding)} size={18} color={statusColor(finding)} />
          </View>
          <View style={styles.securityCheckText}>
            <View style={styles.securityCheckTitleRow}>
              <Text style={styles.securityCheckTitle}>{finding.title}</Text>
              <AmpelBadge tone={statusTone(finding)} label={statusLabel(finding)} />
            </View>
            <Text style={styles.securityCheckDetails}>{finding.details}</Text>
            {finding.detected ? <Text style={styles.securityCheckRecommendation}>{finding.recommendation}</Text> : null}
            {finding.contextQuestions && finding.contextQuestions.length > 0 ? (
              <View style={styles.contextQuestionBox}>
                {finding.contextQuestions.map((question) => (
                  <Text key={question} style={styles.contextQuestionText}>{question}</Text>
                ))}
              </View>
            ) : null}
          </View>
        </View>
      ))}
    </View>
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

function securityCheckIcon(finding: NetworkSecurityFinding): IoniconName {
  if (finding.checkId === "wifi_encryption" || finding.checkId === "wpa3_upgrade") return finding.status === "secure" ? "lock-closed" : "lock-open";
  if (finding.checkId === "wps_status") return "help-circle";
  if (finding.checkId === "router_http") return "globe";
  if (finding.checkId === "telnet") return "terminal";
  if (finding.checkId === "smb" || finding.checkId === "smb_security") return "file-tray-stacked";
  if (finding.checkId === "upnp_ssdp") return "swap-horizontal";
  if (finding.checkId === "rdp") return "desktop";
  if (finding.checkId === "database_ports") return "server";
  if (finding.checkId === "printer_services") return "print";
  if (finding.checkId === "nas_services") return "file-tray-stacked";
  if (finding.checkId === "camera_iot") return "videocam";
  if (finding.checkId === "medical_device_metadata") return "medkit";
  if (finding.checkId === "ipv6_exposure" || finding.checkId === "ipv6_reachability") return "git-network";
  if (finding.checkId === "dns_resolver" || finding.checkId === "dns_security" || finding.checkId === "dns_filter_test") return "globe";
  if (finding.checkId === "dhcp_consistency") return "git-branch";
  if (finding.checkId === "guest_network") return "people";
  if (finding.checkId === "network_segmentation") return "git-compare";
  if (finding.checkId === "rogue_access_point") return "radio";
  if (finding.checkId === "rogue_device") return "help-circle";
  if (finding.checkId === "router_firmware") return "cloud-upload";
  if (finding.checkId === "default_password_risk") return "key";
  if (finding.checkId === "firewall_baseline") return "shield-half";
  return "shield-checkmark";
}

function statusTone(finding: NetworkSecurityFinding): RiskTone {
  if (finding.status === "critical") return "critical";
  if (finding.status === "warning") return "warning";
  if (finding.status === "secure") return "safe";
  return "info";
}

function statusColor(finding: NetworkSecurityFinding) {
  if (finding.status === "critical") return colors.critical;
  if (finding.status === "warning") return colors.warning;
  if (finding.status === "secure") return colors.safe;
  return colors.electric;
}

function statusBackground(finding: NetworkSecurityFinding) {
  if (finding.status === "critical") return "rgba(255, 71, 87, 0.12)";
  if (finding.status === "warning") return "rgba(255, 165, 2, 0.12)";
  if (finding.status === "secure") return "rgba(46, 213, 115, 0.12)";
  return colors.electricSoft;
}

function statusLabel(finding: NetworkSecurityFinding) {
  if (finding.status === "critical") return "Kritisch";
  if (finding.status === "warning") return "Prüfen";
  if (finding.status === "secure") return "Sicher";
  if (finding.status === "not_supported") return "Nicht geprüft";
  return "Unbekannt";
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
  if (device.deviceType === "nas") return "file-tray-stacked";
  if (device.deviceType === "medical") return "medkit";
  if (device.deviceType === "database") return "server";
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
  auditBox: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    marginTop: 16,
    padding: 12
  },
  auditText: {
    flex: 1
  },
  auditTitle: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "900"
  },
  auditDescription: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3
  },
  segmentBox: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    marginTop: 16,
    padding: 12
  },
  segmentTitle: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "900"
  },
  segmentOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  segmentOption: {
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  segmentOptionActive: {
    backgroundColor: colors.electric,
    borderColor: colors.electric
  },
  segmentOptionText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "800"
  },
  segmentOptionTextActive: {
    color: colors.ink
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
  findingRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 7
  },
  methodologyBox: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    marginTop: 16,
    padding: 12
  },
  methodologyTitle: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "900"
  },
  methodologyText: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17
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
  securityCheckRow: {
    alignItems: "flex-start",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    marginBottom: 10,
    padding: 12
  },
  securityCheckIcon: {
    alignItems: "center",
    borderRadius: 8,
    borderWidth: 1,
    height: 38,
    justifyContent: "center",
    width: 38
  },
  securityCheckText: {
    flex: 1,
    minWidth: 0
  },
  securityCheckTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  securityCheckTitle: {
    color: colors.ink,
    flexShrink: 1,
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 19
  },
  securityCheckDetails: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 6
  },
  securityCheckRecommendation: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
    marginTop: 8
  },
  contextQuestionBox: {
    backgroundColor: "rgba(45, 126, 248, 0.1)",
    borderColor: "rgba(45, 126, 248, 0.28)",
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
    marginTop: 10,
    padding: 10
  },
  contextQuestionText: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17
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
