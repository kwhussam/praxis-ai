export type PlanId = "free" | "audit" | "monitoring" | "compliance";

export type BillingCycle = "einmalig" | "monatlich";

export type Plan = {
  name: string;
  price: number;
  billing?: BillingCycle;
  features: string[];
  limits?: {
    checks_per_month: number;
    wlan_scans: number | "unlimited";
    reports: number | "unlimited";
    monitoring: boolean;
    external_checks_per_day?: number;
  };
};

export const PLANS: Record<PlanId, Plan> = {
  free: {
    name: "Kostenlos",
    price: 0,
    features: ["Einmaliger Online-Check", "Basis-Sicherheitsscore", "Top-3-Risiken", "WLAN-Scan (1x)"],
    limits: {
      checks_per_month: 1,
      wlan_scans: 1,
      reports: 0,
      monitoring: false,
      external_checks_per_day: 3
    }
  },
  audit: {
    name: "Audit",
    price: 199,
    billing: "einmalig",
    features: [
      "Vollständiger KI-Bericht (PDF)",
      "Detaillierter Maßnahmenplan",
      "DSGVO-Bewertung",
      "WLAN-Tiefenscan",
      "E-Mail-Sicherheits-Check",
      "Einmalige Beratung (30 Min. Video-Call)"
    ]
  },
  monitoring: {
    name: "Monitoring",
    price: 79,
    billing: "monatlich",
    features: [
      "Alles aus Audit (monatlich)",
      "Kontinuierliches externes Monitoring",
      "Push-Alerts bei kritischen Events",
      "Quartals-Berichte (PDF)",
      "Dark-Web-Überwachung",
      "SSL-Ablauf-Warnungen",
      "Unbegrenzte WLAN-Scans"
    ]
  },
  compliance: {
    name: "Compliance",
    price: 199,
    billing: "monatlich",
    features: [
      "Alles aus Monitoring",
      "Automatische DSGVO-Dokumentation",
      "Notfallplan-Generator",
      "Jahresbericht für KV",
      "Schulungsmodule für Mitarbeiter",
      "Prioritäts-Support (4h Response)"
    ]
  }
};

export type WhiteLabelBranding = {
  partnerId: string;
  companyName: string;
  logoUrl?: string;
  primaryColor: string;
  accentColor: string;
  reportBranding?: {
    footerText?: string;
    supportEmail?: string;
    legalName?: string;
  };
};

export type PartnerPortfolioPractice = {
  id: string;
  name: string;
  domain?: string;
  plan: PlanId;
  latestScore?: number;
  criticalAlerts?: number;
};
