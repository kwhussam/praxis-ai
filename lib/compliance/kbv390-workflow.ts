import {
  KBV390_CATALOG_ID,
  KBV390_CONTROLS,
  KBV390_SOURCE_SHA256,
  type Kbv390Control,
  type Kbv390EditorialStatus
} from "@/lib/compliance/kbv390-catalog";

export const KBV390_REVIEW_DOMAINS = [
  "healthcare_compliance",
  "security_architecture",
  "privacy_legal"
] as const;

export type Kbv390ReviewDomain = (typeof KBV390_REVIEW_DOMAINS)[number];
export type Kbv390ReleaseMode = "informational_only" | "assessment_eligible";

export type Kbv390Mapping = Readonly<{
  applicability_rule: string;
  evidence_requirements: readonly string[];
  product_control_ids: readonly string[];
  claim_text: string | null;
  release_mode: Kbv390ReleaseMode;
}>;

type EditorialAction = Readonly<{
  actor_id: string;
  occurred_at: string;
  note: string;
}>;

export type Kbv390EditorialRecord = Readonly<{
  schema_version: "1.0.0";
  catalog_id: typeof KBV390_CATALOG_ID;
  source_sha256: typeof KBV390_SOURCE_SHA256;
  control_id: Kbv390Control["id"];
  control_digest_sha256: string;
  status: Kbv390EditorialStatus;
  mapping: Kbv390Mapping;
  mapped: EditorialAction;
  reviews: readonly (EditorialAction & { domain: Kbv390ReviewDomain })[];
  release: (EditorialAction & { role: "product_owner" }) | null;
}>;

export type MapControlCommand = Readonly<{
  actor_id: string;
  occurred_at: string;
  note: string;
  control_digest_sha256: string;
  mapping: Kbv390Mapping;
}>;

export type ReviewControlCommand = Readonly<{
  actor_id: string;
  occurred_at: string;
  note: string;
  domain: Kbv390ReviewDomain;
  expected_control_digest_sha256: string;
}>;

export type ReleaseControlCommand = Readonly<{
  actor_id: string;
  occurred_at: string;
  note: string;
  role: "product_owner";
  expected_control_digest_sha256: string;
}>;

const SHA256 = /^[0-9a-f]{64}$/;
const ACTOR = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{2,127}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

export function createMappedKbv390Record(
  control: Kbv390Control,
  command: MapControlCommand
): Kbv390EditorialRecord {
  assertCanonicalControl(control);
  assertAction(command);
  assertDigest(command.control_digest_sha256);
  assertMapping(command.mapping);
  return {
    schema_version: "1.0.0",
    catalog_id: KBV390_CATALOG_ID,
    source_sha256: KBV390_SOURCE_SHA256,
    control_id: control.id,
    control_digest_sha256: command.control_digest_sha256,
    status: "mapped",
    mapping: freezeMapping(command.mapping),
    mapped: action(command),
    reviews: [],
    release: null
  };
}

export function reviewKbv390Control(
  record: Kbv390EditorialRecord,
  command: ReviewControlCommand
): Kbv390EditorialRecord {
  assertEditorialRecord(record);
  assertAction(command);
  if (!KBV390_REVIEW_DOMAINS.includes(command.domain)) fail("invalid_review_domain");
  if (record.status === "released") fail("released_record_is_immutable");
  if (command.expected_control_digest_sha256 !== record.control_digest_sha256) fail("content_digest_changed");
  if (command.actor_id === record.mapped.actor_id) fail("mapper_cannot_review");
  if (record.reviews.some((review) => review.actor_id === command.actor_id)) fail("review_domains_require_distinct_actors");
  if (record.reviews.some((review) => review.domain === command.domain)) fail("review_domain_already_recorded");
  if (Date.parse(command.occurred_at) < Date.parse(record.mapped.occurred_at)) fail("review_before_mapping");
  const reviews = [...record.reviews, { ...action(command), domain: command.domain }];
  const complete = KBV390_REVIEW_DOMAINS.every((domain) => reviews.some((review) => review.domain === domain));
  return { ...record, status: complete ? "reviewed" : "mapped", reviews };
}

export function releaseKbv390Control(
  record: Kbv390EditorialRecord,
  command: ReleaseControlCommand
): Kbv390EditorialRecord {
  assertEditorialRecord(record);
  assertAction(command);
  if (record.status !== "reviewed") fail("release_requires_all_reviews");
  if (command.expected_control_digest_sha256 !== record.control_digest_sha256) fail("content_digest_changed");
  const priorActors = new Set([record.mapped.actor_id, ...record.reviews.map((review) => review.actor_id)]);
  if (priorActors.has(command.actor_id)) fail("release_requires_independent_actor");
  const latestReview = Math.max(...record.reviews.map((review) => Date.parse(review.occurred_at)));
  if (Date.parse(command.occurred_at) < latestReview) fail("release_before_review");
  if (record.mapping.release_mode === "assessment_eligible") {
    if (record.mapping.evidence_requirements.length === 0) fail("assessment_release_requires_evidence");
    if (record.mapping.product_control_ids.length === 0) fail("assessment_release_requires_product_control");
  }
  return { ...record, status: "released", release: { ...action(command), role: "product_owner" } };
}

