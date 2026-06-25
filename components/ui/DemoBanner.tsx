import { StyleSheet, Text, View } from "react-native";

import { colors } from "@/constants/colors";
import { AppConfig } from "@/lib/config/environment";

export function DemoBanner() {
  if (!AppConfig.isDemoMode) return null;

  return (
    <View style={styles.banner}>
      <Text style={styles.text}>Demo-Modus: Sie sehen Demo-Daten, keine echten Praxisdaten.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: colors.warning,
    paddingHorizontal: 16,
    paddingVertical: 9
  },
  text: {
    color: "#0A1628",
    fontSize: 13,
    fontWeight: "900",
    textAlign: "center"
  }
});
