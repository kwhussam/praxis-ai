import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { AmpelBadge } from "@/components/ui/AmpelBadge";
import { GlassCard } from "@/components/ui/GlassCard";
import { colors, riskColors } from "@/constants/colors";
import type { PracticeGuidance } from "@/lib/security/practiceGuidance";

type PracticeGuidanceCardProps = {
  guidance: PracticeGuidance;
  compact?: boolean;
};

export function PracticeGuidanceCard({ guidance, compact = false }: PracticeGuidanceCardProps) {
  return (
    <GlassCard tone={guidance.tone} criticalGlow={guidance.tone === "critical"} style={compact ? styles.compactCard : styles.card}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.kicker}>Einordnung</Text>
          <Text style={styles.headline}>{guidance.headline}</Text>
        </View>
        <AmpelBadge tone={guidance.tone} pulsing={guidance.tone === "critical"} />
      </View>
      <Text style={styles.summary}>{guidance.summary}</Text>

      <View style={styles.actions}>
        <Text style={styles.actionsTitle}>Was muss ich jetzt tun?</Text>
        {guidance.actions.slice(0, 3).map((action, index) => (
          <View key={`${index}-${action}`} style={styles.actionRow}>
            <View style={[styles.actionIndex, { backgroundColor: riskColors[guidance.tone] }]}>
              <Text style={styles.actionIndexText}>{index + 1}</Text>
            </View>
            <Text style={styles.actionText}>{action}</Text>
          </View>
        ))}
      </View>

      {compact ? null : (
        <View style={styles.note}>
          <Ionicons name="information-circle" size={16} color={colors.electric} />
          <Text style={styles.noteText}>Die Empfehlungen ersetzen keine IT-Prüfung vor Ort, helfen aber bei der nächsten klaren Entscheidung.</Text>
        </View>
      )}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 18
  },
  compactCard: {
    marginTop: 14
  },
  header: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between"
  },
  headerText: {
    flex: 1
  },
  kicker: {
    color: colors.electric,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  headline: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: "900",
    lineHeight: 28,
    marginTop: 6
  },
  summary: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 10
  },
  actions: {
    gap: 10,
    marginTop: 18
  },
  actionsTitle: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: "900"
  },
  actionRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10
  },
  actionIndex: {
    alignItems: "center",
    borderRadius: 999,
    height: 24,
    justifyContent: "center",
    marginTop: 1,
    width: 24
  },
  actionIndexText: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: "900"
  },
  actionText: {
    color: colors.ink,
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 21
  },
  note: {
    alignItems: "flex-start",
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 8,
    marginTop: 18,
    paddingTop: 14
  },
  noteText: {
    color: colors.muted,
    flex: 1,
    fontSize: 12,
    lineHeight: 18
  }
});
