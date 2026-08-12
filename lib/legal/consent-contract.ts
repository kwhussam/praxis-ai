export const CONSENT_REGISTRY_VERSION = "2026-08-12.v1";

export const REGISTRY_CONSENT_TYPES = [
  "external_provider_checks",
  "hibp_email_leak_check"
] as const;

export type RegistryConsentType = (typeof REGISTRY_CONSENT_TYPES)[number];

export const CONSENT_DEFINITIONS: Record<RegistryConsentType, {
  title: string;
  description: string;
  scope: Record<string, unknown>;
  validityDays: number;
}> = {
  external_provider_checks: {
    title: "Externe Sicherheitsprüfungen",
    description:
      "Praxis-Domains und gefundene Subdomains dürfen an Cloudflare DNS, Qualys SSL Labs, Shodan, VirusTotal und SecurityTrails übermittelt sowie per HTTPS abgerufen werden, um DNS, TLS, erreichbare Dienste und Reputation zu prüfen.",
    scope: {
      target_kind: "practice_managed_domains",
      data_fields: ["domain", "subdomain"],
      providers: ["cloudflare_dns", "qualys_ssl_labs", "shodan", "virustotal", "securitytrails", "direct_https"],
      purposes: ["dns", "tls", "ports", "reputation", "subdomains"]
    },
    validityDays: 365
  },
  hibp_email_leak_check: {
    title: "Datenleck-Prüfung",
    description:
      "Freigegebene Praxis-E-Mail-Adressen dürfen an HIBP übertragen werden, um bekannte Datenleck-Treffer zu prüfen.",
    scope: {
      target_kind: "practice_managed_email_addresses",
      provider: "hibp",
      data_fields: ["email_address"],
      result_kind: "breach_metadata"
    },
    validityDays: 365
  }
};

export function isRegistryConsentType(value: unknown): value is RegistryConsentType {
  return typeof value === "string" && REGISTRY_CONSENT_TYPES.includes(value as RegistryConsentType);
}
