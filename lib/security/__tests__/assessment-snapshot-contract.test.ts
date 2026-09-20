import {
  assessmentSnapshotPayload,
  parseAssessmentSnapshotV1,
  type AssessmentSnapshotV1
} from "@/lib/security/assessment-snapshot-contract";
import {
  ASSESSMENT_SNAPSHOT_COMPLETE_FIXTURE,
  ASSESSMENT_SNAPSHOT_INSUFFICIENT_COVERAGE_FIXTURE
} from "@/lib/security/__fixtures__/assessmentSnapshots";
import { canonicalizeJsonForHash } from "@/lib/security/canonical-json";

async function payloadHash(snapshot: AssessmentSnapshotV1) {
  const bytes = new TextEncoder().encode(
    JSON.stringify(canonicalizeJsonForHash(assessmentSnapshotPayload(snapshot)))
  );
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe("assessment snapshot v1 contract", () => {
  for (const { name, fixture } of [
    { name: "complete", fixture: ASSESSMENT_SNAPSHOT_COMPLETE_FIXTURE },
    { name: "insufficient coverage", fixture: ASSESSMENT_SNAPSHOT_INSUFFICIENT_COVERAGE_FIXTURE }
  ]) {
    it(`accepts and hash-verifies the ${name} fixture`, async () => {
      expect(await payloadHash(fixture)).toBe(fixture.integrity.payload_sha256);
      expect(parseAssessmentSnapshotV1(fixture)).toBe(fixture);
    });
  }

  it("keeps high technical scores subordinate to posture gates", () => {
    const fixture = ASSESSMENT_SNAPSHOT_INSUFFICIENT_COVERAGE_FIXTURE;

    expect(fixture.technical_scores.overall).toBe(100);
    expect(fixture.posture.ampel).toBe("gelb");
    expect(fixture.posture.gating_reason_codes).toContain("coverage.insufficient");
  });

  it("rejects unknown fields so a contract extension requires a schema bump", () => {
    const changed = {
      ...ASSESSMENT_SNAPSHOT_COMPLETE_FIXTURE,
      future_field: true
    };

    expect(() => parseAssessmentSnapshotV1(changed)).toThrow("assessment_snapshot_contract:snapshot_unexpected_fields");
  });

  it("rejects uncollected evidence represented as a passing control", () => {
    const changed = jsonClone(ASSESSMENT_SNAPSHOT_INSUFFICIENT_COVERAGE_FIXTURE);
    changed.controls[0].status = "met";

    expect(() => parseAssessmentSnapshotV1(changed)).toThrow(
      "assessment_snapshot_contract:controls.0.uncollected_cannot_pass"
    );
  });

  it("rejects a claimed signature without signature material", () => {
    const changed = jsonClone(ASSESSMENT_SNAPSHOT_COMPLETE_FIXTURE);
    changed.integrity.authenticity = "signed";

    expect(() => parseAssessmentSnapshotV1(changed)).toThrow(
      "assessment_snapshot_contract:integrity.signed_without_signature"
    );
  });

  it("keeps a historical snapshot byte-stable when current engine constants change", async () => {
    const stored = jsonClone(ASSESSMENT_SNAPSHOT_COMPLETE_FIXTURE);
    const before = await payloadHash(stored);

    const currentEngineVersion = "assessment-engine-99.0.0";
    const currentPolicyVersion = "de-health-2099.01";

    expect(currentEngineVersion).not.toBe(stored.versions.engine);
    expect(currentPolicyVersion).not.toBe(stored.versions.policy_pack);
    expect(await payloadHash(stored)).toBe(before);
  });
});
