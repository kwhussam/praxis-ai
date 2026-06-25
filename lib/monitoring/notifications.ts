import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { CRITICAL_ALERTS, type MonitoringEvent } from "@/lib/monitoring/types";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowAlert: true
  })
});

export function isCriticalMonitoringAlert(event: Pick<MonitoringEvent, "severity" | "title" | "type">) {
  if (event.severity !== "critical") return false;

  return (
    CRITICAL_ALERTS.some((alert) => event.title.toLowerCase().includes(alert.toLowerCase().slice(0, 18))) ||
    event.type === "ssl_expiry" ||
    event.type === "leak_detected" ||
    event.type === "dmarc_missing" ||
    event.type === "port_open" ||
    event.type === "domain_blacklisted"
  );
}

export async function notifyCriticalMonitoringEvent(event: MonitoringEvent) {
  if (!isCriticalMonitoringAlert(event)) return;
  if (Platform.OS === "web") return;

  const permissions = await Notifications.getPermissionsAsync();
  const nextPermissions = permissions.granted ? permissions : await Notifications.requestPermissionsAsync();

  if (!nextPermissions.granted) return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: event.title,
      body: event.message || "Kritisches Monitoring-Ereignis erkannt.",
      data: {
        eventId: event.id,
        practiceId: event.practice_id,
        type: event.type
      },
      sound: "default"
    },
    trigger: null
  });
}
