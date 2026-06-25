import { calculateScore, calculateShieldScore, SCORING_VERSION, type CheckData } from "@/lib/security/scoring";

const ALL_CHECKS_PASSING: CheckData = {
  mfa_enabled: true,
  backup_tested: true,
  backup_frequency: "daily",
  dmarc_exists: true,
  updates_current: true,
  staff_training: true,
  privacy_documents_current: true,
  encryption: "WPA3",
  external: {
    email_security: {
      dmarc: {
        policy: "reject"
      }
    }
  },
  externalFindings: [],
  wlanFindings: []
};

const ALL_CHECKS_FAILING: CheckData = {
  mfa_enabled: false,
  backup_tested: false,
  backup_frequency: "none",
  dmarc_exists: false,
  updates_current: false,
  staff_training: false,
  privacy_documents_current: false,
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
    expect(score).toBeGreaterThanOrEqual(75);
  });
});
