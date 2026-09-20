import {
  SAFESCAN_POLICY_VERSION,
  authorizeSafeScanRequest,
  parseSafeScanAuthorizationV1,
  type SafeScanAuthorizationV1,
  type SafeScanRequest
} from "@/lib/security/safescan-policy";
import {
  SAFESCAN_SENSITIVE_EXCEPTION_FIXTURE,
  SAFESCAN_STANDARD_AUTHORIZATION_FIXTURE
} from "@/lib/security/__fixtures__/safeScanAuthorizations";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function request(overrides: Partial<SafeScanRequest> = {}): SafeScanRequest {
  return {
    authorization_id: SAFESCAN_STANDARD_AUTHORIZATION_FIXTURE.authorization_id,
    practice_id: SAFESCAN_STANDARD_AUTHORIZATION_FIXTURE.practice_id,
    policy_version: SAFESCAN_POLICY_VERSION,
    requested_at: "2026-09-20T20:30:00.000Z",
    safety_class: 1,
    target_ids: ["office-lan"],
    probe_ids: ["tcp-service-discovery-v1"],
    ...overrides
  };
}

describe("SafeScan authorization v1", () => {
  it("accepts the standard and explicitly approved sensitive fixtures", () => {
    expect(parseSafeScanAuthorizationV1(SAFESCAN_STANDARD_AUTHORIZATION_FIXTURE)).toBe(SAFESCAN_STANDARD_AUTHORIZATION_FIXTURE);
    expect(parseSafeScanAuthorizationV1(SAFESCAN_SENSITIVE_EXCEPTION_FIXTURE)).toBe(SAFESCAN_SENSITIVE_EXCEPTION_FIXTURE);
  });

  it("rejects unknown fields without a schema bump", () => {
    expect(() => parseSafeScanAuthorizationV1({ ...SAFESCAN_STANDARD_AUTHORIZATION_FIXTURE, future: true }))
      .toThrow("safescan_contract:authorization_unexpected_fields");
  });

  it("limits grants and elevated approvals to the authorization window", () => {
    const tooLong = clone(SAFESCAN_STANDARD_AUTHORIZATION_FIXTURE);
    tooLong.valid_until = "2026-10-22T08:00:00.000Z";
    expect(() => parseSafeScanAuthorizationV1(tooLong)).toThrow("safescan_contract:validity_window_exceeds_31_days");

    const approvalOutsideGrant = clone(SAFESCAN_SENSITIVE_EXCEPTION_FIXTURE);
    if (!approvalOutsideGrant.scope.targets[0].elevated_approval) throw new Error("fixture approval missing");
    approvalOutsideGrant.scope.targets[0].elevated_approval.expires_at = "2026-09-21T08:00:01.000Z";
    expect(() => parseSafeScanAuthorizationV1(approvalOutsideGrant)).toThrow(
      "safescan_contract:scope.targets.0.elevated_approval.outside_authorization"
    );
  });

  it("never grants safety class 3", () => {
    const changed = clone(SAFESCAN_STANDARD_AUTHORIZATION_FIXTURE);
    changed.max_safety_class = 3;
    expect(() => parseSafeScanAuthorizationV1(changed)).toThrow("safescan_contract:safety_class_3_cannot_be_granted");
    expect(authorizeSafeScanRequest(SAFESCAN_STANDARD_AUTHORIZATION_FIXTURE, request({ safety_class: 3 }), { killSwitchActive: false }))
      .toEqual({ allowed: false, reason_code: "safety_class_prohibited" });
  });

  it("caps unknown and medical devices at S1 without explicit approval", () => {
    const changed = clone(SAFESCAN_STANDARD_AUTHORIZATION_FIXTURE);
    changed.scope.targets[1].max_safety_class = 2;
    expect(() => parseSafeScanAuthorizationV1(changed)).toThrow("safescan_contract:scope.targets.1.sensitive_target_without_approval");
    expect(authorizeSafeScanRequest(SAFESCAN_STANDARD_AUTHORIZATION_FIXTURE, request({ safety_class: 2, target_ids: ["dicom-device"] }), { killSwitchActive: false }))
      .toEqual({ allowed: false, reason_code: "target_safety_class_exceeded" });
  });

  it("allows an approved sensitive S2 target only inside its maintenance window", () => {
    const approvedRequest = request({
      authorization_id: SAFESCAN_SENSITIVE_EXCEPTION_FIXTURE.authorization_id,
      safety_class: 2,
      target_ids: ["dicom-device"]
    });
    expect(authorizeSafeScanRequest(SAFESCAN_SENSITIVE_EXCEPTION_FIXTURE, approvedRequest, { killSwitchActive: false }).allowed).toBe(true);
    expect(authorizeSafeScanRequest(SAFESCAN_SENSITIVE_EXCEPTION_FIXTURE, { ...approvedRequest, requested_at: "2026-09-20T12:00:00.000Z" }, { killSwitchActive: false }))
      .toEqual({ allowed: false, reason_code: "maintenance_window_required" });
  });

  it("rejects excluded and out-of-scope targets", () => {
    expect(authorizeSafeScanRequest(SAFESCAN_STANDARD_AUTHORIZATION_FIXTURE, request({ target_ids: ["unknown-host"] }), { killSwitchActive: false }))
      .toEqual({ allowed: false, reason_code: "target_excluded" });
    expect(authorizeSafeScanRequest(SAFESCAN_STANDARD_AUTHORIZATION_FIXTURE, request({ target_ids: ["other-tenant-host"] }), { killSwitchActive: false }))
      .toEqual({ allowed: false, reason_code: "target_out_of_scope" });
  });

  it.each<{ name: string; scanRequest: SafeScanRequest; killSwitchActive: boolean; reasonCode: string }>([
    { name: "before validity", scanRequest: request({ requested_at: "2026-09-20T07:59:59.000Z" }), killSwitchActive: false, reasonCode: "authorization_not_yet_valid" },
    { name: "after expiry", scanRequest: request({ requested_at: "2026-09-21T08:00:00.000Z" }), killSwitchActive: false, reasonCode: "authorization_expired" },
    { name: "kill switch", scanRequest: request(), killSwitchActive: true, reasonCode: "kill_switch_active" },
    { name: "tenant mismatch", scanRequest: request({ practice_id: "b4400000-0000-4000-8000-000000000099" }), killSwitchActive: false, reasonCode: "authorization_mismatch" },
    { name: "no probe identity", scanRequest: request({ probe_ids: [] }), killSwitchActive: false, reasonCode: "probe_identity_required" }
  ])("fails closed for $name", ({ scanRequest, killSwitchActive, reasonCode }) => {
    expect(authorizeSafeScanRequest(SAFESCAN_STANDARD_AUTHORIZATION_FIXTURE, scanRequest, { killSwitchActive }))
      .toEqual({ allowed: false, reason_code: reasonCode });
  });

  it("fails closed when the encrypted payload was decrypted into an invalid contract", () => {
    const invalid = clone(SAFESCAN_STANDARD_AUTHORIZATION_FIXTURE) as SafeScanAuthorizationV1 & { future?: boolean };
    invalid.future = true;
    expect(authorizeSafeScanRequest(invalid, request(), { killSwitchActive: false }))
      .toEqual({ allowed: false, reason_code: "authorization_invalid" });
  });

  it("fails closed instead of throwing for a malformed probe request", () => {
    expect(authorizeSafeScanRequest(
      SAFESCAN_STANDARD_AUTHORIZATION_FIXTURE,
      { ...request(), target_ids: undefined },
      { killSwitchActive: false }
    )).toEqual({ allowed: false, reason_code: "authorization_invalid" });
  });
});
