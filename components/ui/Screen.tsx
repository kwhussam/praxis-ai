import { LinearGradient } from "expo-linear-gradient";
import type { ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { colors } from "@/constants/colors";

type ScreenProps = {
  children: ReactNode;
  scroll?: boolean;
};

export function Screen({ children, scroll = true }: ScreenProps) {
  const content = <View style={styles.content}>{children}</View>;

  return (
    <LinearGradient colors={[colors.navy, "#07101F", "#050A14"]} style={styles.gradient}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {content}
        </ScrollView>
      ) : (
        content
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1
  },
  scroll: {
    flexGrow: 1
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 68,
    paddingBottom: 36
  }
});
