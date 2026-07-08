import { StyleSheet, Text, View } from "react-native";

import { GlassCard } from "@/components/ui/GlassCard";
import { colors } from "@/constants/colors";
import type { EvidenceSource, RuleEvaluation, ScoreReport } from "@/lib/security/scoring";

type ReportFindingsProps = {
  scoreReport: ScoreReport;
};

const moduleLabels: Record<string, string> = {
  MFA_ENABLED: "MFA",
  BACKUP_TESTED: "Backup",
  DMARC_POLICY: "DMARC",
  PATCHING_CURRENT: "Updates",
  WLAN_ENCRYPTION: "WLAN-Verschlüsselung",
  STAFF_TRAINING: "Schulung",
  PRIVACY_DOCUMENTATION: "DSGVO-Dokumentation",
  SECURITY_RESPONSIBILITIES: "Verantwortlichkeiten",
  ACTIVE_FINDINGS: "Aktive Findings",
  NETWORK_SECURITY_PROBES: "Netzwerkprüfungen"
};

const sourceColors: Record<EvidenceSource, string> = {
  measured: colors.safe,
  inferred: colors.warning,
  self_reported: colors.info,
  not_checked: colors.muted,
  unavailable: colors.critical
};

export function ReportFindings({ scoreReport }: ReportFindingsProps) {
  return (
    <GlassCard style={styles.card}>
      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>Befunde</Text>
          <Text style={styles.title}>Nachweisart je Prüfmodul</Text>
        </View>
        <Text style={styles.coverage}>{scoreReport.evidence_coverage_score}/100</Text>
      </View>

      <View style={styles.list}>
        {scoreReport.rule_results.map((finding) => (
          <FindingItem key={finding.rule_id} finding={finding} />
        ))}
      </View>
    </GlassCard>
  );
}

function FindingItem({ finding }: { finding: RuleEvaluation }) {
  const sourceColor = sourceColors[finding.evidence_coverage.source];

  return (
    <View style={styles.finding}>
      <View style={styles.findingHeader}>
        <View style={styles.findingTitleWrap}>
          <Text style={styles.findingTitle}>{moduleLabels[finding.rule_id] ?? finding.rule_id}</Text>
          <Text style={styles.points}>
            {finding.points_earned}/{finding.points_max} Punkte · {finding.passed ? "Bestanden" : "Offen"}
          </Text>
        </View>
        <View style={[styles.sourceBadge, { borderColor: sourceColor, backgroundColor: `${sourceColor}1A` }]}>
          <Text style={[styles.sourceText, { color: sourceColor }]}>{finding.evidence_coverage.label}</Text>
        </View>
      </View>
      <Text style={styles.findingText}>{finding.finding}</Text>
      <Text style={styles.evidenceText}>{finding.evidence_coverage.detail}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 16
  },
  header: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 14,
    justifyContent: "space-between"
  },
  kicker: {
    color: colors.electric,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  title: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: "900",
    marginTop: 5
  },
  coverage: {
    color: colors.ink,
    fontSize: 24,
    fontWeight: "900"
  },
  list: {
    marginTop: 16
  },
  finding: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    paddingVertical: 14
  },
  findingHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between"
  },
  findingTitleWrap: {
    flex: 1
  },
  findingTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "900"
  },
  points: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4
  },
  sourceBadge: {
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 1,
    minWidth: 104,
    paddingHorizontal: 9,
    paddingVertical: 5
  },
  sourceText: {
    fontSize: 11,
    fontWeight: "900"
  },
  findingText: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
    marginTop: 10
  },
  evidenceText: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6
  }
});
