export const SAFESCAN_AUTHORIZATION_SCHEMA_VERSION = "1.0.0" as const;
export const SAFESCAN_POLICY_VERSION = "de-health-safescan-1.0.0" as const;

export const SAFETY_CLASSES = [0, 1, 2, 3] as const;
export type SafetyClass = (typeof SAFETY_CLASSES)[number];
export type SafeScanAssetClass = "standard" | "medical_device" | "unknown";

export const SAFESCAN_STOP_CONDITIONS = [
  "kill_switch",
  "clinical_impact_reported",
  "connectivity_degradation",
  "unexpected_medical_device",
  "error_threshold_exceeded",
  "authorization_changed"
] as const;
export type SafeScanStopCondition = (typeof SAFESCAN_STOP_CONDITIONS)[number];

export type SafeScanAuthorizationV1 = {
  schema_version: typeof SAFESCAN_AUTHORIZATION_SCHEMA_VERSION;
  authorization_id: string;
  practice_id: string;
  site_ref: string;
  policy_version: typeof SAFESCAN_POLICY_VERSION;
  actor: {
    user_id: string;
    role: "practice_owner" | "practice_manager";
    authorized_at: string;
  };
  valid_from: string;
  valid_until: string;
  max_safety_class: SafetyClass;
  maintenance_windows: Array<{
    id: string;
    starts_at: string;
    ends_at: string;
  }>;
  scope: {
    targets: Array<{
      id: string;
      kind: "cidr" | "host" | "asset";
      locator: string;
      asset_class: SafeScanAssetClass;
      max_safety_class: SafetyClass;
      elevated_approval: null | {
        approved_by_user_id: string;
        approved_at: string;
        expires_at: string;
        reason_code: string;
        clinical_owner_approved: true;
      };
    }>;
    exclusions: Array<{
      target_id: string;
      reason_code: string;
    }>;
  };
  stop_conditions: SafeScanStopCondition[];
  integrity: {
    scope_sha256: string;
  };
};

export type SafeScanRequest = {
  authorization_id: string;
  practice_id: string;
  policy_version: typeof SAFESCAN_POLICY_VERSION;
  requested_at: string;
  safety_class: SafetyClass;
  target_ids: string[];
  probe_ids: string[];
};

export type SafeScanDecision =
  | { allowed: true; authorization_id: string; safety_class: SafetyClass; target_ids: string[] }
  | { allowed: false; reason_code: SafeScanDenialReason };

export type SafeScanDenialReason =
  | "authorization_invalid"
  | "authorization_mismatch"
  | "authorization_not_yet_valid"
  | "authorization_expired"
  | "kill_switch_active"
  | "policy_version_mismatch"
  | "safety_class_prohibited"
  | "safety_class_exceeds_authorization"
  | "target_out_of_scope"
  | "target_excluded"
  | "target_safety_class_exceeded"
  | "sensitive_target_requires_approval"
  | "maintenance_window_required"
  | "probe_identity_required";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/;
const CODE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SITE_REF = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

/**
 * Strict runtime boundary for decrypted D2 scan scopes. Unknown fields require
 * a schema bump. Safety class 3 is described by policy but cannot be granted
 * by the current product contract.
 */
