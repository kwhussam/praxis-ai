import type { CanonicalAssessmentFacts } from "@/lib/security/assessment-contract";
import type { CheckData } from "@/lib/security/scoring";

export const GOLDEN_ASSESSMENT_OBSERVED_AT = "2026-08-07T08:00:00.000Z";

export const GOLDEN_ASSESSMENT_INPUT: CheckData = {
  observed_at: GOLDEN_ASSESSMENT_OBSERVED_AT,
  assessment_profile: "general",
  mfa_enabled: true,
  backup_tested: true,
  backup_frequency: "daily",
  dmarc_exists: true,
  updates_current: true,
  staff_training: true,
  privacy_documents_current: true,
  responsibilities_defined: true,
  encryption: "WPA3",
  external: { email_security: { dmarc: { policy: "reject" } } },
  externalFindings: [],
  wlanFindings: [],
  wlanSecurityFindings: [],
  evidence_sources: {
    MFA_ENABLED: "measured",
    BACKUP_TESTED: "measured",
    PATCHING_CURRENT: "measured",
    STAFF_TRAINING: "measured",
    PRIVACY_DOCUMENTATION: "measured",
    SECURITY_RESPONSIBILITIES: "measured"
  }
};

// Stable facts only. Timestamps and prose deliberately do not belong to this contract.
export const GOLDEN_ASSESSMENT_EXPECTED: Pick<
  CanonicalAssessmentFacts,
  "assessment_profile" | "score" | "ampel" | "review_status" | "scores_by_category" | "total_points" | "max_points"
> = {
  assessment_profile: "general",
  score: 100,
  ampel: "grün",
  review_status: "ok",
  scores_by_category: {
    access_control: 100,
    backup: 100,
    email_security: 100,
    network: 100,
    dsgvo: 100,
    updates: 100
  },
  total_points: 115,
  max_points: 115
};
