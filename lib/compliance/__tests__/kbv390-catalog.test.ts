import {
  KBV390_CONTROLS,
  KBV390_SOURCE_SHA256,
  assertKbv390Catalog,
  determineKbv390Applicability
} from "@/lib/compliance/kbv390-catalog";
import {
  createMappedKbv390Record,
  getReleasedKbv390Controls,
  releaseKbv390Control,
  reviewKbv390Control,
  type Kbv390EditorialRecord,
  type Kbv390Mapping,
  type Kbv390ReviewDomain
} from "@/lib/compliance/kbv390-workflow";

const DIGEST = "a".repeat(64);
const mapping: Kbv390Mapping = {
  applicability_rule: "Zielobjekt wird eingesetzt",
  evidence_requirements: ["Dokumentierter technischer oder organisatorischer Nachweis"],
  product_control_ids: ["AC.TEST.001"],
  claim_text: null,
  release_mode: "assessment_eligible"
};

describe("KBV § 390 control inventory", () => {
  it("captures exactly the 92 official requirements with stable appendix counts", () => {
    expect(() => assertKbv390Catalog()).not.toThrow();
    expect(KBV390_CONTROLS).toHaveLength(92);
    expect(KBV390_SOURCE_SHA256).toHaveLength(64);
    expect(Object.fromEntries([1, 2, 3, 4, 5].map((appendix) => [
      appendix,
      KBV390_CONTROLS.filter((control) => control.appendix === appendix).length
    ]))).toEqual({ 1: 50, 2: 10, 3: 17, 4: 6, 5: 9 });
    expect(KBV390_CONTROLS.filter((control) => control.effective_from === "2025-10-01")).toHaveLength(29);
  });

  it("starts every imported requirement as mapped and exposes no unreviewed release", () => {
    expect(new Set(KBV390_CONTROLS.map((control) => control.editorial_status))).toEqual(new Set(["mapped"]));
    expect(getReleasedKbv390Controls([])).toEqual([]);
  });

  it("retains the existing medical-device segmentation control alias", () => {
    const segmentation = KBV390_CONTROLS.find((control) => control.id === "KBV-390-A4-006");
    expect(segmentation?.legacy_control_ids).toEqual(["KBV-ITS-ANLAGE4-6"]);
  });

  it("derives applicability without turning unknown context into not applicable", () => {
    const mediumControl = requiredControl("KBV-390-A2-001");
    expect(determineKbv390Applicability(mediumControl, context("practice"))).toEqual({
      status: "not_applicable",
      reason_code: "practice_size"
    });

    const medicalControl = requiredControl("KBV-390-A4-006");
    expect(determineKbv390Applicability(medicalControl, context("large"))).toEqual({
      status: "conditional",
      reason_code: "medical_large_devices_unknown"
    });
    expect(determineKbv390Applicability(medicalControl, {
      ...context("large"),
      uses_medical_large_devices: true,
      used_target_objects: ["Medizinische Großgeräte"]
    })).toEqual({ status: "applicable", reason_code: "applicable" });
  });
});

describe("KBV § 390 editorial workflow", () => {
  it("requires all independent reviews before an independent product owner may release", () => {
    let record = mappedRecord();
    expect(() => release(record)).toThrow("kbv390_workflow:release_requires_all_reviews");
    expect(() => review(record, "healthcare_compliance", "editor:mapper"))
      .toThrow("kbv390_workflow:mapper_cannot_review");

    record = review(record, "healthcare_compliance", "reviewer:healthcare");
    record = review(record, "security_architecture", "reviewer:security");
    expect(record.status).toBe("mapped");
    record = review(record, "privacy_legal", "reviewer:legal");
    expect(record.status).toBe("reviewed");

    const released = release(record);
    expect(released.status).toBe("released");
    expect(released.release?.role).toBe("product_owner");
    expect(getReleasedKbv390Controls([released]).map((control) => control.id)).toEqual(["KBV-390-A1-001"]);
  });

  it("binds reviews and release to the exact content digest", () => {
    const record = mappedRecord();
    expect(() => reviewKbv390Control(record, {
      actor_id: "reviewer:healthcare",
      occurred_at: "2026-09-24T09:00:00.000Z",
      note: "Fachprüfung",
      domain: "healthcare_compliance",
      expected_control_digest_sha256: "b".repeat(64)
    })).toThrow("kbv390_workflow:content_digest_changed");
  });

  it("requires separate reviewers and chronological actions", () => {
    let record = mappedRecord();
    record = review(record, "healthcare_compliance", "reviewer:one");
    expect(() => review(record, "security_architecture", "reviewer:one"))
      .toThrow("kbv390_workflow:review_domains_require_distinct_actors");
    expect(() => reviewKbv390Control(record, {
      actor_id: "reviewer:two",
      occurred_at: "2026-09-24T07:59:59.000Z",
      note: "Ungültig rückdatierte Prüfung",
      domain: "security_architecture",
      expected_control_digest_sha256: DIGEST
    })).toThrow("kbv390_workflow:review_before_mapping");
  });

  it("never releases an assessment mapping without evidence and product binding", () => {
    let record = mappedRecord({ evidence_requirements: [], product_control_ids: [] });
    record = review(record, "healthcare_compliance", "reviewer:healthcare");
    record = review(record, "security_architecture", "reviewer:security");
    record = review(record, "privacy_legal", "reviewer:legal");
    expect(() => release(record)).toThrow("kbv390_workflow:assessment_release_requires_evidence");
  });
});

function requiredControl(id: (typeof KBV390_CONTROLS)[number]["id"]) {
  const control = KBV390_CONTROLS.find((candidate) => candidate.id === id);
  if (!control) throw new Error(`missing test control ${id}`);
  return control;
}

function context(practiceSize: "practice" | "medium" | "large") {
  return {
    practice_size: practiceSize,
    uses_medical_large_devices: null,
    uses_ti_components: null
  } as const;
}

function mappedRecord(overrides: Partial<Kbv390Mapping> = {}) {
  return createMappedKbv390Record(requiredControl("KBV-390-A1-001"), {
    actor_id: "editor:mapper",
    occurred_at: "2026-09-24T08:00:00.000Z",
    note: "Technische Quellzuordnung",
    control_digest_sha256: DIGEST,
    mapping: { ...mapping, ...overrides }
  });
}

function review(record: Kbv390EditorialRecord, domain: Kbv390ReviewDomain, actorId: string) {
  return reviewKbv390Control(record, {
    actor_id: actorId,
    occurred_at: "2026-09-24T09:00:00.000Z",
    note: `Freigabe ${domain}`,
    domain,
    expected_control_digest_sha256: DIGEST
  });
}

function release(record: Kbv390EditorialRecord) {
  return releaseKbv390Control(record, {
    actor_id: "owner:product",
    occurred_at: "2026-09-24T10:00:00.000Z",
    note: "Produktfreigabe nach vollständigem Review",
    role: "product_owner",
    expected_control_digest_sha256: DIGEST
  });
}
