import { calculateScore, calculateShieldScore, SCORING_VERSION, type CheckData } from "@/lib/security/scoring";
import {
  QUESTIONNAIRE_SECTIONS,
  questionnaireAnswersToCheckData,
  type QuestionnaireAnswerKey
} from "@/lib/security/questionnaire";

const ALL_CHECKS_PASSING: CheckData = {
  mfa_enabled: true,
  backup_tested: true,
  backup_frequency: "daily",
  dmarc_exists: true,
  updates_current: true,
  staff_training: true,
  privacy_documents_current: true,
  responsibilities_defined: true,
  encryption: "WPA3",
  external: {
    email_security: {
      dmarc: {
        policy: "reject"
      }
    }
  },
  externalFindings: [],
  wlanFindings: [],
  wlanSecurityFindings: []
};

const ALL_CHECKS_FAILING: CheckData = {
  mfa_enabled: false,
  backup_tested: false,
  backup_frequency: "none",
  dmarc_exists: false,
  updates_current: false,
  staff_training: false,
  privacy_documents_current: false,
  responsibilities_defined: false,
  encryption: "WEP",
  externalFindings: [{ id: "critical-external", severity: "critical", title: "Critical" }],
  wlanFindings: [{ id: "critical-wlan", severity: "critical", title: "Critical WLAN" }]
};

