import { Ionicons } from "@expo/vector-icons";
import { MotiView } from "moti";
import type { ComponentProps } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle, G } from "react-native-svg";

import { colors } from "@/constants/colors";

type IoniconName = ComponentProps<typeof Ionicons>["name"];

export type ScanNode = {
  id: string;
  icon?: IoniconName;
  tone?: string;
  hasFinding?: boolean;
};

type ScanAnimationProps = {
  nodes?: ScanNode[];
  scanning?: boolean;
  progress?: number;
  size?: number;
};

const nodePositions = [
  { left: "43%", top: "44%" },
  { left: "12%", top: "24%" },
  { left: "70%", top: "18%" },
  { left: "74%", top: "64%" },
  { left: "18%", top: "70%" },
  { left: "45%", top: "10%" },
  { left: "42%", top: "78%" }
] as const;

export function ScanAnimation({ nodes = [], scanning = false, progress = 0, size = 300 }: ScanAnimationProps) {
  const radius = size / 2 - 12;
  const circumference = 2 * Math.PI * radius;
  const clampedProgress = Math.max(0, Math.min(1, progress));

  return (
    <View style={[styles.radar, { maxWidth: size, width: "100%" }]}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${size} ${size}`} style={styles.progressSvg}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={3}
          fill="transparent"
        />
        <G rotation="-90" originX={size / 2} originY={size / 2}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={colors.electric}
            strokeWidth={3}
            fill="transparent"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={circumference * (1 - clampedProgress)}
            strokeLinecap="round"
          />
        </G>
      </Svg>

      <MotiView
        from={{ rotate: "0deg" }}
        animate={{ rotate: scanning ? "360deg" : "80deg" }}
        transition={{ loop: scanning, type: "timing", duration: 2400 }}
        style={styles.radarSweep}
      />

      {[0, 1, 2].map((ring) => (
        <MotiView
          key={ring}
          from={{ opacity: 0.2, scale: 0.84 }}
          animate={{ opacity: scanning ? 0.03 : 0.11, scale: scanning ? 1.08 + ring * 0.08 : 1 }}
          transition={{ loop: scanning, type: "timing", duration: 1700, delay: ring * 240 }}
          style={[styles.radarRing, { height: 76 + ring * 54, width: 76 + ring * 54 }]}
        />
      ))}

      <MotiView
        animate={{ scale: scanning ? [1, 1.08, 1] : 1 }}
        transition={{ loop: scanning, type: "timing", duration: 1300 }}
        style={styles.centerNode}
      >
        <Ionicons name="wifi" size={22} color={colors.ink} />
      </MotiView>

      {nodes.slice(0, nodePositions.length).map((node, index) => (
        <DeviceNode key={node.id} node={node} index={index} />
      ))}
    </View>
  );
}

function DeviceNode({ node, index }: { node: ScanNode; index: number }) {
  const position = nodePositions[index] ?? nodePositions[0];
  const tone = node.tone ?? colors.safe;

  return (
    <MotiView
      from={{ opacity: 0, scale: 0.4 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", delay: 120 + index * 90 }}
      style={[styles.deviceNode, position, { borderColor: tone }]}
    >
      <Ionicons name={node.icon ?? "hardware-chip"} size={16} color={tone} />
      {node.hasFinding ? <View style={styles.findingDot} /> : null}
    </MotiView>
  );
}

const styles = StyleSheet.create({
  radar: {
    alignItems: "center",
    alignSelf: "center",
    aspectRatio: 1,
    backgroundColor: "rgba(3, 12, 26, 0.72)",
    borderColor: "rgba(45, 126, 248, 0.24)",
    borderRadius: 160,
    borderWidth: 1,
    justifyContent: "center",
    overflow: "hidden"
  },
  progressSvg: {
    left: 0,
    position: "absolute",
    top: 0
  },
  radarSweep: {
    backgroundColor: "rgba(45, 126, 248, 0.32)",
    height: "50%",
    left: "50%",
    position: "absolute",
    top: 0,
    width: 2
  },
  radarRing: {
    borderColor: colors.electric,
    borderRadius: 999,
    borderWidth: 1,
    position: "absolute"
  },
  centerNode: {
    alignItems: "center",
    backgroundColor: colors.electric,
    borderRadius: 999,
    height: 54,
    justifyContent: "center",
    shadowColor: colors.electric,
    shadowOpacity: 0.38,
    shadowRadius: 20,
    width: 54
  },
  deviceNode: {
    alignItems: "center",
    backgroundColor: colors.navy,
    borderRadius: 999,
    borderWidth: 1,
    height: 34,
    justifyContent: "center",
    position: "absolute",
    width: 34
  },
  findingDot: {
    backgroundColor: colors.critical,
    borderRadius: 999,
    height: 9,
    position: "absolute",
    right: -1,
    top: -1,
    width: 9
  }
});
