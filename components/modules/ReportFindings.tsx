import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { GlassCard } from "@/components/ui/GlassCard";
import { colors } from "@/constants/colors";
import type { EvidenceSource, RuleEvaluation, ScoreReport } from "@/lib/security/scoring";

type ReportFindingsProps = {
  scoreReport: ScoreReport;
};

const moduleLabels: Record<string, string> = {
  MFA_ENABLED: "Zweite Anmeldung",
  BACKUP_TESTED: "Backup",
  DMARC_POLICY: "Schutz gegen gefälschte Praxis-Mails",
  PATCHING_CURRENT: "Updates",
  WLAN_ENCRYPTION: "WLAN-Schutz",
  STAFF_TRAINING: "Schulung",
  PRIVACY_DOCUMENTATION: "DSGVO-Dokumentation",
  SECURITY_RESPONSIBILITIES: "Verantwortlichkeiten",
  ACTIVE_FINDINGS: "Aktive Warnungen",
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
        <View style={styles.list}>
          <Text style={styles.explainer}>
            Lokale Vorschau aus den App-Eingaben. Für Export, Partnerfreigabe und verbindliche Bewertung zählt der
            serverseitig erzeugte Bericht oben.
          </Text>
          {scoreReport.rule_results.map((finding) => (
            <FindingItem key={finding.rule_id} finding={finding} />
          ))}
        </View>
      ) : null}
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
  list: {
    marginTop: 16
  },
  explainer: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 8
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
