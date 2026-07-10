import { StyleSheet, Text, View } from "react-native";

import { colors } from "@/constants/colors";
import { GlassCard } from "@/components/ui/GlassCard";
import type { ExternalProviderName, ExternalProviderStatus, SubdomainSecurityCheck } from "@/lib/security/external";

type DomainCheckProps = {
  domain: string;
  checks: Array<{ label: string; status: "ok" | "warn" | "critical" | "not_checked" }>;
  providers?: Partial<Record<ExternalProviderName, ExternalProviderStatus>>;
  subdomains?: SubdomainSecurityCheck[];
};

export function DomainCheck({ domain, checks, providers, subdomains = [] }: DomainCheckProps) {
  const providerEntries = Object.entries(providers ?? {}) as Array<[ExternalProviderName, ExternalProviderStatus]>;

  return (
    <GlassCard>
      <Text style={styles.eyebrow}>Externer Praxis-Check</Text>
      <Text style={styles.domain}>{domain}</Text>
      {providerEntries.length > 0 ? (
        <View style={styles.providerGrid}>
          {providerEntries.map(([provider, status]) => (
            <View key={provider} style={styles.providerPill}>
              <View style={[styles.dot, { backgroundColor: providerStatusColor(status) }]} />
              <Text style={styles.providerText}>{providerLabel(provider)}: {providerStatusLabel(status)}</Text>
            </View>
          ))}
        </View>
      ) : null}
      <View style={styles.list}>
        {checks.map((check) => (
          <View key={check.label} style={styles.row}>
            <View style={[styles.dot, { backgroundColor: statusColor(check.status) }]} />
            <Text style={styles.label}>{check.label}</Text>
          </View>
        ))}
      </View>
      {subdomains.length > 0 ? (
        <View style={styles.subdomainBox}>
          <Text style={styles.sectionTitle}>Subdomains</Text>
          {subdomains.map((subdomain) => (
            <View key={subdomain.domain} style={styles.subdomainRow}>
              <Text style={styles.subdomainName}>{subdomain.domain}</Text>
              <Text style={[styles.subdomainScore, { color: subdomain.score >= 80 ? colors.safe : subdomain.score >= 55 ? colors.warning : colors.critical }]}>
                {subdomain.score}/100
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </GlassCard>
  );
}

function statusColor(status: "ok" | "warn" | "critical" | "not_checked") {
  if (status === "ok") return colors.safe;
  if (status === "warn") return colors.warning;
  if (status === "not_checked") return colors.muted;
  return colors.critical;
}

function providerStatusColor(status: ExternalProviderStatus) {
  if (status === "active") return colors.safe;
  if (status === "not_configured") return colors.muted;
  return colors.warning;
}

function providerStatusLabel(status: ExternalProviderStatus) {
  if (status === "active") return "aktiv";
  if (status === "not_configured") return "nicht geprüft";
  return "nicht verfügbar";
}

function providerLabel(provider: ExternalProviderName) {
  const labels: Record<ExternalProviderName, string> = {
    shodan: "Shodan",
    hibp: "HIBP",
    virusTotal: "VirusTotal",
    securityTrails: "SecurityTrails",
    sslLabs: "SSL Labs",
    cloudflareDns: "Cloudflare DNS"
  };
  return labels[provider];
}

const styles = StyleSheet.create({
  eyebrow: {
    color: colors.electric,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase"
  },
  domain: {
    color: colors.ink,
    fontSize: 24,
    fontWeight: "900",
    marginTop: 8
  },
  list: {
    marginTop: 18,
    gap: 12
  },
  providerGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14
  },
  providerPill: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 7
  },
  providerText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700"
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  dot: {
    height: 10,
    width: 10,
    borderRadius: 10
  },
  label: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "600"
  },
  subdomainBox: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    gap: 8,
    marginTop: 18,
    paddingTop: 14
  },
  sectionTitle: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "900"
  },
  subdomainRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  subdomainName: {
    color: colors.ink,
    flex: 1,
    fontSize: 13,
    fontWeight: "700"
  },
  subdomainScore: {
    fontSize: 13,
    fontWeight: "900"
  }
});
