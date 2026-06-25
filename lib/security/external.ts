import { apiRequest } from "@/lib/api/client";
import type { SecurityFinding } from "@/lib/security/scoring";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;

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
  };
  dkim: {
    exists: boolean;
    selector_found: string | null;
    valid: boolean;
  };
  dmarc: {
    exists: boolean;
    policy: "none" | "quarantine" | "reject" | null;
    rua: string | null;
    recommendation: string;
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
  };
  overall_score: number;
  critical_count: number;
  warning_count: number;
  findings: SecurityFinding[];
  checkedAt: string;
  scoreImpact: number;
  providers: Record<string, boolean>;
};

export async function runExternalCheck(domain: string, email?: string, practiceId?: string) {
  const endpoint = practiceId && UUID_RE.test(practiceId) ? "/api/check/external" : "/api/external-check";

  return apiRequest<ExternalCheckResult>(endpoint, {
    method: "POST",
    body: { domain, email, practiceId, consent: true }
  });
}
