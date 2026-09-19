import { COLLECTION_STATUSES, type CollectionStatus, type EvidenceFreshness } from "@/lib/assessment/collection";
import type {
  AmpelColor,
  Applicability,
  AssessmentProfile,
  ControlStatus,
  ReviewStatus,
  SecurityCategory
} from "@/lib/security/scoring";

export const ASSESSMENT_SNAPSHOT_SCHEMA_VERSION = "1.0.0" as const;

export const ASSESSMENT_COMPONENT_KINDS = [
  "questionnaire",
  "external_monitoring",
  "wlan",
  "mobile",
  "desktop_agent",
  "router",
  "manual_attestation"
] as const;

export type AssessmentComponentKind = (typeof ASSESSMENT_COMPONENT_KINDS)[number];
export type SnapshotIntegrityAuthenticity = "hash_only" | "signed";

export type AssessmentSnapshotComponentV1 = {
  id: string;
  kind: AssessmentComponentKind;
  source_id: string;
  source_version: string;
  collection_status: CollectionStatus;
  freshness: EvidenceFreshness;
  observed_at: string;
  expires_at: string | null;
  payload_sha256: string;
  control_ids: string[];
};

export type AssessmentSnapshotControlV1 = {
  rule_id: string;
  category: SecurityCategory;
  applicability: Applicability;
  status: ControlStatus;
  collection_status: CollectionStatus;
  points_earned: number;
  points_max: number;
};

export type AssessmentSnapshotScoreExplanationV1 = {
  code: string;
  severity: "info" | "warning" | "critical";
  effect: "blocks_green" | "reduces_score" | "coverage_only" | "informational";
  category: SecurityCategory | null;
  control_ids: string[];
  points_delta: number | null;
};

export type AssessmentSnapshotPayloadV1 = {
  schema_version: typeof ASSESSMENT_SNAPSHOT_SCHEMA_VERSION;
  snapshot_id: string;
  practice_id: string;
  captured_at: string;
  assessment_profile: AssessmentProfile;
  versions: {
    facts: string;
    scoring: string;
    control_catalog: string;
    policy_pack: string;
    engine: string;
  };
  posture: {
    ampel: AmpelColor;
    gating_reason_codes: string[];
  };
  evidence: {
    coverage_score: number;
    confidence_score: number;
    freshness: EvidenceFreshness;
    review_status: ReviewStatus;
  };
  technical_scores: {
    overall: number;
    by_category: Record<SecurityCategory, number>;
  };
  components: AssessmentSnapshotComponentV1[];
  controls: AssessmentSnapshotControlV1[];
  score_explanations: AssessmentSnapshotScoreExplanationV1[];
};

