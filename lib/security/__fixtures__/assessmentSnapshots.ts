import type { AssessmentSnapshotV1 } from "@/lib/security/assessment-snapshot-contract";

export const ASSESSMENT_SNAPSHOT_COMPLETE_FIXTURE: AssessmentSnapshotV1 = {
  schema_version: "1.0.0",
  snapshot_id: "5a300000-0000-4000-8000-000000000001",
  practice_id: "5a300000-0000-4000-8000-000000000101",
  captured_at: "2026-09-18T09:00:00.000Z",
  assessment_profile: "health",
  versions: {
    facts: "1.0.0",
    scoring: "2.2.1",
    control_catalog: "2026.09",
    policy_pack: "de-health-2026.09",
    engine: "assessment-engine-1.0.0"
  },
  posture: {
    ampel: "grün",
    gating_reason_codes: []
  },
  evidence: {
    coverage_score: 100,
    confidence_score: 100,
    freshness: "fresh",
    review_status: "ok"
  },
  technical_scores: {
    overall: 100,
    by_category: {
      access_control: 100,
      backup: 100,
      email_security: 100,
      network: 100,
      dsgvo: 100,
      updates: 100
    }
  },
  components: [
    {
      id: "5a300000-0000-4000-8000-000000000201",
      kind: "questionnaire",
      source_id: "security-check:5a300000-0000-4000-8000-000000000301",
      source_version: "questionnaire-1.0.0",
      collection_status: "collected",
      freshness: "fresh",
      observed_at: "2026-09-18T08:59:00.000Z",
      expires_at: "2026-12-17T08:59:00.000Z",
      payload_sha256: "1111111111111111111111111111111111111111111111111111111111111111",
      control_ids: ["MFA_ENABLED", "BACKUP_TESTED"]
    }
  ],
  controls: [
    {
      rule_id: "MFA_ENABLED",
      category: "access_control",
      applicability: "applicable",
      status: "met",
      collection_status: "collected",
      points_earned: 15,
      points_max: 15
    },
    {
      rule_id: "BACKUP_TESTED",
      category: "backup",
      applicability: "applicable",
      status: "met",
      collection_status: "collected",
      points_earned: 20,
      points_max: 20
    }
  ],
  score_explanations: [
    {
      code: "posture.green_requirements_met",
      severity: "info",
      effect: "informational",
      category: null,
      control_ids: ["MFA_ENABLED", "BACKUP_TESTED"],
      points_delta: null
    }
  ],
  integrity: {
    payload_sha256: "2a2f7709f8ca2098ef5ff8eec086465d3ad0721356a0d40181a7205867f09666",
    authenticity: "hash_only",
    signature: null
  }
};

export const ASSESSMENT_SNAPSHOT_INSUFFICIENT_COVERAGE_FIXTURE: AssessmentSnapshotV1 = {
  schema_version: "1.0.0",
  snapshot_id: "5a300000-0000-4000-8000-000000000002",
  practice_id: "5a300000-0000-4000-8000-000000000101",
  captured_at: "2026-09-18T10:00:00.000Z",
  assessment_profile: "health",
  versions: {
    facts: "1.0.0",
    scoring: "2.2.1",
    control_catalog: "2026.09",
    policy_pack: "de-health-2026.09",
    engine: "assessment-engine-1.0.0"
  },
  posture: {
    ampel: "gelb",
    gating_reason_codes: ["coverage.insufficient", "evidence.stale"]
  },
  evidence: {
    coverage_score: 50,
    confidence_score: 42,
    freshness: "stale",
    review_status: "review_required"
  },
  technical_scores: {
    overall: 100,
    by_category: {
      access_control: 100,
      backup: 100,
      email_security: 100,
      network: 100,
      dsgvo: 100,
      updates: 100
    }
  },
  components: [
    {
      id: "5a300000-0000-4000-8000-000000000202",
      kind: "wlan",
      source_id: "wlan-scan:5a300000-0000-4000-8000-000000000302",
      source_version: "ios-native-probe-1.0.0",
      collection_status: "unsupported",
      freshness: "unknown",
      observed_at: "2026-09-18T09:59:00.000Z",
      expires_at: null,
      payload_sha256: "2222222222222222222222222222222222222222222222222222222222222222",
      control_ids: ["NETWORK_SECURITY_PROBES"]
    }
  ],
  controls: [
    {
      rule_id: "NETWORK_SECURITY_PROBES",
      category: "network",
      applicability: "applicable",
      status: "unknown",
      collection_status: "unsupported",
      points_earned: 0,
      points_max: 5
    }
  ],
  score_explanations: [
    {
      code: "coverage.insufficient",
      severity: "warning",
      effect: "blocks_green",
      category: "network",
      control_ids: ["NETWORK_SECURITY_PROBES"],
      points_delta: null
    }
  ],
  integrity: {
    payload_sha256: "448d2a7e3822d4eea25cc9d22fa5aff0a11ee394890180da9b9ea0dbaf7f9747",
    authenticity: "hash_only",
    signature: null
  }
};
