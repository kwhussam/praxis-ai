import {
  KBV390_CONTROLS,
  KBV390_SOURCE_SHA256,
  KBV390_TARGET_OBJECT_IDS,
  assertKbv390Catalog,
  determineKbv390Applicability,
  type Kbv390Control,
  type PracticeSize
} from "@/lib/compliance/kbv390-catalog";
import {
  KBV390_MAX_FUTURE_SKEW_MS,
  createMappedKbv390Record,
  getReleasedKbv390Controls,
  releaseKbv390Control,
  reviewKbv390Control,
  type Kbv390EditorialRecord,
  type Kbv390Mapping,
  type Kbv390ReviewDomain
} from "@/lib/compliance/kbv390-workflow";

const NOW = Date.parse("2026-09-27T12:00:00.000Z");
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
    expect(KBV390_SOURCE_SHA256).toMatch(/^[0-9a-f]{64}$/);
    expect(Object.fromEntries([1, 2, 3, 4, 5].map((appendix) => [
      appendix,
      KBV390_CONTROLS.filter((control) => control.appendix === appendix).length
    ]))).toEqual({ 1: 50, 2: 10, 3: 17, 4: 6, 5: 9 });
    expect(KBV390_CONTROLS.filter((control) => control.effective_from === "2025-10-01")).toHaveLength(29);
  });

  it("keeps source controls deeply immutable and exposes no release without editorial records", async () => {
    expect(Object.isFrozen(KBV390_CONTROLS)).toBe(true);
    expect(Object.isFrozen(KBV390_CONTROLS[0])).toBe(true);
    expect(Object.isFrozen(KBV390_CONTROLS[0].legacy_control_ids)).toBe(true);
    expect(Object.isFrozen(KBV390_TARGET_OBJECT_IDS)).toBe(true);
    expect(await getReleasedKbv390Controls([], NOW)).toEqual([]);
  });

  it("retains the existing medical-device segmentation control alias", () => {
    const segmentation = KBV390_CONTROLS.find((control) => control.id === "KBV-390-A4-006");
    expect(segmentation?.legacy_control_ids).toEqual(["KBV-ITS-ANLAGE4-6"]);
  });

  it("does not guess applicability when practice size is unknown", () => {
    expect(determineKbv390Applicability(requiredControl("KBV-390-A2-001"), context(null))).toEqual({
      status: "conditional",
      reason_code: "practice_size_unknown"
    });
    expect(determineKbv390Applicability(requiredControl("KBV-390-A3-001"), context(null))).toEqual({
      status: "conditional",
      reason_code: "practice_size_unknown"
    });
    expect(determineKbv390Applicability(requiredControl("KBV-390-A2-001"), {
      ...context(null),
      practice_size: "unbekannt" as never
    })).toEqual({ status: "conditional", reason_code: "practice_size_unknown" });
    expect(determineKbv390Applicability(requiredControl("KBV-390-A2-001"), context("practice"))).toEqual({
      status: "not_applicable",
      reason_code: "practice_size"
    });
  });

  it("uses canonical target IDs and treats malformed target inventories as unknown", () => {
    const medicalControl = requiredControl("KBV-390-A4-006");
    expect(determineKbv390Applicability(medicalControl, context("large"))).toEqual({
      status: "conditional",
      reason_code: "medical_large_devices_unknown"
    });
    expect(determineKbv390Applicability(medicalControl, {
      ...context("large"),
      uses_medical_large_devices: true,
      used_target_object_ids: ["medical_large_devices"]
    })).toEqual({ status: "applicable", reason_code: "applicable" });
    expect(determineKbv390Applicability(medicalControl, {
      ...context("large"),
      uses_medical_large_devices: true,
      used_target_object_ids: ["medical-large-device-typo"] as never
    })).toEqual({ status: "conditional", reason_code: "target_inventory_invalid" });
  });
});

