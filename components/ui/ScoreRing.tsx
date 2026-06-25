import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { MotiView } from "moti";
import Animated, {
  interpolate,
  useAnimatedProps,
  useSharedValue,
  withTiming
} from "react-native-reanimated";
import Svg, { Circle, G } from "react-native-svg";

import { colors } from "@/constants/colors";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type ScoreRingProps = {
  score: number;
  size?: number;
  stroke?: number;
  label?: string;
};

export function ScoreRing({ score, size = 188, stroke = 16, label = "Shield Score" }: ScoreRingProps) {
  const progress = useSharedValue(0);
  const [displayScore, setDisplayScore] = useState(0);
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clampedScore = Math.max(0, Math.min(100, score));
  const scoreColor = useMemo(() => scoreToColor(clampedScore), [clampedScore]);
  const isCritical = clampedScore < 45;

  useEffect(() => {
    progress.value = withTiming(clampedScore, { duration: 900 });
  }, [clampedScore, progress]);

  useEffect(() => {
    const duration = 900;
    const start = displayScore;
    const delta = clampedScore - start;
    const startedAt = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const ratio = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - ratio, 3);
      setDisplayScore(Math.round(start + delta * eased));
      if (ratio === 1) clearInterval(interval);
    }, 16);

    return () => clearInterval(interval);
  }, [clampedScore]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: interpolate(progress.value, [0, 100], [circumference, 0])
  }));

  return (
    <View style={[styles.wrap, { height: size, width: size }]}>
      {isCritical ? (
        <MotiView
          from={{ opacity: 0.28, scale: 0.92 }}
          animate={{ opacity: 0, scale: 1.18 }}
          transition={{ loop: true, type: "timing", duration: 1500 }}
          style={[styles.criticalPulse, { borderRadius: size / 2, height: size, width: size }]}
        />
      ) : null}
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="rgba(255,255,255,0.1)"
          strokeWidth={stroke}
          fill="transparent"
        />
        <G rotation="-90" originX={size / 2} originY={size / 2}>
          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={scoreColor}
            strokeWidth={stroke}
            fill="transparent"
            strokeDasharray={`${circumference} ${circumference}`}
            animatedProps={animatedProps}
            strokeLinecap="round"
          />
        </G>
      </Svg>
      <View style={styles.scoreContent}>
        <Text style={[styles.score, { color: scoreColor }]}>{displayScore}</Text>
        <Text style={styles.caption}>{label}</Text>
      </View>
    </View>
  );
}

function scoreToColor(score: number) {
  if (score < 35) return blend(colors.critical, colors.warning, score / 35);
  if (score < 65) return blend(colors.warning, "#FFD43B", (score - 35) / 30);
  return blend("#FFD43B", colors.safe, (score - 65) / 35);
}

function blend(from: string, to: string, amount: number) {
  const ratio = Math.max(0, Math.min(1, amount));
  const start = hexToRgb(from);
  const end = hexToRgb(to);
  const next = start.map((channel, index) => Math.round(channel + (end[index] - channel) * ratio));
  return `rgb(${next[0]}, ${next[1]}, ${next[2]})`;
}

function hexToRgb(hex: string) {
  const normalized = hex.replace("#", "");
  return [
    parseInt(normalized.slice(0, 2), 16),
    parseInt(normalized.slice(2, 4), 16),
    parseInt(normalized.slice(4, 6), 16)
  ];
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center"
  },
  criticalPulse: {
    borderColor: colors.critical,
    borderWidth: 2,
    position: "absolute"
  },
  scoreContent: {
    position: "absolute",
    alignItems: "center"
  },
  score: {
    color: colors.ink,
    fontSize: 48,
    fontWeight: "900",
    letterSpacing: 0
  },
  caption: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase"
  }
});
