import { BlurView } from "expo-blur";
import { MotiView } from "moti";
import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { colors, riskColors, type RiskTone } from "@/constants/colors";

type GlassCardProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  delay?: number;
  intensity?: number;
  tone?: RiskTone;
  criticalGlow?: boolean;
};

export function GlassCard({
  children,
  style,
  delay = 0,
  intensity = 24,
  tone,
  criticalGlow = tone === "critical"
}: GlassCardProps) {
  const accent = tone ? riskColors[tone] : colors.electric;

  return (
    <MotiView
      from={{ opacity: 0, translateY: 16, scale: 0.98 }}
      animate={{ opacity: 1, translateY: 0, scale: 1 }}
      transition={{ type: "timing", duration: 420, delay }}
      style={[
        styles.shell,
        tone ? { borderColor: `${accent}55`, shadowColor: accent } : null,
        criticalGlow ? styles.criticalShadow : null,
        style
      ]}
    >
      <BlurView intensity={intensity} tint="dark" style={styles.blur}>
        {criticalGlow ? (
          <MotiView
            from={{ opacity: 0.24, scale: 0.92 }}
            animate={{ opacity: 0.42, scale: 1.04 }}
            transition={{ loop: true, type: "timing", duration: 1800 }}
            style={[styles.innerGlow, { backgroundColor: `${colors.critical}28` }]}
          />
        ) : null}
        <View style={styles.content}>
          {children}
        </View>
      </BlurView>
    </MotiView>
  );
}

const styles = StyleSheet.create({
  shell: {
    overflow: "hidden",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.glass,
    shadowColor: colors.electric,
    shadowOpacity: 0.18,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 18 }
  },
  criticalShadow: {
    shadowOpacity: 0.28,
    shadowRadius: 34
  },
  blur: {
    overflow: "hidden"
  },
  content: {
    padding: 20
  },
  innerGlow: {
    borderRadius: 220,
    height: 180,
    position: "absolute",
    right: -70,
    top: -80,
    width: 180
  }
});
