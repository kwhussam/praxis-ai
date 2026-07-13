import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { MotiView } from "moti";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { AnimatedButton } from "@/components/ui/AnimatedButton";
import { AmpelKomponente } from "@/components/ui/Ampel";
import { GlassCard } from "@/components/ui/GlassCard";
import { Screen } from "@/components/ui/Screen";
import { colors } from "@/constants/colors";
import { apiRequest } from "@/lib/api/client";
import { supabase } from "@/lib/supabase/client";
import { useSessionStore } from "@/lib/store/session";

const features = [
  { icon: "checkmark-circle", title: "Check", copy: "Domain, E-Mail und WLAN strukturiert prüfen." },
  { icon: "document-text", title: "Bericht", copy: "Ergebnisse ohne IT-Jargon und mit Prioritäten." },
  { icon: "shield-checkmark", title: "Sicher", copy: "Konkrete Maßnahmen statt abstrakter Warnungen." }
] as const;

export default function OnboardingScreen() {
  const [step, setStep] = useState(0);
  const [domainOrEmail, setDomainOrEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setPractice = useSessionStore((store) => store.setPractice);
  const normalizedDomain = useMemo(() => extractDomain(domainOrEmail), [domainOrEmail]);
  const canStart = normalizedDomain.length > 3 && normalizedDomain.includes(".");

  async function next() {
    if (step < 2) {
      setStep((current) => current + 1);
      return;
    }

    if (!canStart || loading) return;

    setLoading(true);
    setError(null);

    try {
      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (!user) throw new Error("Nicht eingeloggt. Bitte melden Sie sich erneut an.");

      const { data: practice, error: insertError } = await supabase
        .from("practices")
        .insert({
          owner_id: user.id,
          name: practiceNameFromDomain(normalizedDomain),
          domain: normalizedDomain,
          email: extractEmail(domainOrEmail),
          plan: "free"
        })
        .select("id,name,domain,email,plan,white_label_partner_id")
        .single();

      if (insertError) throw insertError;

      setPractice({
        id: practice.id,
        name: practice.name,
        domain: practice.domain ?? undefined,
        email: practice.email ?? undefined,
        plan: "free",
        whiteLabelPartnerId: practice.white_label_partner_id ?? undefined
      });

      await apiRequest("/api/legal/avv/accept", {
        method: "POST",
        body: {
          practiceId: practice.id,
          version: "1.0",
          consentTypes: ["avv", "privacy_policy"]
        }
      });

      router.replace("/(tabs)/dashboard");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Onboarding konnte nicht abgeschlossen werden.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen scroll={false}>
      <View style={styles.shell}>
        <View style={styles.progressRow}>
          {[0, 1, 2].map((index) => (
            <Pressable key={index} onPress={() => setStep(index)} style={styles.dotPressable}>
              <MotiView
                animate={{
                  opacity: step === index ? 1 : 0.34,
                  width: step === index ? 28 : 9
                }}
                transition={{ type: "timing", duration: 220 }}
                style={styles.dot}
              />
            </Pressable>
          ))}
        </View>

        {step === 0 ? <SecurePracticeScreen /> : null}
        {step === 1 ? <NoKnowledgeScreen /> : null}
        {step === 2 ? (
          <StartScreen domainOrEmail={domainOrEmail} setDomainOrEmail={setDomainOrEmail} canStart={canStart} />
        ) : null}

        <View style={styles.actions}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {step > 0 ? (
            <AnimatedButton
              disabled={loading}
              label="Zurück"
              variant="ghost"
              onPress={() => setStep((current) => current - 1)}
              style={styles.secondaryAction}
            />
          ) : null}
          <AnimatedButton
            disabled={loading || (step === 2 && !canStart)}
            label={loading ? "Praxis wird angelegt..." : step === 2 ? "Kostenlosen ersten Check starten" : "Weiter"}
            onPress={next}
            style={[styles.primaryAction, step === 2 && !canStart ? styles.disabled : null]}
            icon={<Ionicons name={step === 2 ? "scan" : "arrow-forward"} size={18} color={colors.ink} />}
          />
        </View>
      </View>
    </Screen>
  );
}

function SecurePracticeScreen() {
  return (
    <View style={styles.slide}>
      <PracticeIllustration />
      <Text style={styles.title}>Ihre Praxis. Geschützt.</Text>
      <Text style={styles.copy}>PraxisShield AI erkennt digitale Risiken früh und übersetzt sie in klare nächste Schritte.</Text>
    </View>
  );
}

function NoKnowledgeScreen() {
  return (
    <View style={styles.slide}>
      <GlassCard style={styles.featureCard}>
        <View style={styles.featureHeader}>
          <AmpelKomponente status="green" />
          <Text style={styles.featureHeaderText}>Kein IT-Wissen nötig.</Text>
        </View>
        {features.map((feature, index) => (
          <MotiView
            key={feature.title}
            from={{ opacity: 0, translateX: -14 }}
            animate={{ opacity: 1, translateX: 0 }}
            transition={{ type: "timing", duration: 320, delay: index * 120 }}
            style={styles.featureRow}
          >
            <View style={styles.featureIcon}>
              <Ionicons name={feature.icon} size={21} color={colors.safe} />
            </View>
            <View style={styles.featureText}>
              <Text style={styles.featureTitle}>{feature.title}</Text>
              <Text style={styles.featureCopy}>{feature.copy}</Text>
            </View>
          </MotiView>
        ))}
      </GlassCard>
      <Text style={styles.title}>Kein IT-Wissen nötig.</Text>
      <Text style={styles.copy}>Sie bekommen Ampelstatus, Bericht und Maßnahmen so, dass das Praxisteam sofort handeln kann.</Text>
    </View>
  );
}

function StartScreen({
  domainOrEmail,
  setDomainOrEmail,
  canStart
}: {
  domainOrEmail: string;
  setDomainOrEmail: (value: string) => void;
  canStart: boolean;
}) {
  return (
    <View style={styles.slide}>
      <GlassCard style={styles.formCard}>
        <View style={styles.formIcon}>
          <Ionicons name="timer" size={28} color={colors.electric} />
        </View>
        <Text style={styles.formTitle}>Starten Sie in 2 Minuten.</Text>
        <Text style={styles.formCopy}>Praxisdomain oder E-Mail eingeben und direkt den kostenlosen ersten Check starten.</Text>
        <Text style={styles.label}>Domain oder E-Mail</Text>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          onChangeText={setDomainOrEmail}
          placeholder="team@praxis.de"
          placeholderTextColor={colors.muted}
          style={[styles.input, domainOrEmail.length > 0 && !canStart ? styles.inputWarning : null]}
          value={domainOrEmail}
        />
        {domainOrEmail.length > 0 && !canStart ? (
          <Text style={styles.validation}>Bitte eine gültige Domain oder E-Mail eingeben.</Text>
        ) : null}
        <View style={styles.privacyHint}>
          <Ionicons name="information-circle" size={18} color={colors.electric} />
          <Text style={styles.privacyHintText}>
            Es werden keine Patientendaten verarbeitet. Der AVV wird automatisch für Sie erstellt - Sie müssen nichts
            unterschreiben.
          </Text>
        </View>
        <Text style={styles.legal}>Diese Angabe wird nur für den Praxis-Sicherheitscheck genutzt.</Text>
      </GlassCard>
      <Text style={styles.title}>Kostenloser erster Check.</Text>
      <Text style={styles.copy}>Keine Installation, kein Vertragsabschluss, keine Patientendaten.</Text>
    </View>
  );
}

function PracticeIllustration() {
  return (
    <View style={styles.illustration}>
      <MotiView
        from={{ opacity: 0.22, scale: 0.88 }}
        animate={{ opacity: 0.05, scale: 1.18 }}
        transition={{ loop: true, type: "timing", duration: 1900 }}
        style={styles.heroHalo}
      />
      <MotiView
        from={{ translateY: 8 }}
        animate={{ translateY: -4 }}
        transition={{ loop: true, type: "timing", duration: 1800 }}
        style={styles.practiceBuilding}
      >
        <View style={styles.roof} />
        <View style={styles.buildingBody}>
          <Ionicons name="medical" size={34} color={colors.ink} />
          <View style={styles.windowRow}>
            <View style={styles.window} />
            <View style={styles.window} />
            <View style={styles.window} />
          </View>
        </View>
      </MotiView>
      <MotiView
        from={{ opacity: 0.36, scale: 0.86 }}
        animate={{ opacity: 0.9, scale: 1 }}
        transition={{ loop: true, type: "timing", duration: 1500 }}
        style={styles.shieldBubble}
      >
        <Ionicons name="shield-checkmark" size={34} color={colors.safe} />
      </MotiView>
    </View>
  );
}

function extractDomain(value: string) {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return "";
  const withoutProtocol = trimmed.replace(/^https?:\/\//, "");
  const domain = withoutProtocol.includes("@") ? withoutProtocol.split("@").pop() ?? "" : withoutProtocol;
  return domain.replace(/\/.*$/, "");
}

function extractEmail(value: string) {
  const trimmed = value.trim().toLowerCase();
  return trimmed.includes("@") ? trimmed : undefined;
}

function practiceNameFromDomain(domain: string) {
  const name = domain.split(".")[0]?.replace(/-/g, " ") ?? "Praxis";
  return `Praxis ${name.charAt(0).toUpperCase()}${name.slice(1)}`;
}

const styles = StyleSheet.create({
  shell: {
    flex: 1
  },
  progressRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 7,
    justifyContent: "center",
    marginBottom: 16
  },
  dotPressable: {
    padding: 6
  },
  dot: {
    backgroundColor: colors.electric,
    borderRadius: 999,
    height: 9
  },
  slide: {
    flex: 1,
    justifyContent: "center"
  },
  illustration: {
    alignItems: "center",
    alignSelf: "center",
    height: 280,
    justifyContent: "center",
    marginBottom: 12,
    width: 280
  },
  heroHalo: {
    backgroundColor: colors.electric,
    borderRadius: 150,
    height: 250,
    position: "absolute",
    width: 250
  },
  practiceBuilding: {
    alignItems: "center"
  },
  roof: {
    borderBottomColor: colors.electric,
    borderBottomWidth: 42,
    borderLeftColor: "transparent",
    borderLeftWidth: 88,
    borderRightColor: "transparent",
    borderRightWidth: 88,
    height: 0,
    width: 0
  },
  buildingBody: {
    alignItems: "center",
    backgroundColor: colors.navyElevated,
    borderColor: colors.borderStrong,
    borderRadius: 22,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    borderWidth: 1,
    gap: 22,
    height: 128,
    justifyContent: "center",
    shadowColor: colors.electric,
    shadowOpacity: 0.28,
    shadowRadius: 28,
    width: 164
  },
  windowRow: {
    flexDirection: "row",
    gap: 10
  },
  window: {
    backgroundColor: colors.electricMuted,
    borderRadius: 6,
    height: 24,
    width: 24
  },
  shieldBubble: {
    alignItems: "center",
    backgroundColor: "rgba(46, 213, 115, 0.14)",
    borderColor: "rgba(46, 213, 115, 0.38)",
    borderRadius: 24,
    borderWidth: 1,
    bottom: 30,
    height: 68,
    justifyContent: "center",
    position: "absolute",
    right: 34,
    width: 68
  },
  title: {
    color: colors.ink,
    fontSize: 40,
    fontWeight: "900",
    lineHeight: 44,
    marginTop: 20
  },
  copy: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 24,
    marginTop: 12
  },
  featureCard: {
    marginBottom: 22
  },
  featureHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16
  },
  featureHeaderText: {
    color: colors.ink,
    flex: 1,
    fontSize: 19,
    fontWeight: "900",
    marginLeft: 12
  },
  featureRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    paddingVertical: 11
  },
  featureIcon: {
    alignItems: "center",
    backgroundColor: "rgba(46, 213, 115, 0.12)",
    borderColor: "rgba(46, 213, 115, 0.28)",
    borderRadius: 15,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    width: 44
  },
  featureText: {
    flex: 1
  },
  featureTitle: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "900"
  },
  featureCopy: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 3
  },
  formCard: {
    marginBottom: 22
  },
  formIcon: {
    alignItems: "center",
    backgroundColor: colors.electricSoft,
    borderColor: "rgba(45, 126, 248, 0.34)",
    borderRadius: 19,
    borderWidth: 1,
    height: 58,
    justifyContent: "center",
    marginBottom: 18,
    width: 58
  },
  formTitle: {
    color: colors.ink,
    fontSize: 24,
    fontWeight: "900"
  },
  formCopy: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8
  },
  label: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 8,
    marginTop: 20
  },
  input: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 16,
    minHeight: 54,
    paddingHorizontal: 16
  },
  inputWarning: {
    borderColor: colors.warning
  },
  validation: {
    color: colors.warning,
    fontSize: 13,
    marginTop: 8
  },
  privacyHint: {
    alignItems: "flex-start",
    backgroundColor: colors.electricSoft,
    borderColor: "rgba(45, 126, 248, 0.3)",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 9,
    marginTop: 14,
    padding: 12
  },
  privacyHintText: {
    color: colors.ink,
    flex: 1,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17
  },
  legal: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 12
  },
  actions: {
    gap: 10,
    paddingBottom: 4
  },
  secondaryAction: {
    minHeight: 48
  },
  primaryAction: {
    minHeight: 56
  },
  disabled: {
    opacity: 0.44
  },
  error: {
    color: colors.critical,
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19
  }
});
