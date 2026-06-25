import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line, Polygon, Text as SvgText } from "react-native-svg";

import { colors } from "@/constants/colors";
import { GlassCard } from "@/components/ui/GlassCard";

type RadarDatum = {
  label: string;
  value: number;
};

type RadarChartProps = {
  title: string;
  data: RadarDatum[];
};

export function RadarChart({ title, data }: RadarChartProps) {
  const size = 230;
  const center = size / 2;
  const radius = 78;
  const points = data.map((item, index) => {
    const angle = (Math.PI * 2 * index) / data.length - Math.PI / 2;
    const valueRadius = radius * (Math.max(0, Math.min(100, item.value)) / 100);
    return {
      x: center + Math.cos(angle) * valueRadius,
      y: center + Math.sin(angle) * valueRadius,
      labelX: center + Math.cos(angle) * (radius + 26),
      labelY: center + Math.sin(angle) * (radius + 26),
      axisX: center + Math.cos(angle) * radius,
      axisY: center + Math.sin(angle) * radius,
      label: item.label
    };
  });

  return (
    <GlassCard>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.chart}>
        <Svg width={size} height={size}>
          {[0.33, 0.66, 1].map((ring) => (
            <Circle key={ring} cx={center} cy={center} r={radius * ring} fill="transparent" stroke="rgba(255,255,255,0.12)" />
          ))}
          {points.map((point) => (
            <Line key={point.label} x1={center} y1={center} x2={point.axisX} y2={point.axisY} stroke="rgba(255,255,255,0.12)" />
          ))}
          <Polygon
            points={points.map((point) => `${point.x},${point.y}`).join(" ")}
            fill="rgba(45,126,248,0.28)"
            stroke={colors.electric}
            strokeWidth={2}
          />
          {points.map((point) => (
            <SvgText key={point.label} x={point.labelX} y={point.labelY} fill={colors.muted} fontSize="10" textAnchor="middle">
              {point.label}
            </SvgText>
          ))}
        </Svg>
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  title: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "900"
  },
  chart: {
    alignItems: "center"
  }
});