export function assertEditorialRecord(record: Kbv390EditorialRecord): void {
  if (record.catalog_id !== KBV390_CATALOG_ID || record.source_sha256 !== KBV390_SOURCE_SHA256) {
    fail("source_binding_invalid");
  }
  assertDigest(record.control_digest_sha256);
  assertMapping(record.mapping);
  assertAction(record.mapped);
  if (!/^KBV-390-A[1-5]-\d{3}$/.test(record.control_id)) fail("invalid_control_id");
  if (!KBV390_CONTROLS.some((control) => control.id === record.control_id)) fail("unknown_control_id");
  if (record.status !== "mapped" && record.status !== "reviewed" && record.status !== "released") {
    fail("invalid_status");
  }
  if (record.release && record.status !== "released") fail("release_without_released_status");
  if (!record.release && record.status === "released") fail("released_status_without_release");
  if (record.reviews.length > KBV390_REVIEW_DOMAINS.length) fail("too_many_reviews");
  record.reviews.forEach((review) => {
    assertAction(review);
    if (!KBV390_REVIEW_DOMAINS.includes(review.domain)) fail("invalid_review_domain");
    if (review.actor_id === record.mapped.actor_id) fail("mapper_cannot_review");
    if (Date.parse(review.occurred_at) < Date.parse(record.mapped.occurred_at)) fail("review_before_mapping");
  });
  const domains = new Set(record.reviews.map((review) => review.domain));
  if (domains.size !== record.reviews.length) fail("duplicate_review_domain");
  const reviewActors = new Set(record.reviews.map((review) => review.actor_id));
  if (reviewActors.size !== record.reviews.length) fail("review_domains_require_distinct_actors");
  const allReviewsComplete = KBV390_REVIEW_DOMAINS.every((domain) => domains.has(domain));
  if (record.status === "mapped" && allReviewsComplete) fail("all_reviews_require_reviewed_status");
  if (record.status === "reviewed" && !KBV390_REVIEW_DOMAINS.every((domain) => domains.has(domain))) {
    fail("reviewed_status_without_all_reviews");
  }
  if (record.release) {
    assertAction(record.release);
    if (record.release.role !== "product_owner") fail("invalid_release_role");
    if (new Set([record.mapped.actor_id, ...reviewActors]).has(record.release.actor_id)) {
      fail("release_requires_independent_actor");
    }
    const latestReview = Math.max(...record.reviews.map((review) => Date.parse(review.occurred_at)));
    if (!allReviewsComplete) fail("released_status_without_all_reviews");
    if (Date.parse(record.release.occurred_at) < latestReview) fail("release_before_review");
    if (record.mapping.release_mode === "assessment_eligible") {
      if (record.mapping.evidence_requirements.length === 0) fail("assessment_release_requires_evidence");
      if (record.mapping.product_control_ids.length === 0) fail("assessment_release_requires_product_control");
    }
  }
}

export function getReleasedKbv390Controls(
  records: readonly Kbv390EditorialRecord[],
  controls: readonly Kbv390Control[] = KBV390_CONTROLS
): readonly Kbv390Control[] {
  const seen = new Set<string>();
  const canonicalIds = new Set(controls.map((control) => control.id));
  for (const record of records) {
    assertEditorialRecord(record);
    if (seen.has(record.control_id)) fail("duplicate_editorial_record");
    if (!canonicalIds.has(record.control_id)) fail("unknown_control_id");
    seen.add(record.control_id);
  }
  const releasedIds = new Set(records.filter((record) => record.status === "released").map((record) => record.control_id));
  return controls.filter((control) => releasedIds.has(control.id));
}

function assertMapping(mapping: Kbv390Mapping) {
  if (!mapping.applicability_rule.trim()) fail("applicability_rule_required");
  if (!Array.isArray(mapping.evidence_requirements) || !Array.isArray(mapping.product_control_ids)) {
    fail("mapping_arrays_required");
  }
  if (mapping.evidence_requirements.some((value) => !value.trim())) fail("invalid_evidence_requirement");
  if (mapping.product_control_ids.some((value) => !value.trim())) fail("invalid_product_control_id");
  if (mapping.claim_text !== null && !mapping.claim_text.trim()) fail("invalid_claim_text");
  if (mapping.release_mode !== "informational_only" && mapping.release_mode !== "assessment_eligible") {
    fail("invalid_release_mode");
  }
}

function assertAction(value: { actor_id: string; occurred_at: string; note: string }) {
  if (!ACTOR.test(value.actor_id)) fail("invalid_actor");
  if (!ISO_TIMESTAMP.test(value.occurred_at) || !Number.isFinite(Date.parse(value.occurred_at))) fail("invalid_timestamp");
  if (!value.note.trim()) fail("note_required");
}

function assertDigest(digest: string) {
  if (!SHA256.test(digest)) fail("invalid_content_digest");
}

function action(value: { actor_id: string; occurred_at: string; note: string }): EditorialAction {
  return { actor_id: value.actor_id, occurred_at: value.occurred_at, note: value.note };
}

function freezeMapping(mapping: Kbv390Mapping): Kbv390Mapping {
  return {
    applicability_rule: mapping.applicability_rule,
    evidence_requirements: [...mapping.evidence_requirements],
    product_control_ids: [...mapping.product_control_ids],
    claim_text: mapping.claim_text,
    release_mode: mapping.release_mode
  };
}

function assertCanonicalControl(control: Kbv390Control) {
  const canonical = KBV390_CONTROLS.find((candidate) => candidate.id === control.id);
  if (!canonical) fail("unknown_control_id");
  if (
    canonical.appendix !== control.appendix ||
    canonical.number !== control.number ||
    canonical.source_page !== control.source_page ||
    canonical.target_object !== control.target_object ||
    canonical.official_title !== control.official_title ||
    canonical.effective_from !== control.effective_from ||
    canonical.practice_scope !== control.practice_scope ||
    canonical.editorial_status !== control.editorial_status ||
    canonical.legacy_control_ids.join("\u0000") !== control.legacy_control_ids.join("\u0000")
  ) fail("control_not_canonical");
}

function fail(code: string): never {
  throw new Error(`kbv390_workflow:${code}`);
}