describe("SecurityScoring", () => {
  it("gibt 0 bis 20 bei allen kritischen Findings zurück", () => {
    const result = calculateScore(ALL_CHECKS_FAILING);
    expect(result.score).toBeLessThanOrEqual(20);
    expect(result.ampel).toBe("rot");
  });

  it("gibt 100 bei allen Checks bestanden zurück", () => {
    const result = calculateScore(ALL_CHECKS_PASSING);
    expect(result.score).toBe(100);
    expect(result.ampel).toBe("grün");
  });

  it("berechnet Teilscore korrekt bei gemischtem Ergebnis", () => {
    const result = calculateScore({
      ...ALL_CHECKS_PASSING,
      mfa_enabled: false,
      dmarc_exists: true,
      external: { email_security: { dmarc: { policy: "none" } } },
      encryption: "WPA2"
    });
    expect(result.score).toBeGreaterThan(40);
    expect(result.score).toBeLessThan(90);
  });

  it("enthält immer eine Scoring-Version im Ergebnis", () => {
    const result = calculateScore(ALL_CHECKS_PASSING);
    expect(result.scoring_version).toBe(SCORING_VERSION);
    expect(result.scoring_version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("liefert transparente Rule Results für jede Regel", () => {
    const result = calculateScore(ALL_CHECKS_PASSING);
    expect(result.rule_results.length).toBeGreaterThanOrEqual(8);
    expect(result.rule_results.every((rule) => rule.evidence.length > 0)).toBe(true);
    expect(result.rule_results.every((rule) => rule.evidence_coverage.score >= 0)).toBe(true);
  });

  it("weist Evidenzquellen pro Prüfmodul aus", () => {
    const result = calculateScore({ ...ALL_CHECKS_PASSING, wlanSecurityFindings: [] });
    const notCheckedResult = calculateScore({} as CheckData);
    const unavailableResult = calculateScore({ encryption: "UNKNOWN" } as CheckData);

    expect(result.rule_results.find((rule) => rule.rule_id === "MFA_ENABLED")?.evidence_coverage.source).toBe("self_reported");
    expect(result.rule_results.find((rule) => rule.rule_id === "DMARC_POLICY")?.evidence_coverage.source).toBe("measured");
    expect(result.rule_results.find((rule) => rule.rule_id === "ACTIVE_FINDINGS")?.evidence_coverage.source).toBe("inferred");
    expect(result.rule_results.find((rule) => rule.rule_id === "ACTIVE_FINDINGS")?.evidence_coverage.label).toBe("Abgeleitet");
    expect(result.rule_results.find((rule) => rule.rule_id === "NETWORK_SECURITY_PROBES")?.evidence_coverage.source).toBe("measured");
    expect(notCheckedResult.rule_results.find((rule) => rule.rule_id === "WLAN_ENCRYPTION")?.evidence_coverage.source).toBe("not_checked");
    expect(unavailableResult.rule_results.find((rule) => rule.rule_id === "WLAN_ENCRYPTION")?.evidence_coverage.source).toBe("unavailable");
  });

  it("berechnet einen separaten gewichteten Evidence-Coverage-Score", () => {
    const measuredCoverage = calculateScore({ ...ALL_CHECKS_PASSING, wlanSecurityFindings: [] });
    const unavailableCoverage = calculateScore({} as CheckData);

    expect(measuredCoverage.evidence_coverage_score).toBeGreaterThan(unavailableCoverage.evidence_coverage_score);
    expect(measuredCoverage.score).toBe(ALL_CHECKS_PASSING_SCORE);
  });

  it("bewertet tägliches Backup ohne Restore-Test nur teilweise", () => {
    const result = calculateScore({ ...ALL_CHECKS_PASSING, backup_tested: false });
    const backup = result.rule_results.find((rule) => rule.rule_id === "BACKUP_TESTED");
    expect(backup?.points_earned).toBe(12);
    expect(backup?.passed).toBe(false);
  });

  it("bewertet DMARC quarantine besser als none", () => {
    const quarantine = calculateScore({ ...ALL_CHECKS_PASSING, external: { email_security: { dmarc: { policy: "quarantine" } } } });
    const none = calculateScore({ ...ALL_CHECKS_PASSING, external: { email_security: { dmarc: { policy: "none" } } } });
    expect(quarantine.score).toBeGreaterThan(none.score);
  });

  it("bewertet WEP als nicht bestanden", () => {
    const result = calculateScore({ ...ALL_CHECKS_PASSING, encryption: "WEP" });
    const wlan = result.rule_results.find((rule) => rule.rule_id === "WLAN_ENCRYPTION");
    expect(wlan?.passed).toBe(false);
    expect(wlan?.points_earned).toBe(0);
  });

  it("wertet konkrete Nachweisfragen in Score-Daten um", () => {
    const checkData = questionnaireAnswersToCheckData({
      mfa: true,
      mfaEvidence: true,
      mfaEmail: true,
      mfaPracticeSoftware: true,
      mfaVpn: true,
      mfaCloudServices: true,
      mfaAdminAccounts: true,
      mfaRemoteMaintenance: true,
      backups: true,
      backupFrequencyDocumented: true,
      backupTargetDocumented: true,
      backupOfflineOrImmutable: true,
      backupOwnerDocumented: true,
      backupDocumented: true,
      restoreTested: true,
      lastRestoreTestDocumented: true,
      restoreTestEvidence: true,
      patching: true,
      patchScopeDocumented: true,
      patchFrequencyDefined: true,
      patchOwnerDocumented: true,
      lastPatchDateDocumented: true,
      patchExceptionsDocumented: true,
      patchingEvidence: true,
      privacyDocuments: true,
      avvAvailable: true,
      tomsAvailable: true,
      processingDirectoryAvailable: true,
      deletionConceptAvailable: true,
      accessConceptAvailable: true,
      privacyTrainingDocumented: true,
      privacyReviewEvidence: true,
      securityOwnerAssigned: true,
      responsibilityDocumented: true,
      staffTraining: true
    });

    expect(checkData.mfa_enabled).toBe(true);
    expect(checkData.backup_frequency).toBe("daily");
    expect(checkData.backup_tested).toBe(true);
    expect(checkData.updates_current).toBe(true);
    expect(checkData.staff_training).toBe(true);
    expect(checkData.privacy_documents_current).toBe(true);
    expect(checkData.responsibilities_defined).toBe(true);
  });

  it("wertet Status ohne Nachweis nicht als vollständig nachgewiesen", () => {
    const checkData = questionnaireAnswersToCheckData({
      mfa: true,
      backups: true,
      restoreTested: true,
      patching: true,
      privacyDocuments: true,
      securityOwnerAssigned: true
    });

    expect(checkData.mfa_enabled).toBe(false);
    expect(checkData.backup_frequency).toBe("weekly");
    expect(checkData.backup_tested).toBe(false);
    expect(checkData.updates_current).toBe(false);
    expect(checkData.privacy_documents_current).toBe(false);
    expect(checkData.responsibilities_defined).toBe(false);
  });

  it("behandelt Weiß-ich-nicht-Antworten als unbekannt statt als Nein", () => {
    const checkData = questionnaireAnswersToCheckData({
      mfa: null,
      backups: null,
      restoreTested: null,
      patching: null,
      privacyDocuments: null,
      securityOwnerAssigned: null,
      staffTraining: null,
      dmarc: null
    });

    expect(checkData.mfa_enabled).toBe(undefined);
    expect(checkData.backup_frequency).toBe(undefined);
    expect(checkData.backup_tested).toBe(undefined);
    expect(checkData.updates_current).toBe(undefined);
    expect(checkData.privacy_documents_current).toBe(undefined);
    expect(checkData.responsibilities_defined).toBe(undefined);
    expect(checkData.staff_training).toBe(undefined);
    expect(checkData.dmarc_exists).toBe(undefined);
  });

  it("enthält die angeforderten Detailfragen im Fragebogenmodell", () => {
    const keys = QUESTIONNAIRE_SECTIONS.flatMap((section) => section.questions.map((question) => question.key));
    const requiredKeys: QuestionnaireAnswerKey[] = [
      "backupFrequencyDocumented",
      "lastRestoreTestDocumented",
      "backupTargetDocumented",
      "backupOfflineOrImmutable",
      "backupOwnerDocumented",
      "mfaEmail",
      "mfaPracticeSoftware",
      "mfaVpn",
      "mfaCloudServices",
      "mfaAdminAccounts",
      "mfaRemoteMaintenance",
      "patchScopeDocumented",
      "patchFrequencyDefined",
      "patchOwnerDocumented",
      "lastPatchDateDocumented",
      "patchExceptionsDocumented",
      "avvAvailable",
      "tomsAvailable",
      "processingDirectoryAvailable",
      "deletionConceptAvailable",
      "accessConceptAvailable",
      "privacyTrainingDocumented",
      "routerAdminPasswordChanged",
      "routerPasswordManagerUsed",
      "routerMfaAvailable",
      "routerRemoteAccessDisabled",
      "routerUpnpDisabled",
      "routerPortForwardsDocumented"
    ];

    requiredKeys.forEach((key) => {
      expect(keys.includes(key)).toBe(true);
    });
  });

  it("wertet nicht ausgeführte technische Prüfungen nicht automatisch als bestanden", () => {
    const result = calculateScore({
      ...ALL_CHECKS_PASSING,
      externalFindings: undefined,
      wlanFindings: undefined,
      wlanSecurityFindings: undefined
    });
    const active = result.rule_results.find((rule) => rule.rule_id === "ACTIVE_FINDINGS");
    const probes = result.rule_results.find((rule) => rule.rule_id === "NETWORK_SECURITY_PROBES");

    expect(active?.passed).toBe(false);
    expect(active?.points_earned).toBe(0);
    expect(active?.evidence_coverage.source).toBe("not_checked");
    expect(probes?.passed).toBe(false);
    expect(probes?.points_earned).toBe(0);
    expect(probes?.evidence_coverage.source).toBe("not_checked");
  });

  it("wertet ausgeführte technische Prüfungen ohne Befund weiterhin als bestanden", () => {
    const result = calculateScore({ ...ALL_CHECKS_PASSING, externalFindings: [], wlanFindings: [], wlanSecurityFindings: [] });
    const active = result.rule_results.find((rule) => rule.rule_id === "ACTIVE_FINDINGS");
    const probes = result.rule_results.find((rule) => rule.rule_id === "NETWORK_SECURITY_PROBES");

    expect(active?.passed).toBe(true);
    expect(active?.points_earned).toBe(5);
    expect(probes?.passed).toBe(true);
    expect(probes?.points_earned).toBe(10);
  });

  it("gruppiert Kategorie-Scores", () => {
    const result = calculateScore(ALL_CHECKS_PASSING);
    expect(result.scores_by_category.access_control).toBe(100);
    expect(result.scores_by_category.backup).toBe(100);
  });

  it("zieht aktive Findings nachvollziehbar ab", () => {
    const result = calculateScore({
      ...ALL_CHECKS_PASSING,
      externalFindings: [{ id: "warn", severity: "warning", title: "Warnung" }]
    });
    const active = result.rule_results.find((rule) => rule.rule_id === "ACTIVE_FINDINGS");
    expect(active?.points_earned).toBe(4);
  });

  it("hält die alte calculateShieldScore API kompatibel", () => {
    const score = calculateShieldScore({
      questionnaire: { backups: true, mfa: true, staffTraining: true, patching: true, dmarc: true, privacyDocuments: true },
      externalFindings: [],
      wlanFindings: []
    });
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});

const ALL_CHECKS_PASSING_SCORE = 100;
