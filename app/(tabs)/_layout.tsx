import { Tabs } from "expo-router";
import { Activity, FileText, Gauge, Package, ShieldCheck } from "lucide-react-native";

import { colors } from "@/constants/colors";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.electric,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: "rgba(10, 22, 40, 0.92)",
          borderTopColor: colors.border,
          height: 86,
          paddingBottom: 24,
          paddingTop: 10
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: "800"
        }
      }}
    >
      <Tabs.Screen name="dashboard" options={{ title: "Dashboard", tabBarTestID: "tab-dashboard", tabBarAccessibilityLabel: "Dashboard", tabBarIcon: ({ color }) => <Gauge color={color} size={22} /> }} />
      <Tabs.Screen name="check" options={{ title: "Check", tabBarTestID: "tab-check", tabBarAccessibilityLabel: "Praxis-Check", tabBarIcon: ({ color }) => <ShieldCheck color={color} size={22} /> }} />
      <Tabs.Screen name="inventory" options={{ title: "Inventar", tabBarIcon: ({ color }) => <Package color={color} size={22} /> }} />
      <Tabs.Screen name="report" options={{ title: "Berichte", tabBarTestID: "tab-reports", tabBarAccessibilityLabel: "Berichte", tabBarIcon: ({ color }) => <FileText color={color} size={22} /> }} />
      <Tabs.Screen name="monitoring" options={{ title: "Live", tabBarIcon: ({ color }) => <Activity color={color} size={22} /> }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
    </Tabs>
  );
}
