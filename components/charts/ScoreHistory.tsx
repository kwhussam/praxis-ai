import { StyleSheet, Text, View } from "react-native";
import { CartesianChart, Line } from "victory-native";

import { colors } from "@/constants/colors";
import { GlassCard } from "@/components/ui/GlassCard";

type Point = {
  day: string;
  score: number;
};

type ScoreHistoryProps = {
  data: Point[];
};

export function ScoreHistory({ data }: ScoreHistoryProps) {
  return (
    <GlassCard>
      <Text style={styles.title}>Score-Verlauf</Text>
      <View style={styles.chart}>
        <CartesianChart data={data} xKey="day" yKeys={["score"]}>
          {({ points }) => <Line points={points.score} color={colors.electric} strokeWidth={4} animate={{ type: "timing", duration: 500 }} />}
        </CartesianChart>
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  title: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 12
  },
  chart: {
    height: 180
  }
});
