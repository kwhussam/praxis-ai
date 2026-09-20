import {
  SAFESCAN_POLICY_VERSION,
  type SafeScanAuthorizationV1
} from "@/lib/security/safescan-policy";

export const SAFESCAN_STANDARD_AUTHORIZATION_FIXTURE: SafeScanAuthorizationV1 = {
  schema_version: "1.0.0",
  authorization_id: "d4400000-0000-4000-8000-000000000001",
  practice_id: "b4400000-0000-4000-8000-000000000001",
  site_ref: "site-berlin-01",
  policy_version: SAFESCAN_POLICY_VERSION,
  actor: {
    user_id: "a4400000-0000-4000-8000-000000000001",
    role: "practice_owner",
    authorized_at: "2026-09-20T07:55:00.000Z"
  },
  valid_from: "2026-09-20T08:00:00.000Z",
  valid_until: "2026-09-21T08:00:00.000Z",
  max_safety_class: 2,
  maintenance_windows: [{ id: "mw-01", starts_at: "2026-09-20T20:00:00.000Z", ends_at: "2026-09-20T22:00:00.000Z" }],
  scope: {
    targets: [
      { id: "office-lan", kind: "cidr", locator: "192.0.2.0/24", asset_class: "standard", max_safety_class: 2, elevated_approval: null },
      { id: "dicom-device", kind: "asset", locator: "inventory:medical-001", asset_class: "medical_device", max_safety_class: 1, elevated_approval: null },
      { id: "unknown-host", kind: "host", locator: "192.0.2.99", asset_class: "unknown", max_safety_class: 1, elevated_approval: null }
    ],
    exclusions: [{ target_id: "unknown-host", reason_code: "owner_excluded" }]
  },
  stop_conditions: [
    "kill_switch", "clinical_impact_reported", "connectivity_degradation",
    "unexpected_medical_device", "error_threshold_exceeded", "authorization_changed"
  ],
  integrity: { scope_sha256: "a".repeat(64) }
};

export const SAFESCAN_SENSITIVE_EXCEPTION_FIXTURE: SafeScanAuthorizationV1 = {
  ...SAFESCAN_STANDARD_AUTHORIZATION_FIXTURE,
  authorization_id: "d4400000-0000-4000-8000-000000000002",
  scope: {
    targets: [{
      id: "dicom-device",
      kind: "asset",
      locator: "inventory:medical-001",
      asset_class: "medical_device",
      max_safety_class: 2,
      elevated_approval: {
        approved_by_user_id: "a4400000-0000-4000-8000-000000000002",
        approved_at: "2026-09-20T07:50:00.000Z",
        expires_at: "2026-09-20T22:00:00.000Z",
        reason_code: "clinical_owner_maintenance_window",
        clinical_owner_approved: true
      }
    }],
    exclusions: []
  },
  integrity: { scope_sha256: "b".repeat(64) }
};
