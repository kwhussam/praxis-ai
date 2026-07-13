import { StyleSheet, Text, View } from "react-native";

import { colors, type RiskTone } from "@/constants/colors";
import { AmpelBadge } from "@/components/ui/AmpelBadge";
import { GlassCard } from "@/components/ui/GlassCard";
import { PracticeGuidanceCard } from "@/components/modules/PracticeGuidanceCard";
import type { Report } from "@/lib/ai/report";
import { guidanceFromAiReport } from "@/lib/security/practiceGuidance";

type AiReportProps = {
  report: Report;
};

export function AiReport({ report }: AiReportProps) {
  const guidance = guidanceFromAiReport(report);

  return (
    <View>
      <PracticeGuidanceCard guidance={guidance} />
      <GlassCard>
        <View style={styles.header}>
          <Text style={styles.kicker}>Praxis-Bericht</Text>
          <AmpelBadge tone={ampelTone(report.ampel)} label={ampelLabel(report.ampel)} pulsing={report.ampel === "rot"} />
        </View>
        <Text style={styles.scoreLabel}>Sicherheitswert</Text>
        <Text style={styles.score}>{report.security_score}/100</Text>
        <Text style={styles.summary}>{report.executive_summary}</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Weitere Hinweise</Text>
          {report.top_risks.slice(0, 3).map((risk) => (
            <View key={`${risk.rank}-${risk.title}`} style={styles.risk}>
              <Text style={styles.rank}>{risk.rank}</Text>
              <View style={styles.riskText}>
                <Text style={styles.riskTitle}>{risk.title}</Text>
                <Text style={styles.riskCopy}>{risk.plain_language}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Nicht geprüft / technische Einschränkungen</Text>
          {report.not_checked_limitations.length > 0 ? (
            report.not_checked_limitations.slice(0, 3).map((limitation) => (
              <View key={`${limitation.area}-${limitation.reason}`} style={styles.limitation}>
                <Text style={styles.limitationTitle}>{limitation.area}</Text>
                <Text style={styles.riskCopy}>{limitation.impact}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.riskCopy}>Keine Einschränkungen im KI-Bericht angegeben. Positive Aussagen gelten nur für tatsächlich geprüfte Bereiche.</Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Schnell erledigt</Text>
          {report.quick_wins.slice(0, 3).map((quickWin) => (
            <View key={quickWin.action} style={styles.quickWin}>
              <Text style={styles.quickWinText}>{quickWin.action}</Text>
              <Text style={styles.minutes}>{quickWin.time_minutes} Min.</Text>
            </View>
          ))}
        </View>
      </GlassCard>
    </View>
  );
}

function ampelTone(ampel: Report["ampel"]): RiskTone {
  if (ampel === "rot") return "critical";
  if (ampel === "gelb") return "warning";
  return "safe";
}

function ampelLabel(ampel: Report["ampel"]) {
  if (ampel === "rot") return "Dringend";
  if (ampel === "gelb") return "Prüfen";
  return "Gut";
}

const styles = StyleSheet.create({
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12
  },
  kicker: {
    color: colors.electric,
    flex: 1,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  score: {
    color: colors.ink,
    fontSize: 34,
    fontWeight: "900",
    marginTop: 2
  },
  scoreLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "900",
    marginTop: 18,
    textTransform: "uppercase"
  },
  summary: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "700",
    lineHeight: 26,
    marginTop: 10
  },
  section: {
    marginTop: 22,
    gap: 12
  },
  sectionTitle: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  risk: {
    flexDirection: "row",
    gap: 12
  },
  rank: {
    backgroundColor: colors.electric,
    borderRadius: 999,
    color: colors.ink,
    fontWeight: "900",
    height: 28,
    lineHeight: 28,
    textAlign: "center",
    width: 28
  },
  riskText: {
    flex: 1
  },
  riskTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "800"
  },
  riskCopy: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 3
  },
  riskMeta: {
    color: colors.electric,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 18,
    marginTop: 6
  },
  limitation: {
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12
  },
  limitationTitle: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "900",
    marginBottom: 3
  },
  quickWin: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
    padding: 12
  },
  quickWinText: {
    color: colors.ink,
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20
  },
  minutes: {
    color: colors.safe,
    fontSize: 12,
    fontWeight: "900"
  }
});
