import type { Report } from "@/lib/ai/report";
import type { RiskTone } from "@/constants/colors";
import type { NetworkSecurityFinding } from "@/lib/security/networkProbeTypes";
import type { RuleEvaluation, ScoreReport } from "@/lib/security/scoring";

export type PracticeGuidance = {
  tone: RiskTone;
  headline: string;
  summary: string;
  actions: string[];
};

const FALLBACK_ACTIONS = [
  "Starten Sie den WLAN-Scan und beantworten Sie die offenen Fragen.",
  "Kontaktieren Sie Ihren IT-Dienstleister mit den Ergebnissen.",
  "Legen Sie fest, wer die offenen Punkte bis wann prüft."
];

const SCORE_ACTIONS = {
  critical: [
    "Kontaktieren Sie heute Ihren IT-Dienstleister.",
    "Prüfen Sie Datensicherung, Router und Fernzugänge zuerst.",
    "Starten Sie nach jeder Änderung einen neuen Check."
  ],
  warning: [
    "Beheben Sie zuerst die rot oder gelb markierten Punkte.",
    "Aktivieren Sie eine zweite Bestätigung beim Einloggen.",
    "Lassen Sie die Datensicherung testweise wiederherstellen."
  ],
  safe: [
    "Halten Sie Updates und Datensicherung weiter im Blick.",
    "Wiederholen Sie den Check nach größeren Änderungen.",
    "Speichern Sie die Ergebnisse für die nächste interne Prüfung."
  ]
} satisfies Record<Exclude<RiskTone, "info">, string[]>;

const RULE_ACTIONS: Record<string, string> = {
  MFA_ENABLED: "Aktivieren Sie eine zweite Bestätigung beim Einloggen.",
  BACKUP_TESTED: "Lassen Sie prüfen, ob die Datensicherung täglich läuft und wiederhergestellt werden kann.",
  DMARC_POLICY: "Bitten Sie Ihren IT-Dienstleister, den Schutz gegen gefälschte Praxis-Mails zu härten.",
  PATCHING_CURRENT: "Aktualisieren Sie Router, Computer und Praxissoftware nach einem festen Plan.",
  WLAN_ENCRYPTION: "Stellen Sie das WLAN auf einen aktuellen Schutzstandard mit starkem Passwort um.",
  STAFF_TRAINING: "Schulen Sie das Team zu Phishing, Passwörtern und Datenschutz im Alltag.",
  PRIVACY_DOCUMENTATION: "Aktualisieren Sie Datenschutz-Unterlagen und Zuständigkeiten.",
  SECURITY_RESPONSIBILITIES: "Benennen Sie eine verantwortliche Person für IT-Sicherheit.",
  ACTIVE_FINDINGS: "Arbeiten Sie die gefundenen Warnungen nach Wichtigkeit ab.",
  NETWORK_SECURITY_PROBES: "Lassen Sie offene Netzwerkdienste und Router-Einstellungen prüfen."
};

const FINDING_ACTIONS: Record<string, string> = {
  wifi_encryption: "Stellen Sie das WLAN auf einen aktuellen Schutzstandard mit starkem Passwort um.",
  wps_status: "Schalten Sie die einfache Router-Kopplung aus, wenn sie nicht gebraucht wird.",
  router_http: "Lassen Sie die Router-Oberfläche nur verschlüsselt erreichbar machen.",
  telnet: "Deaktivieren Sie unsichere Fernzugänge am Router oder Gerät.",
  smb: "Beschränken Sie Dateifreigaben auf wirklich benötigte Geräte.",
  smb_security: "Sichern Sie Dateifreigaben gegen Gastzugriff und alte Verbindungen ab.",
  upnp_ssdp: "Schalten Sie automatische Router-Freigaben aus oder dokumentieren Sie jede Ausnahme.",
  rdp: "Beschränken Sie Fernzugriff auf festgelegte Geräte und geschützte Zugänge.",
  database_ports: "Sperren Sie Datenbankzugänge im allgemeinen Praxis-WLAN.",
  printer_services: "Trennen Sie Drucker vom Gäste-WLAN und beschränken Sie Druckdienste.",
  nas_services: "Prüfen Sie Speichergeräte auf Updates, Rechte und getrennte Netze.",
  camera_iot: "Trennen Sie Kameras und Kleingeräte vom Praxisnetz.",
  medical_device_metadata: "Prüfen Sie, ob Medizingeräte vom Gäste- und Druckernetz getrennt sind.",
  ipv6_exposure: "Lassen Sie prüfen, ob neue Internetadressen durch die Firewall geschützt sind.",
  ipv6_reachability: "Beschränken Sie erreichbare Geräte auch für neue Internetadressen.",
  dns_resolver: "Nutzen Sie einen sicheren Namensdienst mit Schutz vor bekannten Schadseiten.",
  dns_security: "Aktivieren Sie Schutzfilter gegen bekannte Schadseiten.",
  dns_filter_test: "Prüfen Sie, ob bekannte Schadseiten blockiert werden.",
  dhcp_consistency: "Dokumentieren Sie Router-Adresse und erlaubte Netzwerkdienste.",
  guest_network: "Richten Sie ein getrenntes Gäste-WLAN ein.",
  network_segmentation: "Trennen Sie Gäste, Praxisgeräte, Drucker und Medizingeräte voneinander.",
  rogue_access_point: "Prüfen Sie unbekannte WLANs mit ähnlichem Praxisnamen.",
  rogue_device: "Klären Sie unbekannte Geräte im Praxisnetz.",
  router_firmware: "Dokumentieren und aktualisieren Sie den Router.",
  default_password_risk: "Ändern und dokumentieren Sie das Router-Adminpasswort.",
  firewall_baseline: "Prüfen Sie Router-Freigaben, Fernzugriff und Firewall-Regeln."
};

