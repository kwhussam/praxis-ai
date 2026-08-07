import {
  SCORING_VERSION,
  calculateScore,
  type CheckData
} from "@/lib/security/scoring";
import {
  QUESTIONNAIRE_SECTIONS,
  questionnaireAnswersToCheckData,
  questionnaireSectionsForProfile,
  questionnaireSectionStatus
} from "@/lib/security/questionnaire";

const VERIFIED_GENERAL: CheckData = {
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

describe("W4 profile applicability", () => {
  it("behält general als rückwärtskompatibles Standardprofil", () => {
    const implicit = calculateScore(VERIFIED_GENERAL);
    const explicit = calculateScore({ ...VERIFIED_GENERAL, assessment_profile: "general" });
    const healthRule = explicit.rule_results.find(
      (rule) => rule.rule_id === "HEALTH_MEDICAL_DEVICE_SEGMENTATION"
    );

    expect(implicit.assessment_profile).toBe("general");
    expect(explicit.score).toBe(implicit.score);
    expect(explicit.max_points).toBe(implicit.max_points);
    expect(healthRule?.status).toBe("not_applicable");
    expect(healthRule?.applicability_reason).toContain("general");
    expect(healthRule?.recommendation).toBe(undefined);
  });

  it("hält eine ungeklärte Gesundheitsbedingung konservativ im Nenner", () => {
    const general = calculateScore(VERIFIED_GENERAL);
    const health = calculateScore({ ...VERIFIED_GENERAL, assessment_profile: "health" });
    const healthRule = health.rule_results.find(
      (rule) => rule.rule_id === "HEALTH_MEDICAL_DEVICE_SEGMENTATION"
    );

    expect(healthRule?.applicability).toBe("conditional");
    expect(healthRule?.status).toBe("unknown");
    expect(healthRule?.points_earned).toBe(0);
    expect(health.max_points).toBe(general.max_points + 10);
    expect(health.score).toBeLessThan(general.score);
  });

  it("schließt die Gesundheitskontrolle neutral aus, wenn keine Großgeräte vorhanden sind", () => {
    const general = calculateScore(VERIFIED_GENERAL);
    const health = calculateScore({
      ...VERIFIED_GENERAL,
      assessment_profile: "health",
      has_medical_large_devices: false
    });
    const healthRule = health.rule_results.find(
      (rule) => rule.rule_id === "HEALTH_MEDICAL_DEVICE_SEGMENTATION"
    );

    expect(healthRule?.status).toBe("not_applicable");
    expect(healthRule?.applicability_reason).toMatch(/keine medizinischen Großgeräte/i);
    expect(health.score).toBe(general.score);
    expect(health.max_points).toBe(general.max_points);
  });

  it("bewertet vorhandene Großgeräte nur mit vollständig geklärter Segmentierung", () => {
    const open = calculateScore({
      ...VERIFIED_GENERAL,
      assessment_profile: "health",
      has_medical_large_devices: true
    });
    const confirmed = calculateScore({
      ...VERIFIED_GENERAL,
      assessment_profile: "health",
      has_medical_large_devices: true,
      medical_large_devices_segmented: true
    });
    const confirmedRule = confirmed.rule_results.find(
      (rule) => rule.rule_id === "HEALTH_MEDICAL_DEVICE_SEGMENTATION"
    );

    expect(open.rule_results.find(
      (rule) => rule.rule_id === "HEALTH_MEDICAL_DEVICE_SEGMENTATION"
    )?.status).toBe("unknown");
    expect(confirmedRule?.status).toBe("met");
    expect(confirmedRule?.points_before_evidence_cap).toBe(10);
    expect(confirmedRule?.points_earned).toBe(5);
    expect(confirmedRule?.control_ids).toEqual(["KBV-ITS-ANLAGE4-6"]);
    expect(confirmed.score).toBeGreaterThan(open.score);
  });

  it("versioniert Profil- und Freshness-Semantik getrennt von W3", () => {
    expect(SCORING_VERSION).toBe("2.2.0");
  });

  it("führt Gesundheitsfragen nur im Health-Profil und mappt sie in die Engine", () => {
    const healthSection = QUESTIONNAIRE_SECTIONS.find(
      (section) => section.title === "Medizinische Großgeräte"
    );
    const data = questionnaireAnswersToCheckData({
      hasMedicalLargeDevices: true,
      medicalLargeDevicesSegmented: false
    });

    expect(healthSection?.profile_scope).toEqual(["health"]);
    expect(data.has_medical_large_devices).toBe(true);
    expect(data.medical_large_devices_segmented).toBe(false);
  });

  it("verwendet stabile Section-IDs und filtert das Health-Modul profilabhängig", () => {
    const general = questionnaireSectionsForProfile("general");
    const health = questionnaireSectionsForProfile("health");

    expect(new Set(QUESTIONNAIRE_SECTIONS.map((section) => section.id)).size).toBe(
      QUESTIONNAIRE_SECTIONS.length
    );
    expect(general.some((section) => section.id === "health_medical_devices")).toBe(false);
    expect(health.some((section) => section.id === "health_medical_devices")).toBe(true);
  });

  it("trennt nicht begonnen, teilweise und vollständig – auch bei bewusstem Weiß-ich-nicht", () => {
    const section = QUESTIONNAIRE_SECTIONS.find((candidate) => candidate.id === "security_responsibilities");
    if (!section) throw new Error("missing_test_section");

    expect(questionnaireSectionStatus(section, [])).toBe("unknown");
    expect(questionnaireSectionStatus(section, ["securityOwnerAssigned"])).toBe("partial");
    expect(
      questionnaireSectionStatus(section, ["securityOwnerAssigned", "responsibilityDocumented"])
    ).toBe("complete");
  });
});
