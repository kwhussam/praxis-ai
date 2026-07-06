import { Stack } from "expo-router";

import { colors } from "@/constants/colors";

export default function ModalLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.navy }
      }}
    />
  );
}
