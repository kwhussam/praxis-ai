import { MotiView } from "moti";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { colors, type RiskTone } from "@/constants/colors";

type AmpelStatus = "red" | "yellow" | "green" | RiskTone;

type AmpelKomponenteProps = {
  status: AmpelStatus;
  size?: number;
  style?: StyleProp<ViewStyle>;
};

const lightMap = {
  red: colors.critical,
  yellow: colors.warning,
  green: colors.safe
} as const;

export function AmpelKomponente({ status, size = 16, style }: AmpelKomponenteProps) {
  const active = normalizeStatus(status);

  return (
    <View style={[styles.wrap, style]}>
      {(["red", "yellow", "green"] as const).map((light) => {
        const isActive = active === light;
        const color = lightMap[light];

        return (
          <View key={light} style={[styles.lightSlot, { height: size + 10, width: size + 10 }]}>
            {isActive ? (
              <MotiView
                from={{ opacity: 0.42, scale: 0.8 }}
                animate={{ opacity: 0.08, scale: 2.2 }}
                transition={{ loop: true, type: "timing", duration: 1600 }}
                style={[styles.halo, { backgroundColor: color, height: size, width: size }]}
              />
            ) : null}
            <MotiView
              animate={{ opacity: isActive ? 1 : 0.28, scale: isActive ? 1 : 0.86 }}
              transition={{ type: "timing", duration: 260 }}
              style={[
                styles.light,
                {
                  backgroundColor: color,
                  height: size,
                  width: size,
                  shadowColor: color,
                  shadowOpacity: isActive ? 0.65 : 0,
                  shadowRadius: isActive ? 14 : 0
                }
              ]}
            />
          </View>
        );
      })}
    </View>
  );
}

export const TrafficLight = AmpelKomponente;

function normalizeStatus(status: AmpelStatus) {
  if (status === "critical") return "red";
  if (status === "warning" || status === "info") return "yellow";
  if (status === "safe") return "green";
  return status;
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    backgroundColor: "rgba(5, 13, 26, 0.72)",
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  lightSlot: {
    alignItems: "center",
    justifyContent: "center"
  },
  halo: {
    borderRadius: 999,
    position: "absolute"
  },
  light: {
    borderRadius: 999
  }
});
