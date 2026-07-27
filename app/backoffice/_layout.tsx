import { Stack } from "expo-router";

export default function BackofficeLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#F4F7FB" } }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="mfa" />
      <Stack.Screen name="index" />
    </Stack>
  );
}

