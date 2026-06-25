import { router } from "expo-router";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { AnimatedButton } from "@/components/ui/AnimatedButton";
import { GlassCard } from "@/components/ui/GlassCard";
import { Screen } from "@/components/ui/Screen";
import { colors } from "@/constants/colors";

export default function LoginScreen() {
  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>Willkommen zurück</Text>
        <Text style={styles.copy}>Melde dich als Praxis oder White-Label-Partner an.</Text>
      </View>
      <GlassCard>
        <Text style={styles.label}>E-Mail</Text>
        <TextInput placeholder="team@praxis.de" placeholderTextColor={colors.muted} keyboardType="email-address" autoCapitalize="none" style={styles.input} />
        <Text style={styles.label}>Passwort</Text>
        <TextInput placeholder="••••••••" placeholderTextColor={colors.muted} secureTextEntry style={styles.input} />
        <AnimatedButton label="Einloggen" onPress={() => router.replace("/(tabs)/dashboard")} style={styles.button} />
      </GlassCard>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: 28
  },
  title: {
    color: colors.ink,
    fontSize: 36,
    fontWeight: "900"
  },
  copy: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 23,
    marginTop: 10
  },
  label: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 8,
    marginTop: 8
  },
  input: {
    minHeight: 54,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "rgba(255,255,255,0.08)",
    color: colors.ink,
    paddingHorizontal: 16,
    fontSize: 16,
    marginBottom: 14
  },
  button: {
    marginTop: 8
  }
});