describe("KBV § 390 editorial workflow", () => {
  it("requires all independent reviews before an independent product owner may release", async () => {
    let record = await mappedRecord();
    await expect(release(record)).rejects.toThrow("kbv390_workflow:release_requires_all_reviews");
    await expect(review(record, "healthcare_compliance", "editor:mapper"))
      .rejects.toThrow("kbv390_workflow:mapper_cannot_review");

    record = await review(record, "healthcare_compliance", "reviewer:healthcare");
    record = await review(record, "security_architecture", "reviewer:security");
    expect(record.status).toBe("mapped");
    record = await review(record, "privacy_legal", "reviewer:legal");
    expect(record.status).toBe("reviewed");

    const released = await release(record);
    expect(released.status).toBe("released");
    expect(released.release?.role).toBe("product_owner");
    expect((await getReleasedKbv390Controls([released], NOW)).map((control) => control.id))
      .toEqual(["KBV-390-A1-001"]);
  });

  it("derives the digest from canonical content and rejects post-review content drift", async () => {
    let record = await mappedRecord();
    expect(record.control_digest_sha256).toMatch(/^[0-9a-f]{64}$/);
    record = await review(record, "healthcare_compliance", "reviewer:healthcare");
    record = await review(record, "security_architecture", "reviewer:security");
    record = await review(record, "privacy_legal", "reviewer:legal");
    const released = await release(record);
    const tampered = {
      ...released,
      mapping: { ...released.mapping, applicability_rule: "Nach Freigabe verändert" }
    } as Kbv390EditorialRecord;

    await expect(getReleasedKbv390Controls([tampered], NOW))
      .rejects.toThrow("kbv390_workflow:content_digest_changed");
    await expect(createMappedKbv390Record({
      ...requiredControl("KBV-390-A1-001"),
      official_title: "Veränderter Quelltitel"
    } as Kbv390Control, mapCommand(), NOW)).rejects.toThrow("kbv390_workflow:control_not_canonical");
  });

  it("returns deeply immutable records", async () => {
    const record = await mappedRecord();
    expect(Object.isFrozen(record)).toBe(true);
    expect(Object.isFrozen(record.mapping)).toBe(true);
    expect(Object.isFrozen(record.mapping.evidence_requirements)).toBe(true);
    expect(Object.isFrozen(record.reviews)).toBe(true);
  });

  it("requires separate reviewers and chronological actions", async () => {
    let record = await mappedRecord();
    record = await review(record, "healthcare_compliance", "reviewer:one");
    await expect(review(record, "security_architecture", "reviewer:one"))
      .rejects.toThrow("kbv390_workflow:review_domains_require_distinct_actors");
    await expect(reviewKbv390Control(record, {
      actor_id: "reviewer:two",
      occurred_at: "2026-09-24T07:59:59.000Z",
      note: "Ungültig rückdatierte Prüfung",
      domain: "security_architecture"
    }, NOW)).rejects.toThrow("kbv390_workflow:review_before_mapping");
  });

  it("rejects timestamps beyond the documented two-minute clock-skew tolerance", async () => {
    const occurredAt = new Date(NOW + KBV390_MAX_FUTURE_SKEW_MS + 1).toISOString();
    await expect(createMappedKbv390Record(requiredControl("KBV-390-A1-001"), {
      ...mapCommand(),
      occurred_at: occurredAt
    }, NOW)).rejects.toThrow("kbv390_workflow:timestamp_too_far_in_future");
  });

  it("never releases an assessment mapping without evidence and product binding", async () => {
    let record = await mappedRecord({ evidence_requirements: [], product_control_ids: [] });
    record = await review(record, "healthcare_compliance", "reviewer:healthcare");
    record = await review(record, "security_architecture", "reviewer:security");
    record = await review(record, "privacy_legal", "reviewer:legal");
    await expect(release(record)).rejects.toThrow("kbv390_workflow:assessment_release_requires_evidence");
  });
});

function requiredControl(id: (typeof KBV390_CONTROLS)[number]["id"]) {
  const control = KBV390_CONTROLS.find((candidate) => candidate.id === id);
  if (!control) throw new Error(`missing test control ${id}`);
  return control;
}

function context(practiceSize: PracticeSize | null) {
  return {
    practice_size: practiceSize,
    uses_medical_large_devices: null,
    uses_ti_components: null
  } as const;
}

function mapCommand(overrides: Partial<Kbv390Mapping> = {}) {
  return {
    actor_id: "editor:mapper",
    occurred_at: "2026-09-24T08:00:00.000Z",
    note: "Technische Quellzuordnung",
    mapping: { ...mapping, ...overrides }
  } as const;
}

function mappedRecord(overrides: Partial<Kbv390Mapping> = {}) {
  return createMappedKbv390Record(requiredControl("KBV-390-A1-001"), mapCommand(overrides), NOW);
}

function review(record: Kbv390EditorialRecord, domain: Kbv390ReviewDomain, actorId: string) {
  return reviewKbv390Control(record, {
    actor_id: actorId,
    occurred_at: "2026-09-24T09:00:00.000Z",
    note: `Freigabe ${domain}`,
    domain
  }, NOW);
}

function release(record: Kbv390EditorialRecord) {
  return releaseKbv390Control(record, {
    actor_id: "owner:product",
    occurred_at: "2026-09-24T10:00:00.000Z",
    note: "Produktfreigabe nach vollständigem Review",
    role: "product_owner"
  }, NOW);
}
