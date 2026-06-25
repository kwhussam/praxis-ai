import { AppConfig } from "@/lib/config/environment";
import type { Practice } from "@/lib/store/session";

export const DEMO_PRACTICE: Practice = {
  id: "demo-00000000-0000-0000-0000-000000000000",
  name: "Demo-Praxis Dr. Mustermann",
  domain: "demo.praxisshield.de",
  email: "demo@praxisshield.de",
  plan: "monitoring"
};

export function getDemoPractice(): Practice {
  if (!AppConfig.isDemoMode) {
    throw new Error("Demo-Daten außerhalb des Demo-Modus nicht verfügbar.");
  }
  return DEMO_PRACTICE;
}

export function assertDemoPracticeAccess(practiceId: string) {
  if (practiceId.startsWith("demo-") && !AppConfig.isDemoMode) {
    throw new Error("Ungültige Demo-Practice-ID außerhalb des Demo-Modus.");
  }
}
