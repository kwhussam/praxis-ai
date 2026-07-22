import { StyleSheet, Text, View } from "react-native";
import { MotiView } from "moti";

import { colors } from "@/constants/colors";
import { GlassCard } from "@/components/ui/GlassCard";

type BarDatum = {
  label: string;
  value: number;
  color?: string;
};

type BarChartProps = {
  title: string;
  data: BarDatum[];
  showValues?: boolean;
};

export function BarChart({ title, data, showValues = false }: BarChartProps) {
  return (
    <GlassCard>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.rows}>
        {data.map((item) => (
          <View
            key={item.label}
            accessible
            accessibilityLabel={`${item.label}: ${item.value} von 100`}
            style={styles.row}
          >
            <Text style={styles.label}>{item.label}</Text>
            <View style={styles.track}>
              <MotiView
                from={{ width: "4%" }}
                animate={{ width: `${Math.max(4, Math.min(100, item.value))}%` }}
                transition={{ type: "timing", duration: 650 }}
                style={[styles.fill, { backgroundColor: item.color ?? colors.electric }]}
              />
            </View>
            {showValues ? <Text style={styles.value}>{item.value}</Text> : null}
          </View>
        ))}
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  title: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 16
  },
  rows: {
    gap: 14
  },
  row: {
    gap: 8
  },
  label: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700"
  },
  track: {
    height: 10,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.1)"
  },
  fill: {
    height: "100%",
    borderRadius: 999
  },
  value: {
    position: "absolute",
    right: 0,
    top: 0,
    color: colors.ink,
    fontSize: 13,
    fontWeight: "900"
  }
});