export function parseSafeScanAuthorizationV1(value: unknown): SafeScanAuthorizationV1 {
  const root = record(value, "authorization");
  exactKeys(root, [
    "schema_version", "authorization_id", "practice_id", "site_ref", "policy_version",
    "actor", "valid_from", "valid_until", "max_safety_class", "maintenance_windows",
    "scope", "stop_conditions", "integrity"
  ], "authorization");

  equal(root.schema_version, SAFESCAN_AUTHORIZATION_SCHEMA_VERSION, "schema_version");
  uuid(root.authorization_id, "authorization_id");
  uuid(root.practice_id, "practice_id");
  pattern(root.site_ref, SITE_REF, "site_ref");
  equal(root.policy_version, SAFESCAN_POLICY_VERSION, "policy_version");

  const actor = record(root.actor, "actor");
  exactKeys(actor, ["user_id", "role", "authorized_at"], "actor");
  uuid(actor.user_id, "actor.user_id");
  oneOf(actor.role, ["practice_owner", "practice_manager"], "actor.role");
  timestamp(actor.authorized_at, "actor.authorized_at");

  timestamp(root.valid_from, "valid_from");
  timestamp(root.valid_until, "valid_until");
  if (Date.parse(root.valid_until as string) <= Date.parse(root.valid_from as string)) fail("invalid_validity_window");
  if (Date.parse(root.valid_until as string) - Date.parse(root.valid_from as string) > 31 * 86_400_000) fail("validity_window_exceeds_31_days");
  if (Date.parse(actor.authorized_at as string) > Date.parse(root.valid_from as string)) fail("authorized_after_valid_from");
  safetyClass(root.max_safety_class, "max_safety_class");
  if ((root.max_safety_class as number) === 3) fail("safety_class_3_cannot_be_granted");

  const windows = array(root.maintenance_windows, "maintenance_windows");
  const windowIds = new Set<string>();
  windows.forEach((entry, index) => {
    const window = record(entry, `maintenance_windows.${index}`);
    exactKeys(window, ["id", "starts_at", "ends_at"], `maintenance_windows.${index}`);
    pattern(window.id, CODE, `maintenance_windows.${index}.id`);
    if (windowIds.has(window.id as string)) fail(`maintenance_windows.${index}.id_duplicate`);
    windowIds.add(window.id as string);
    timestamp(window.starts_at, `maintenance_windows.${index}.starts_at`);
    timestamp(window.ends_at, `maintenance_windows.${index}.ends_at`);
    if (Date.parse(window.ends_at as string) <= Date.parse(window.starts_at as string)) fail(`maintenance_windows.${index}.invalid_window`);
    if (
      Date.parse(window.starts_at as string) < Date.parse(root.valid_from as string) ||
      Date.parse(window.ends_at as string) > Date.parse(root.valid_until as string)
    ) fail(`maintenance_windows.${index}.outside_authorization`);
  });

  const scope = record(root.scope, "scope");
  exactKeys(scope, ["targets", "exclusions"], "scope");
  const targets = array(scope.targets, "scope.targets");
  if (targets.length === 0) fail("scope.targets_empty");
  const targetIds = new Set<string>();
  targets.forEach((entry, index) => {
    const target = record(entry, `scope.targets.${index}`);
    exactKeys(target, ["id", "kind", "locator", "asset_class", "max_safety_class", "elevated_approval"], `scope.targets.${index}`);
    pattern(target.id, CODE, `scope.targets.${index}.id`);
    if (targetIds.has(target.id as string)) fail(`scope.targets.${index}.id_duplicate`);
    targetIds.add(target.id as string);
    oneOf(target.kind, ["cidr", "host", "asset"], `scope.targets.${index}.kind`);
    nonEmptyString(target.locator, `scope.targets.${index}.locator`, 512);
    oneOf(target.asset_class, ["standard", "medical_device", "unknown"], `scope.targets.${index}.asset_class`);
    safetyClass(target.max_safety_class, `scope.targets.${index}.max_safety_class`);
    if ((target.max_safety_class as number) > (root.max_safety_class as number)) fail(`scope.targets.${index}.exceeds_authorization`);
    if ((target.max_safety_class as number) === 3) fail(`scope.targets.${index}.safety_class_3_cannot_be_granted`);

    if (target.elevated_approval === null) {
      if (target.asset_class !== "standard" && (target.max_safety_class as number) > 1) {
        fail(`scope.targets.${index}.sensitive_target_without_approval`);
      }
    } else {
      const approval = record(target.elevated_approval, `scope.targets.${index}.elevated_approval`);
      exactKeys(approval, [
        "approved_by_user_id", "approved_at", "expires_at", "reason_code", "clinical_owner_approved"
      ], `scope.targets.${index}.elevated_approval`);
      uuid(approval.approved_by_user_id, `scope.targets.${index}.elevated_approval.approved_by_user_id`);
      timestamp(approval.approved_at, `scope.targets.${index}.elevated_approval.approved_at`);
      timestamp(approval.expires_at, `scope.targets.${index}.elevated_approval.expires_at`);
      pattern(approval.reason_code, CODE, `scope.targets.${index}.elevated_approval.reason_code`);
      equal(approval.clinical_owner_approved, true, `scope.targets.${index}.elevated_approval.clinical_owner_approved`);
      if (Date.parse(approval.expires_at as string) <= Date.parse(approval.approved_at as string)) {
        fail(`scope.targets.${index}.elevated_approval.invalid_window`);
      }
      if (Date.parse(approval.expires_at as string) > Date.parse(root.valid_until as string)) {
        fail(`scope.targets.${index}.elevated_approval.outside_authorization`);
      }
      if (Date.parse(approval.approved_at as string) > Date.parse(root.valid_from as string)) {
        fail(`scope.targets.${index}.elevated_approval.after_valid_from`);
      }
    }
  });

  const exclusions = array(scope.exclusions, "scope.exclusions");
  const excludedIds = new Set<string>();
  exclusions.forEach((entry, index) => {
    const exclusion = record(entry, `scope.exclusions.${index}`);
    exactKeys(exclusion, ["target_id", "reason_code"], `scope.exclusions.${index}`);
    pattern(exclusion.target_id, CODE, `scope.exclusions.${index}.target_id`);
    pattern(exclusion.reason_code, CODE, `scope.exclusions.${index}.reason_code`);
    if (!targetIds.has(exclusion.target_id as string)) fail(`scope.exclusions.${index}.unknown_target`);
    if (excludedIds.has(exclusion.target_id as string)) fail(`scope.exclusions.${index}.target_duplicate`);
    excludedIds.add(exclusion.target_id as string);
  });

  const stopConditions = array(root.stop_conditions, "stop_conditions");
  const stopSet = new Set<string>();
  stopConditions.forEach((condition, index) => {
    oneOf(condition, SAFESCAN_STOP_CONDITIONS, `stop_conditions.${index}`);
    stopSet.add(condition as string);
  });
  for (const required of SAFESCAN_STOP_CONDITIONS) {
    if (!stopSet.has(required)) fail(`stop_conditions.missing_${required}`);
  }

  const integrity = record(root.integrity, "integrity");
  exactKeys(integrity, ["scope_sha256"], "integrity");
  pattern(integrity.scope_sha256, SHA256, "integrity.scope_sha256");
  return value as SafeScanAuthorizationV1;
}

