import { apiRequest } from "@/lib/api/client";
import type { SecurityFinding } from "@/lib/security/scoring";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type SSLCheck = {
  valid: boolean;
  issuer: string;
  expires_at: string | null;
  days_remaining: number | null;
  protocol: string;
  grade: "A+" | "A" | "B" | "C" | "F";
  hsts_enabled: boolean;
  vulnerabilities: string[];
};

export type DNSCheck = {
  a_records: string[];
  aaaa_records: string[];
  cname_records: string[];
  ns_records: string[];
  txt_records: string[];
  caa_records: string[];
};

export type EmailSecurityCheck = {
  spf: {
    exists: boolean;
    valid: boolean;
    record: string;
    issues: string[];
    alignment: "pass" | "warning" | "fail";
    alignment_mode: "strict" | "relaxed" | null;
  };
  dkim: {
    exists: boolean;
    selector_found: string | null;
    valid: boolean;
    alignment: "pass" | "warning" | "fail";
    alignment_mode: "strict" | "relaxed" | null;
  };
  dmarc: {
    exists: boolean;
    policy: "none" | "quarantine" | "reject" | null;
    rua: string | null;
    spf_alignment_mode: "strict" | "relaxed" | null;
    dkim_alignment_mode: "strict" | "relaxed" | null;
    alignment_ready: boolean;
    recommendation: string;
  };
  mta_sts: {
    exists: boolean;
    mode: "enforce" | "testing" | "none" | null;
    record: string;
  };
  tls_rpt: {
    exists: boolean;
    rua: string | null;
    record: string;
  };
  caa: {
    exists: boolean;
    records: string[];
  };
  mx_records: {
    exists: boolean;
    records: string[];
    secure: boolean;
  };
};

export type PortCheck = {
  open_ports: {
    port: number;
    protocol: string;
    service: string;
    severity: "critical" | "warning" | "info";
    banner?: string;
  }[];
  known_vulnerabilities: {
    id: string;
    cvss: number | null;
    summary: string;
    port?: number;
  }[];
};

export type LeakCheck = {
  email_found: boolean;
  breach_count: number;
  breaches: {
    name: string;
    date: string;
    data_types: string[];
  }[];
  domain_found: boolean;
  paste_count: number;
};

export type ReputationCheck = {
  blacklisted: boolean;
  blacklists: string[];
  malware_hosting: boolean;
  phishing_reports: number;
  dns_history: {
    type: string;
    value: string;
    first_seen?: string;
    last_seen?: string;
  }[];
};

export type SubdomainSecurityCheck = {
  domain: string;
  source: "securitytrails" | "cloudflare_dns_common";
  checks: {
    dns: DNSCheck;
    ssl: SSLCheck;
  };
  score: number;
  findings: SecurityFinding[];
};

export type SubdomainDiscoveryCheck = {
  status: "checked" | "partial" | "not_checked";
  source: "securitytrails" | "cloudflare_dns_common" | "none";
  discovered: string[];
  evaluated: SubdomainSecurityCheck[];
  not_checked_reason?: string;
};

export type ExternalProviderName = "shodan" | "hibp" | "virusTotal" | "securityTrails" | "sslLabs" | "cloudflareDns";
export type ExternalProviderStatus = "active" | "not_configured" | "unavailable";

export type ExternalCheckResult = {
  checkId?: string;
  domain: string;
  timestamp: string;
  checks: {
    ssl: SSLCheck;
    dns: DNSCheck;
    email_security: EmailSecurityCheck;
    ports: PortCheck;
    reputation: ReputationCheck;
    leaks: LeakCheck;
    subdomains: SubdomainDiscoveryCheck;
  };
  overall_score: number;
  critical_count: number;
  warning_count: number;
  findings: SecurityFinding[];
  checkedAt: string;
  scoreImpact: number;
  providers: Record<string, boolean>;
  provider_statuses: Record<ExternalProviderName, ExternalProviderStatus>;
};

export async function runExternalCheck(domain: string, email?: string, practiceId?: string) {
  if (!practiceId || !UUID_RE.test(practiceId)) {
    throw new Error("Eine gültige Praxis-ID ist erforderlich, bevor ein externer Praxis-Check gestartet werden kann.");
  }

  return apiRequest<ExternalCheckResult>("/api/check/external", {
    method: "POST",
    body: { domain, email, practiceId, consent: true }
  });
}
