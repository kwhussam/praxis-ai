import * as Haptics from "expo-haptics";
import { MotiView } from "moti";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";

import { colors } from "@/constants/colors";

type AnimatedButtonProps = {
  label: string;
  onPress: () => void;
  icon?: ReactNode;
  variant?: "primary" | "danger" | "ghost";
  style?: StyleProp<ViewStyle>;
};

export function AnimatedButton({ label, onPress, icon, variant = "primary", style }: AnimatedButtonProps) {
  const isDanger = variant === "danger";
  const isGhost = variant === "ghost";

  async function handlePress() {
    await Haptics.impactAsync(isDanger ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Light);
    onPress();
  }

  return (
    <Pressable onPress={handlePress}>
      {({ pressed }) => (
        <MotiView
          animate={{ scale: pressed ? 0.97 : 1, opacity: pressed ? 0.86 : 1 }}
          transition={{ type: "timing", duration: 160 }}
          style={[
            styles.button,
            isGhost ? styles.ghost : isDanger ? styles.danger : styles.primary,
            style
          ]}
        >
          {icon}
          <Text style={styles.label}>{label}</Text>
        </MotiView>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 54,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 18
  },
  primary: {
    backgroundColor: colors.electric,
    shadowColor: colors.electric,
    shadowOpacity: 0.36,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 }
  },
  danger: {
    backgroundColor: colors.critical,
    shadowColor: colors.critical,
    shadowOpacity: 0.34,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 }
  },
  ghost: {
    backgroundColor: colors.glassStrong,
    borderColor: colors.border,
    borderWidth: 1
  },
  label: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "800"
  }
});