/** Fail-closed preflight. Call immediately before every probe, never only at scheduling time. */
export function authorizeSafeScanRequest(
  rawAuthorization: unknown,
  rawRequest: unknown,
  options: { killSwitchActive: boolean }
): SafeScanDecision {
  if (
    rawRequest !== null &&
    typeof rawRequest === "object" &&
    !Array.isArray(rawRequest) &&
    Array.isArray((rawRequest as Record<string, unknown>).probe_ids) &&
    ((rawRequest as Record<string, unknown>).probe_ids as unknown[]).some(
      (id) => typeof id !== "string" || !CODE.test(id)
    )
  ) return { allowed: false, reason_code: "probe_identity_required" };
  if (
    rawRequest !== null &&
    typeof rawRequest === "object" &&
    !Array.isArray(rawRequest) &&
    Array.isArray((rawRequest as Record<string, unknown>).probe_ids) &&
    ((rawRequest as Record<string, unknown>).probe_ids as unknown[]).length === 0
  ) return { allowed: false, reason_code: "probe_identity_required" };
  if (!isSafeScanRequest(rawRequest)) return { allowed: false, reason_code: "authorization_invalid" };
  const request = rawRequest;
  let authorization: SafeScanAuthorizationV1;
  try {
    authorization = parseSafeScanAuthorizationV1(rawAuthorization);
  } catch {
    return { allowed: false, reason_code: "authorization_invalid" };
  }
  if (request.authorization_id !== authorization.authorization_id || request.practice_id !== authorization.practice_id) {
    return { allowed: false, reason_code: "authorization_mismatch" };
  }
  if (request.policy_version !== authorization.policy_version) return { allowed: false, reason_code: "policy_version_mismatch" };
  if (options.killSwitchActive) return { allowed: false, reason_code: "kill_switch_active" };
  const requestedAt = Date.parse(request.requested_at);
  if (!ISO_TIMESTAMP.test(request.requested_at) || !Number.isFinite(requestedAt)) {
    return { allowed: false, reason_code: "authorization_invalid" };
  }
  if (requestedAt < Date.parse(authorization.valid_from)) return { allowed: false, reason_code: "authorization_not_yet_valid" };
  if (requestedAt >= Date.parse(authorization.valid_until)) return { allowed: false, reason_code: "authorization_expired" };
  if (request.safety_class === 3) return { allowed: false, reason_code: "safety_class_prohibited" };
  if (!SAFETY_CLASSES.includes(request.safety_class)) return { allowed: false, reason_code: "authorization_invalid" };
  if (request.safety_class > authorization.max_safety_class) return { allowed: false, reason_code: "safety_class_exceeds_authorization" };
  if (request.probe_ids.length === 0 || request.probe_ids.some((id) => !CODE.test(id))) {
    return { allowed: false, reason_code: "probe_identity_required" };
  }
  if (request.target_ids.length === 0 || new Set(request.target_ids).size !== request.target_ids.length) {
    return { allowed: false, reason_code: "target_out_of_scope" };
  }
  const targetMap = new Map(authorization.scope.targets.map((target) => [target.id, target]));
  const exclusions = new Set(authorization.scope.exclusions.map((exclusion) => exclusion.target_id));
  for (const targetId of request.target_ids) {
    const target = targetMap.get(targetId);
    if (!target) return { allowed: false, reason_code: "target_out_of_scope" };
    if (exclusions.has(targetId)) return { allowed: false, reason_code: "target_excluded" };
    if (request.safety_class > target.max_safety_class) return { allowed: false, reason_code: "target_safety_class_exceeded" };
    if (target.asset_class !== "standard" && request.safety_class > 1) {
      const approval = target.elevated_approval;
      if (!approval || Date.parse(approval.approved_at) > requestedAt || Date.parse(approval.expires_at) <= requestedAt) {
        return { allowed: false, reason_code: "sensitive_target_requires_approval" };
      }
    }
  }
  if (
    request.safety_class >= 2 &&
    !authorization.maintenance_windows.some((window) =>
      requestedAt >= Date.parse(window.starts_at) && requestedAt < Date.parse(window.ends_at)
    )
  ) return { allowed: false, reason_code: "maintenance_window_required" };

  return {
    allowed: true,
    authorization_id: authorization.authorization_id,
    safety_class: request.safety_class,
    target_ids: [...request.target_ids]
  };
}

