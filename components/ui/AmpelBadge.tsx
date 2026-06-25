import { MotiView } from "moti";
import { StyleSheet, Text, View } from "react-native";

import { colors, riskColors, type RiskTone } from "@/constants/colors";

const labels: Record<RiskTone, string> = {
  critical: "Kritisch",
  warning: "Achtung",
  safe: "Sicher",
  info: "Info"
};

type AmpelBadgeProps = {
  tone: RiskTone;
  label?: string;
  pulsing?: boolean;
};

export function AmpelBadge({ tone, label = labels[tone], pulsing = false }: AmpelBadgeProps) {
  const color = riskColors[tone];

  return (
    <View style={[styles.badge, { borderColor: color, backgroundColor: `${color}1F` }]}>
      <View style={styles.dotWrap}>
        {pulsing ? (
          <MotiView
            from={{ opacity: 0.55, scale: 0.8 }}
            animate={{ opacity: 0, scale: 2.4 }}
            transition={{ loop: true, type: "timing", duration: 1500 }}
            style={[styles.pulse, { backgroundColor: color }]}
          />
        ) : null}
        <View style={[styles.dot, { backgroundColor: color }]} />
      </View>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  dotWrap: {
    height: 10,
    width: 10,
    alignItems: "center",
    justifyContent: "center"
  },
  pulse: {
    position: "absolute",
    height: 10,
    width: 10,
    borderRadius: 999
  },
  dot: {
    height: 8,
    width: 8,
    borderRadius: 999
  },
  label: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "700"
  }
});