export type AssessmentSnapshotV1 = AssessmentSnapshotPayloadV1 & {
  integrity: {
    payload_sha256: string;
    authenticity: SnapshotIntegrityAuthenticity;
    signature: null | {
      algorithm: "ed25519";
      key_id: string;
      value: string;
    };
  };
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
const VERSION = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/;
const CODE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const CATEGORIES: SecurityCategory[] = [
  "access_control",
  "backup",
  "email_security",
  "network",
  "dsgvo",
  "updates"
];
const FRESHNESS: EvidenceFreshness[] = ["fresh", "stale", "unknown"];
const CONTROL_STATUSES: ControlStatus[] = ["met", "partially_met", "not_met", "unknown", "not_applicable"];
const APPLICABILITY: Applicability[] = ["applicable", "not_applicable", "conditional"];

/**
 * Runtime boundary for decrypted snapshot payloads. It is deliberately strict:
 * unknown fields require a schema-version bump instead of being silently
 * accepted. Hash verification remains the caller's responsibility because this
 * module is shared by native, web and Worker runtimes.
 */
export function parseAssessmentSnapshotV1(value: unknown): AssessmentSnapshotV1 {
  const root = record(value, "snapshot");
  exactKeys(root, [
    "schema_version", "snapshot_id", "practice_id", "captured_at", "assessment_profile",
    "versions", "posture", "evidence", "technical_scores", "components", "controls",
    "score_explanations", "integrity"
  ], "snapshot");

  equal(root.schema_version, ASSESSMENT_SNAPSHOT_SCHEMA_VERSION, "schema_version");
  uuid(root.snapshot_id, "snapshot_id");
  uuid(root.practice_id, "practice_id");
  timestamp(root.captured_at, "captured_at");
  oneOf(root.assessment_profile, ["general", "health"], "assessment_profile");

  const versions = record(root.versions, "versions");
  exactKeys(versions, ["facts", "scoring", "control_catalog", "policy_pack", "engine"], "versions");
  for (const key of Object.keys(versions)) pattern(versions[key], VERSION, `versions.${key}`);

  const posture = record(root.posture, "posture");
  exactKeys(posture, ["ampel", "gating_reason_codes"], "posture");
  oneOf(posture.ampel, ["rot", "gelb", "grün"], "posture.ampel");
  stringArray(posture.gating_reason_codes, "posture.gating_reason_codes", CODE);

  const evidence = record(root.evidence, "evidence");
  exactKeys(evidence, ["coverage_score", "confidence_score", "freshness", "review_status"], "evidence");
  percentage(evidence.coverage_score, "evidence.coverage_score");
  percentage(evidence.confidence_score, "evidence.confidence_score");
  oneOf(evidence.freshness, FRESHNESS, "evidence.freshness");
  oneOf(evidence.review_status, ["ok", "review_required"], "evidence.review_status");
  if (
    posture.ampel === "grün" &&
    ((posture.gating_reason_codes as string[]).length > 0 || evidence.freshness !== "fresh" || evidence.review_status !== "ok")
  ) {
    fail("posture_green_with_open_gate");
  }

  const scores = record(root.technical_scores, "technical_scores");
  exactKeys(scores, ["overall", "by_category"], "technical_scores");
  percentage(scores.overall, "technical_scores.overall");
  const byCategory = record(scores.by_category, "technical_scores.by_category");
  exactKeys(byCategory, CATEGORIES, "technical_scores.by_category");
  for (const category of CATEGORIES) percentage(byCategory[category], `technical_scores.by_category.${category}`);

  const components = array(root.components, "components");
  if (components.length === 0) fail("components_empty");
  const componentIds = new Set<string>();
  components.forEach((entry, index) => {
    const component = record(entry, `components.${index}`);
    exactKeys(component, [
      "id", "kind", "source_id", "source_version", "collection_status", "freshness",
      "observed_at", "expires_at", "payload_sha256", "control_ids"
    ], `components.${index}`);
    uuid(component.id, `components.${index}.id`);
    if (componentIds.has(component.id as string)) fail(`components.${index}.id_duplicate`);
    componentIds.add(component.id as string);
    oneOf(component.kind, ASSESSMENT_COMPONENT_KINDS, `components.${index}.kind`);
    nonEmptyString(component.source_id, `components.${index}.source_id`, 256);
    pattern(component.source_version, VERSION, `components.${index}.source_version`);
    oneOf(component.collection_status, COLLECTION_STATUSES, `components.${index}.collection_status`);
    oneOf(component.freshness, FRESHNESS, `components.${index}.freshness`);
    timestamp(component.observed_at, `components.${index}.observed_at`);
    nullableTimestamp(component.expires_at, `components.${index}.expires_at`);
    if (typeof component.expires_at === "string" && Date.parse(component.expires_at) < Date.parse(component.observed_at as string)) {
      fail(`components.${index}.invalid_evidence_window`);
    }
    if (Date.parse(component.observed_at as string) > Date.parse(root.captured_at as string)) {
      fail(`components.${index}.observation_after_snapshot`);
    }
    if (component.collection_status !== "collected" && component.freshness !== "unknown") {
      fail(`components.${index}.uncollected_freshness`);
    }
    pattern(component.payload_sha256, SHA256, `components.${index}.payload_sha256`);
    stringArray(component.control_ids, `components.${index}.control_ids`, CODE);
  });

  const controls = array(root.controls, "controls");
  const controlIds = new Set<string>();
  controls.forEach((entry, index) => {
    const control = record(entry, `controls.${index}`);
    exactKeys(control, [
      "rule_id", "category", "applicability", "status", "collection_status", "points_earned", "points_max"
    ], `controls.${index}`);
    pattern(control.rule_id, CODE, `controls.${index}.rule_id`);
    if (controlIds.has(control.rule_id as string)) fail(`controls.${index}.rule_id_duplicate`);
    controlIds.add(control.rule_id as string);
    oneOf(control.category, CATEGORIES, `controls.${index}.category`);
    oneOf(control.applicability, APPLICABILITY, `controls.${index}.applicability`);
    oneOf(control.status, CONTROL_STATUSES, `controls.${index}.status`);
    oneOf(control.collection_status, COLLECTION_STATUSES, `controls.${index}.collection_status`);
    nonNegativeNumber(control.points_earned, `controls.${index}.points_earned`);
    nonNegativeNumber(control.points_max, `controls.${index}.points_max`);
    if ((control.points_earned as number) > (control.points_max as number)) fail(`controls.${index}.points_exceed_max`);
    if (control.applicability === "not_applicable" && control.status !== "not_applicable") {
      fail(`controls.${index}.invalid_not_applicable_status`);
    }
    if (control.applicability !== "not_applicable" && control.status === "not_applicable") {
      fail(`controls.${index}.invalid_applicable_status`);
    }
    if (control.applicability === "conditional" && control.status !== "unknown") {
      fail(`controls.${index}.conditional_must_be_unknown`);
    }
    if (control.collection_status !== "collected" && !["unknown", "not_applicable"].includes(control.status as string)) {
      fail(`controls.${index}.uncollected_cannot_pass`);
    }
  });

  const explanations = array(root.score_explanations, "score_explanations");
  const explanationCodes = new Set<string>();
  explanations.forEach((entry, index) => {
    const explanation = record(entry, `score_explanations.${index}`);
    exactKeys(explanation, ["code", "severity", "effect", "category", "control_ids", "points_delta"], `score_explanations.${index}`);
    pattern(explanation.code, CODE, `score_explanations.${index}.code`);
    if (explanationCodes.has(explanation.code as string)) fail(`score_explanations.${index}.code_duplicate`);
    explanationCodes.add(explanation.code as string);
    oneOf(explanation.severity, ["info", "warning", "critical"], `score_explanations.${index}.severity`);
    oneOf(explanation.effect, ["blocks_green", "reduces_score", "coverage_only", "informational"], `score_explanations.${index}.effect`);
    if (explanation.category !== null) oneOf(explanation.category, CATEGORIES, `score_explanations.${index}.category`);
    stringArray(explanation.control_ids, `score_explanations.${index}.control_ids`, CODE);
    for (const id of explanation.control_ids as string[]) {
      if (!controlIds.has(id)) fail(`score_explanations.${index}.unknown_control_id`);
    }
    if (explanation.points_delta !== null) finiteNumber(explanation.points_delta, `score_explanations.${index}.points_delta`);
  });

  const integrity = record(root.integrity, "integrity");
  exactKeys(integrity, ["payload_sha256", "authenticity", "signature"], "integrity");
  pattern(integrity.payload_sha256, SHA256, "integrity.payload_sha256");
  oneOf(integrity.authenticity, ["hash_only", "signed"], "integrity.authenticity");
  if (integrity.signature === null) {
    if (integrity.authenticity !== "hash_only") fail("integrity.signed_without_signature");
  } else {
    if (integrity.authenticity !== "signed") fail("integrity.signature_without_signed_state");
    const signature = record(integrity.signature, "integrity.signature");
    exactKeys(signature, ["algorithm", "key_id", "value"], "integrity.signature");
    equal(signature.algorithm, "ed25519", "integrity.signature.algorithm");
    nonEmptyString(signature.key_id, "integrity.signature.key_id", 128);
    nonEmptyString(signature.value, "integrity.signature.value", 512);
  }

  return value as AssessmentSnapshotV1;
}

export function assessmentSnapshotPayload(snapshot: AssessmentSnapshotV1): AssessmentSnapshotPayloadV1 {
  const payload = { ...snapshot } as AssessmentSnapshotPayloadV1 & {
    integrity?: AssessmentSnapshotV1["integrity"];
  };
  delete payload.integrity;
  return payload;
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(`${path}_must_be_object`);
  return value as Record<string, unknown>;
}

function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail(`${path}_must_be_array`);
  return value;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], path: string) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) fail(`${path}_unexpected_fields`);
}

