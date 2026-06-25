import { Link } from "expo-router";
import { StyleSheet, Text } from "react-native";

import { Screen } from "@/components/ui/Screen";
import { colors } from "@/constants/colors";

export default function NotFoundScreen() {
  return (
    <Screen>
      <Text style={styles.title}>Screen nicht gefunden</Text>
      <Link href="/(tabs)/dashboard" style={styles.link}>
        Zurück zum Dashboard
      </Link>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    color: colors.ink,
    fontSize: 30,
    fontWeight: "900",
    marginBottom: 20
  },
  link: {
    color: colors.electric,
    fontSize: 16,
    fontWeight: "800"
  }
});
