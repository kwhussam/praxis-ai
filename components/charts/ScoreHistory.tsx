import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line, Path, Text as SvgText } from "react-native-svg";

import { colors } from "@/constants/colors";
import { GlassCard } from "@/components/ui/GlassCard";

type Point = {
  day: string;
  score: number;
};

type ScoreHistoryProps = {
  data: Point[];
};

const chartWidth = 300;
const chartHeight = 160;
const padding = 24;

export function ScoreHistory({ data }: ScoreHistoryProps) {
  const normalizedData = data.length ? data : [{ day: "-", score: 0 }];
  const xStep = normalizedData.length > 1 ? (chartWidth - padding * 2) / (normalizedData.length - 1) : 0;
  const points = normalizedData.map((item, index) => {
    const clampedScore = Math.max(0, Math.min(100, item.score));
    const x = padding + xStep * index;
    const y = padding + (chartHeight - padding * 2) * (1 - clampedScore / 100);

    return { ...item, x, y };
  });
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");

  return (
    <GlassCard>
      <Text style={styles.title}>Score-Verlauf</Text>
      <View style={styles.chart}>
        <Svg width="100%" height={chartHeight} viewBox={`0 0 ${chartWidth} ${chartHeight}`}>
          {[0, 50, 100].map((score) => {
            const y = padding + (chartHeight - padding * 2) * (1 - score / 100);
            return (
              <Line
                key={score}
                x1={padding}
                y1={y}
                x2={chartWidth - padding}
                y2={y}
                stroke="rgba(255,255,255,0.12)"
                strokeWidth={1}
              />
            );
          })}
          <Path d={path} fill="none" stroke={colors.electric} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
          {points.map((point) => (
            <Circle key={`${point.day}-${point.score}`} cx={point.x} cy={point.y} r={4} fill={colors.electric} />
          ))}
          {points.map((point, index) =>
            index === 0 || index === points.length - 1 ? (
              <SvgText key={point.day} x={point.x} y={chartHeight - 4} fill={colors.muted} fontSize="10" textAnchor="middle">
                {point.day}
              </SvgText>
            ) : null
          )}
        </Svg>
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
    height: 180,
    justifyContent: "center"
  }
});
