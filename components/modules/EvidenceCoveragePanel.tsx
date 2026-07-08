import { StyleSheet, Text, View } from "react-native";

import { GlassCard } from "@/components/ui/GlassCard";
import { colors } from "@/constants/colors";
import type { EvidenceSource, ScoreReport } from "@/lib/security/scoring";

type EvidenceCoveragePanelProps = {
  report: ScoreReport;
};

const moduleLabels: Record<string, string> = {
  MFA_ENABLED: "MFA",
  BACKUP_TESTED: "Backups",
  DMARC_POLICY: "DMARC",
  PATCHING_CURRENT: "Updates",
  WLAN_ENCRYPTION: "WLAN",
  STAFF_TRAINING: "Schulung",
  PRIVACY_DOCUMENTATION: "DSGVO-Doku",
  ACTIVE_FINDINGS: "Findings",
  NETWORK_SECURITY_PROBES: "Netzwerk"
};

const sourceColors: Record<EvidenceSource, string> = {
  measured: colors.safe,
  inferred: colors.electric,
  self_reported: colors.warning,
  unavailable: colors.muted
};

export function EvidenceCoveragePanel({ report }: EvidenceCoveragePanelProps) {
  return (
    <GlassCard style={styles.card}>
      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>Evidence & Coverage</Text>
          <Text style={styles.title}>Prüfmodule</Text>
        </View>
        <Text style={styles.score}>{report.evidence_coverage_score}/100</Text>
      </View>

      <View style={styles.rows}>
        {report.rule_results.map((rule) => (
          <View key={rule.rule_id} style={styles.row}>
            <View style={styles.module}>
              <Text style={styles.moduleName}>{moduleLabels[rule.rule_id] ?? rule.rule_id}</Text>
              <Text style={styles.moduleMeta}>{rule.points_earned}/{rule.points_max} Punkte</Text>
            </View>
            <View style={styles.coverage}>
              <Text style={[styles.source, { color: sourceColors[rule.evidence_coverage.source] }]}>
                {rule.evidence_coverage.label}
              </Text>
              <Text style={styles.coverageScore}>{rule.evidence_coverage.score}/100</Text>
            </View>
          </View>
        ))}
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 18
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
    fontSize: 22,
    fontWeight: "900",
    marginTop: 5
  },
  score: {
    color: colors.ink,
    fontSize: 26,
    fontWeight: "900"
  },
  rows: {
    marginTop: 16
  },
  row: {
    alignItems: "center",
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    minHeight: 58,
    paddingVertical: 10
  },
  module: {
    flex: 1
  },
  moduleName: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "800"
  },
  moduleMeta: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4
  },
  coverage: {
    alignItems: "flex-end",
    minWidth: 112
  },
  source: {
    fontSize: 13,
    fontWeight: "900"
  },
  coverageScore: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 4
  }
});
