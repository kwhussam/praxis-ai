import { BellRing } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";

import { ScoreHistory } from "@/components/charts/ScoreHistory";
import { ScoreRing } from "@/components/ui/ScoreRing";
import { RiskCard } from "@/components/ui/RiskCard";
import { Screen } from "@/components/ui/Screen";
import { colors } from "@/constants/colors";
import { PLANS } from "@/lib/billing/plans";
import { useCheckStore } from "@/lib/store/check";
import { useSessionStore } from "@/lib/store/session";

const scoreData = [
  { day: "Mo", score: 62 },
  { day: "Di", score: 66 },
  { day: "Mi", score: 68 },
  { day: "Do", score: 72 },
  { day: "Fr", score: 74 }
];

export default function DashboardScreen() {
  const score = useCheckStore((state) => state.currentScore);
  const practice = useSessionStore((state) => state.practice);
  const plan = PLANS[practice?.plan ?? "free"];

  return (
    <Screen>
      <View style={styles.top}>
        <View>
          <Text style={styles.kicker}>Live Security Overview</Text>
          <Text style={styles.title}>{practice?.name ?? "Praxis"}</Text>
        </View>
        <View style={styles.alertIcon}>
          <BellRing color={colors.warning} size={22} />
        </View>
      </View>
      <View style={styles.scoreWrap}>
        <ScoreRing score={score} />
      </View>
      <RiskCard
        tone="warning"
        title="DMARC nicht strikt genug"
        metric="-9"
        description="E-Mail-Spoofing ist wahrscheinlicher, wenn die Domain noch keine reject-Policy nutzt."
      />
      <RiskCard
        tone="safe"
        title="SSL-Zertifikat stabil"
        metric="+12"
        description="Die Praxisdomain ist erreichbar, verschlüsselt und aktuell ohne Zertifikatswarnung."
        delay={120}
      />
      <View style={styles.planCard}>
        <Text style={styles.planKicker}>Aktueller Tarif</Text>
        <View style={styles.planHeader}>
          <Text style={styles.planName}>{plan.name}</Text>
          <Text style={styles.planPrice}>
            {plan.price === 0 ? "0 EUR" : `${plan.price} EUR`}
            {plan.billing ? ` / ${plan.billing}` : ""}
          </Text>
        </View>
        {plan.features.slice(0, 4).map((feature) => (
          <Text key={feature} style={styles.planFeature}>
            {feature}
          </Text>
        ))}
      </View>
      <ScoreHistory data={scoreData} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24
  },
  kicker: {
    color: colors.electric,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  title: {
    color: colors.ink,
    fontSize: 30,
    fontWeight: "900",
    marginTop: 6
  },
  alertIcon: {
    height: 48,
    width: 48,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,165,2,0.13)",
    borderColor: colors.border,
    borderWidth: 1
  },
  scoreWrap: {
    alignItems: "center",
    marginBottom: 26
  },
  planCard: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 18,
    padding: 16
  },
  planKicker: {
    color: colors.electric,
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase"
  },
  planHeader: {
    alignItems: "baseline",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
    marginTop: 8
  },
  planName: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: "900"
  },
  planPrice: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "800"
  },
  planFeature: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8
  }
});
