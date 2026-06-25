import { StyleSheet, Text, View } from "react-native";

import { colors } from "@/constants/colors";
import { GlassCard } from "@/components/ui/GlassCard";

type DomainCheckProps = {
  domain: string;
  checks: Array<{ label: string; status: "ok" | "warn" | "critical" }>;
};

export function DomainCheck({ domain, checks }: DomainCheckProps) {
  return (
    <GlassCard>
      <Text style={styles.eyebrow}>Externer Praxis-Check</Text>
      <Text style={styles.domain}>{domain}</Text>
      <View style={styles.list}>
        {checks.map((check) => (
          <View key={check.label} style={styles.row}>
            <View style={[styles.dot, { backgroundColor: statusColor(check.status) }]} />
            <Text style={styles.label}>{check.label}</Text>
          </View>
        ))}
      </View>
    </GlassCard>
  );
}

function statusColor(status: "ok" | "warn" | "critical") {
  if (status === "ok") return colors.safe;
  if (status === "warn") return colors.warning;
  return colors.critical;
}

const styles = StyleSheet.create({
  eyebrow: {
    color: colors.electric,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase"
  },
  domain: {
    color: colors.ink,
    fontSize: 24,
    fontWeight: "900",
    marginTop: 8
  },
  list: {
    marginTop: 18,
    gap: 12
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  dot: {
    height: 10,
    width: 10,
    borderRadius: 10
  },
  label: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "600"
  }
});