function equal(value: unknown, expected: string, path: string) {
  if (value !== expected) fail(`${path}_invalid`);
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], path: string) {
  if (typeof value !== "string" || !allowed.includes(value as T)) fail(`${path}_invalid`);
}

function uuid(value: unknown, path: string) {
  pattern(value, UUID, path);
}

function timestamp(value: unknown, path: string) {
  if (typeof value !== "string" || !ISO_TIMESTAMP.test(value) || !Number.isFinite(Date.parse(value))) fail(`${path}_invalid`);
}

function nullableTimestamp(value: unknown, path: string) {
  if (value !== null) timestamp(value, path);
}

function pattern(value: unknown, expected: RegExp, path: string) {
  if (typeof value !== "string" || !expected.test(value)) fail(`${path}_invalid`);
}

function nonEmptyString(value: unknown, path: string, maxLength: number) {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength) fail(`${path}_invalid`);
}

function stringArray(value: unknown, path: string, expected: RegExp) {
  const entries = array(value, path);
  const unique = new Set<string>();
  for (const entry of entries) {
    pattern(entry, expected, `${path}.entry`);
    if (unique.has(entry as string)) fail(`${path}_duplicate`);
    unique.add(entry as string);
  }
}

function percentage(value: unknown, path: string) {
  finiteNumber(value, path);
  if ((value as number) < 0 || (value as number) > 100) fail(`${path}_out_of_range`);
}

function nonNegativeNumber(value: unknown, path: string) {
  finiteNumber(value, path);
  if ((value as number) < 0) fail(`${path}_negative`);
}

function finiteNumber(value: unknown, path: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) fail(`${path}_invalid`);
}

function fail(code: string): never {
  throw new Error(`assessment_snapshot_contract:${code}`);
}
