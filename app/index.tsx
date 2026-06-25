import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { colors } from "@/constants/colors";
import { AppConfig } from "@/lib/config/environment";
import { initDemoSession, initSession, useSessionStore } from "@/lib/store/session";

export default function Index() {
  const [target, setTarget] = useState<"/(auth)/login" | "/(auth)/onboarding" | "/(tabs)/dashboard" | null>(null);

  useEffect(() => {
    let mounted = true;

    async function restore() {
      try {
        if (AppConfig.isDemoMode) {
          initDemoSession();
          if (mounted) setTarget("/(tabs)/dashboard");
          return;
        }

        const practice = await initSession();
        if (!mounted) return;
        setTarget(practice ? "/(tabs)/dashboard" : useSessionStore.getState().session ? "/(auth)/onboarding" : "/(auth)/login");
      } catch {
        if (mounted) setTarget("/(auth)/login");
      }
    }

    void restore();

    return () => {
      mounted = false;
    };
  }, []);

  if (target) return <Redirect href={target} />;

  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.electric} />
    </View>
  );
}

const styles = StyleSheet.create({
  loading: {
    alignItems: "center",
    backgroundColor: colors.navy,
    flex: 1,
    justifyContent: "center"
  }
});
