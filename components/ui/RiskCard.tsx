import { StyleSheet, Text, View } from "react-native";

import { colors, type RiskTone } from "@/constants/colors";
import { AmpelBadge } from "@/components/ui/AmpelBadge";
import { GlassCard } from "@/components/ui/GlassCard";

type RiskCardProps = {
  title: string;
  description: string;
  tone: RiskTone;
  metric?: string;
  delay?: number;
};

export function RiskCard({ title, description, tone, metric, delay }: RiskCardProps) {
  return (
    <GlassCard delay={delay} style={styles.card}>
      <View style={styles.header}>
        <AmpelBadge tone={tone} pulsing={tone === "critical"} />
        {metric ? <Text style={styles.metric}>{metric}</Text> : null}
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 14
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18
  },
  metric: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "900"
  },
  title: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 8
  },
  description: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22
  }
});
