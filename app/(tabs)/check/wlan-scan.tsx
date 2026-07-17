import { router } from "expo-router";
import { StyleSheet, Text } from "react-native";

import { WlanScanner } from "@/components/modules/WlanScanner";
import { AnimatedButton } from "@/components/ui/AnimatedButton";
import { Screen } from "@/components/ui/Screen";
import { colors } from "@/constants/colors";

export default function WlanScanScreen() {
  return (
    <Screen>
      <Text style={styles.title}>WLAN-Scan</Text>
      <Text style={styles.copy}>Erster mobiler Netz-Check für die Praxisumgebung.</Text>
      <WlanScanner />
      <AnimatedButton
        label="Bericht erzeugen"
        onPress={() =>
          router.push({
            pathname: "/(tabs)/report",
            params: { from: "check" }
          })
        }
        style={styles.button}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    color: colors.ink,
    fontSize: 36,
    fontWeight: "900"
  },
  copy: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 23,
    marginBottom: 22,
    marginTop: 8
  },
  button: {
    marginTop: 18
  }
});
