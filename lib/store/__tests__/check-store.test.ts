import {
  DEFAULT_QUESTIONNAIRE_ANSWERS
} from "@/lib/security/questionnaire";
import { useCheckStore } from "@/lib/store/check";

declare function beforeEach(fn: () => void): void;

describe("check store wizard metadata", () => {
  beforeEach(() => {
    useCheckStore.setState({
      answers: { ...DEFAULT_QUESTIONNAIRE_ANSWERS },
      answeredKeys: [],
      assessmentProfile: "general"
    });
  });

  it("merkt eine bewusste Weiß-ich-nicht-Antwort getrennt vom Default null", () => {
    useCheckStore.getState().setAnswer("mfa", null);

    expect(useCheckStore.getState().answers.mfa).toBeNull();
    expect(useCheckStore.getState().answeredKeys).toEqual(["mfa"]);
  });

  it("stellt Antworten und Bearbeitungsmetadaten gemeinsam aus einem Draft wieder her", () => {
    useCheckStore.getState().replaceAnswers(
      { ...DEFAULT_QUESTIONNAIRE_ANSWERS, mfa: true },
      ["mfa", "mfaEmail"]
    );

    expect(useCheckStore.getState().answers.mfa).toBe(true);
    expect(useCheckStore.getState().answeredKeys).toEqual(["mfa", "mfaEmail"]);
  });

  it("behält das Health-Profil bei späteren Recalculate-Aufrufen ohne Profilparameter", () => {
    useCheckStore.getState().setAssessmentProfile("health");
    useCheckStore.getState().recalculate();

    expect(useCheckStore.getState().assessmentProfile).toBe("health");
    expect(useCheckStore.getState().currentScoreReport.assessment_profile).toBe("health");
  });
});
