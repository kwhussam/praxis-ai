import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { GlassCard } from "@/components/ui/GlassCard";
import { colors } from "@/constants/colors";
import type { EvidenceSource, ScoreReport } from "@/lib/security/scoring";

type EvidenceCoveragePanelProps = {
  report: ScoreReport;
};

const moduleLabels: Record<string, string> = {
  MFA_ENABLED: "Zweite Anmeldung",
  BACKUP_TESTED: "Backups",
  DMARC_POLICY: "Schutz gegen gefälschte Praxis-Mails",
  PATCHING_CURRENT: "Updates",
  WLAN_ENCRYPTION: "WLAN",
  STAFF_TRAINING: "Schulung",
  PRIVACY_DOCUMENTATION: "DSGVO-Doku",
  SECURITY_RESPONSIBILITIES: "Verantwortung",
  ACTIVE_FINDINGS: "Aktive Warnungen",
  NETWORK_SECURITY_PROBES: "Netzwerk"
};

const sourceColors: Record<EvidenceSource, string> = {
  measured: colors.safe,
  inferred: colors.electric,
  self_reported: colors.warning,
  not_checked: colors.muted,
  unavailable: colors.muted
};

export function EvidenceCoveragePanel({ report }: EvidenceCoveragePanelProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <GlassCard style={styles.card}>
      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>Für technisch Interessierte</Text>
          <Text style={styles.title}>Prüfdetails</Text>
        </View>
        <Pressable style={styles.detailsButton} onPress={() => setExpanded((current) => !current)}>
          <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={16} color={colors.ink} />
          <Text style={styles.detailsButtonText}>{expanded ? "Details ausblenden" : "Details anzeigen"}</Text>
        </Pressable>
      </View>

      {expanded ? (
        <View style={styles.rows}>
          <Text style={styles.explainer}>
            Diese Werte zeigen, wie belastbar die Prüfung war. Sie sind für IT-Partner gedacht und müssen nicht von Ihnen
            bewertet werden.
          </Text>
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
      ) : null}
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
  detailsButton: {
    alignItems: "center",
    backgroundColor: colors.glassStrong,
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  detailsButtonText: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: "900"
  },
  rows: {
    marginTop: 16
  },
  explainer: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 8
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
