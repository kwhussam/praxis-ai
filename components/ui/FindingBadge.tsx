import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

import { colors } from "@/constants/colors";
import type { DataSource } from "@/lib/security/wlan";

const SOURCE_CONFIG: Record<DataSource, { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  measured: { label: "Gemessen", color: colors.safe, icon: "checkmark-circle" },
  inferred: { label: "Abgeleitet", color: colors.warning, icon: "analytics" },
  unavailable: { label: "Nicht verfügbar", color: colors.muted, icon: "remove-circle" },
  simulated: { label: "Demo", color: colors.info, icon: "flask" }
};

export function FindingBadge({ source }: { source: DataSource }) {
  const config = SOURCE_CONFIG[source];

  return (
    <View style={[styles.badge, { borderColor: config.color }]}>
      <Ionicons name={config.icon} size={13} color={config.color} />
      <Text style={[styles.text, { color: config.color }]}>{config.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  text: {
    fontSize: 11,
    fontWeight: "900"
  }
});