export function guidanceFromScore(score: number, actions?: string[]): PracticeGuidance {
  const tone = toneFromScore(score);
  const defaults = SCORE_ACTIONS[tone];

  return {
    tone,
    headline:
      tone === "critical"
        ? "Ihre Praxis ist aktuell stark gefährdet."
        : tone === "warning"
          ? "Ihre Praxis hat sichtbare Sicherheitslücken."
          : "Ihre Praxis wirkt aktuell gut geschützt.",
    summary:
      tone === "critical"
        ? "Bitte behandeln Sie die nächsten Schritte als dringend."
        : tone === "warning"
          ? "Einige Punkte sollten zeitnah geprüft und verbessert werden."
          : "Bleiben Sie trotzdem dran: Sicherheit ist ein laufender Prozess.",
    actions: firstThree(actions, defaults)
  };
}

export function guidanceFromScoreReport(report: ScoreReport): PracticeGuidance {
  const actions = report.rule_results
    .filter((rule) => !rule.passed || rule.evidence_coverage.source === "not_checked" || rule.evidence_coverage.source === "unavailable")
    .sort(sortRulesByUrgency)
    .map((rule) => RULE_ACTIONS[rule.rule_id])
    .filter((action): action is string => Boolean(action));

  return guidanceFromScore(report.score, actions);
}

export function guidanceFromAiReport(report: Report): PracticeGuidance {
  const actions = report.top_risks
    .slice()
    .sort((a, b) => a.rank - b.rank)
    .map((risk) => simplifyAction(risk.action))
    .filter(Boolean);

  return guidanceFromScore(report.security_score, actions);
}

export function guidanceFromNetworkFindings(score: number, findings: NetworkSecurityFinding[]): PracticeGuidance {
  const actions = findings
    .filter((finding) => finding.detected)
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
    .map((finding) => FINDING_ACTIONS[finding.checkId])
    .filter((action): action is string => Boolean(action));

  return guidanceFromScore(score, actions);
}

export function guidanceFromMonitoring(score: number, criticalCount: number): PracticeGuidance {
  const actions = criticalCount > 0
    ? [
        "Kontaktieren Sie Ihren IT-Dienstleister mit den kritischen Warnungen.",
        "Starten Sie nach der Behebung einen neuen Scan.",
        "Prüfen Sie, ob alle wichtigen Domains und E-Mail-Adressen überwacht werden."
      ]
    : [
        "Prüfen Sie neue Warnungen einmal pro Woche.",
        "Halten Sie Domains und E-Mail-Adressen in der Überwachung aktuell.",
        "Exportieren Sie den Bericht für Ihre interne Dokumentation."
      ];

  return guidanceFromScore(score, actions);
}

function toneFromScore(score: number): Exclude<RiskTone, "info"> {
  if (score >= 80) return "safe";
  if (score >= 55) return "warning";
  return "critical";
}

function firstThree(primary: string[] | undefined, fallback = FALLBACK_ACTIONS) {
  const unique = [...new Set([...(primary ?? []), ...fallback].map((item) => item.trim()).filter(Boolean))];
  return unique.slice(0, 3);
}

function sortRulesByUrgency(a: RuleEvaluation, b: RuleEvaluation) {
  const missingA = a.evidence_coverage.source === "not_checked" || a.evidence_coverage.source === "unavailable";
  const missingB = b.evidence_coverage.source === "not_checked" || b.evidence_coverage.source === "unavailable";
  if (missingA !== missingB) return missingA ? -1 : 1;
  return a.points_earned / a.points_max - b.points_earned / b.points_max;
}

function severityRank(severity: NetworkSecurityFinding["severity"]) {
  if (severity === "critical") return 0;
  if (severity === "high") return 1;
  if (severity === "medium") return 2;
  return 3;
}

function simplifyAction(value: string) {
  return value
    .replace(/\bDMARC\b/g, "Schutz gegen gefälschte Praxis-Mails")
    .replace(/\bSPF\b|\bDKIM\b/g, "E-Mail-Schutz")
    .replace(/\bVLANs?\b/g, "getrennte Netze")
    .replace(/\bMFA\b|\b2FA\b/g, "zweite Bestätigung beim Einloggen")
    .replace(/\bDNS\b/g, "Namensdienst")
    .replace(/\bIPv6\b/g, "neue Internetadressen")
    .replace(/\bUPnP\b/g, "automatische Router-Freigaben")
    .replace(/\bSSL\b|\bTLS\b/g, "Verschlüsselung");
}
