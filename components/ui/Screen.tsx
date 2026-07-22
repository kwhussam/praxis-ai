import { LinearGradient } from "expo-linear-gradient";
import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { DemoBanner } from "@/components/ui/DemoBanner";
import { colors } from "@/constants/colors";

type ScreenProps = {
  children: ReactNode;
  scroll?: boolean;
};

const BASE_TOP_PADDING = 24;
const BASE_BOTTOM_PADDING = 16;

export function Screen({ children, scroll = true }: ScreenProps) {
  const insets = useSafeAreaInsets();
  const contentStyle = [
    styles.content,
    { paddingTop: insets.top + BASE_TOP_PADDING, paddingBottom: insets.bottom + BASE_BOTTOM_PADDING }
  ];
  const content = <View style={contentStyle}>{children}</View>;

  return (
    <LinearGradient colors={[colors.navy, "#07101F", "#050A14"]} style={styles.gradient}>
      <DemoBanner />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.keyboardAvoiding}>
        {scroll ? (
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            {content}
          </ScrollView>
        ) : (
          content
        )}
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1
  },
  keyboardAvoiding: {
    flex: 1
  },
  scroll: {
    flexGrow: 1
  },
  content: {
    flex: 1,
    paddingHorizontal: 20
  }
});