function fail(message: string): never {
  throw new Error(`safescan_contract:${message}`);
}
function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${path}_not_object`);
  return value as Record<string, unknown>;
}
function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail(`${path}_not_array`);
  return value;
}
function exactKeys(value: Record<string, unknown>, keys: readonly string[], path: string) {
  const expected = new Set(keys);
  if (keys.some((key) => !(key in value)) || Object.keys(value).some((key) => !expected.has(key))) fail(`${path}_unexpected_fields`);
}
function pattern(value: unknown, regex: RegExp, path: string) {
  if (typeof value !== "string" || !regex.test(value)) fail(`${path}_invalid`);
}
function nonEmptyString(value: unknown, path: string, max: number) {
  if (typeof value !== "string" || value.length < 1 || value.length > max) fail(`${path}_invalid`);
}
function uuid(value: unknown, path: string) { pattern(value, UUID, path); }
function timestamp(value: unknown, path: string) {
  if (typeof value !== "string" || !ISO_TIMESTAMP.test(value) || !Number.isFinite(Date.parse(value))) fail(`${path}_invalid`);
}
function equal(value: unknown, expected: unknown, path: string) {
  if (value !== expected) fail(`${path}_invalid`);
}
function oneOf(value: unknown, expected: readonly unknown[], path: string) {
  if (!expected.includes(value)) fail(`${path}_invalid`);
}
function safetyClass(value: unknown, path: string) {
  if (typeof value !== "number" || !SAFETY_CLASSES.includes(value as SafetyClass)) fail(`${path}_invalid`);
}

function isSafeScanRequest(value: unknown): value is SafeScanRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const request = value as Record<string, unknown>;
  const expected = [
    "authorization_id", "practice_id", "policy_version", "requested_at",
    "safety_class", "target_ids", "probe_ids"
  ];
  if (Object.keys(request).length !== expected.length || expected.some((key) => !(key in request))) return false;
  if (typeof request.authorization_id !== "string" || !UUID.test(request.authorization_id)) return false;
  if (typeof request.practice_id !== "string" || !UUID.test(request.practice_id)) return false;
  if (request.policy_version !== SAFESCAN_POLICY_VERSION) return false;
  if (typeof request.requested_at !== "string" || !ISO_TIMESTAMP.test(request.requested_at)) return false;
  if (typeof request.safety_class !== "number" || !SAFETY_CLASSES.includes(request.safety_class as SafetyClass)) return false;
  if (!Array.isArray(request.target_ids) || request.target_ids.length === 0) return false;
  if (!Array.isArray(request.probe_ids) || request.probe_ids.length === 0) return false;
  if (request.target_ids.some((id) => typeof id !== "string" || !CODE.test(id))) return false;
  if (request.probe_ids.some((id) => typeof id !== "string" || !CODE.test(id))) return false;
  return new Set(request.target_ids).size === request.target_ids.length;
}
