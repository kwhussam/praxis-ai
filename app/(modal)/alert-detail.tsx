import { StyleSheet, Text } from "react-native";

import { GlassCard } from "@/components/ui/GlassCard";
import { Screen } from "@/components/ui/Screen";
import { colors } from "@/constants/colors";

export default function AlertDetailModal() {
  return (
    <Screen>
      <Text style={styles.title}>Alert-Detail</Text>
      <GlassCard>
        <Text style={styles.body}>Hier erscheinen technische Evidenz, betroffene Systeme und eine praxisnahe Handlungsempfehlung.</Text>
      </GlassCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    color: colors.ink,
    fontSize: 34,
    fontWeight: "900",
    marginBottom: 20
  },
  body: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 24
  }
});
