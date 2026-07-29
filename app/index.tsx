import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { colors } from "@/constants/colors";
import { AppConfig } from "@/lib/config/environment";
import { getPendingInvitationCode } from "@/lib/auth/pending-invitation";
import { initDemoSession, initSession, useSessionStore } from "@/lib/store/session";

export default function Index() {
  const [target, setTarget] = useState<"/(auth)/login" | "/(auth)/onboarding" | "/(auth)/redeem-invitation" | "/(tabs)/dashboard" | null>(null);

  useEffect(() => {
    let mounted = true;

    async function restore() {
      try {
        if (AppConfig.isDemoMode) {
          initDemoSession();
          if (mounted) setTarget("/(tabs)/dashboard");
          return;
        }

        const [practice, pendingInvitation] = await Promise.all([initSession(), getPendingInvitationCode()]);
        if (!mounted) return;
        if (pendingInvitation) setTarget(useSessionStore.getState().session ? "/(auth)/redeem-invitation" : "/(auth)/login");
        else setTarget(practice ? "/(tabs)/dashboard" : useSessionStore.getState().session ? "/(auth)/onboarding" : "/(auth)/login");
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
