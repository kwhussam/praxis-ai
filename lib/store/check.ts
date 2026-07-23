import { create } from "zustand";

import {
  calculateScore,
  type AssessmentProfile,
  type CheckData,
  type ScoreInput,
  type ScoreReport
} from "@/lib/security/scoring";
import {
  DEFAULT_QUESTIONNAIRE_ANSWERS,
  questionnaireAnswersToCheckData,
  type QuestionnaireAnswerKey,
  type QuestionnaireAnswers,
  type QuestionnaireAnswerValue
} from "@/lib/security/questionnaire";

type CheckState = {
  currentScore: number;
  currentScoreReport: ScoreReport;
  assessmentProfile: AssessmentProfile;
  answers: QuestionnaireAnswers;
  setAssessmentProfile: (profile: AssessmentProfile) => void;
  setAnswer: (key: QuestionnaireAnswerKey, value: QuestionnaireAnswerValue) => void;
  replaceAnswers: (answers: QuestionnaireAnswers) => void;
  recalculate: (input?: Partial<ScoreInput>) => void;
};

const initialScoreReport = calculateScore(checkDataFromAnswers(DEFAULT_QUESTIONNAIRE_ANSWERS));

export const useCheckStore = create<CheckState>((set, get) => ({
  currentScore: initialScoreReport.score,
  currentScoreReport: initialScoreReport,
  assessmentProfile: "general",
  answers: DEFAULT_QUESTIONNAIRE_ANSWERS,
  setAssessmentProfile: (assessmentProfile) => {
    const report = calculateScore(checkDataFromAnswers(get().answers, { assessmentProfile }));
    set({ assessmentProfile, currentScore: report.score, currentScoreReport: report });
  },
  setAnswer: (key, value) =>
    set((state) => ({
      answers: { ...state.answers, [key]: value }
    })),
  replaceAnswers: (answers) => set({ answers }),
  recalculate: (input) => {
    const answers = get().answers;
    const assessmentProfile = input?.assessmentProfile ?? get().assessmentProfile;
    const report = calculateScore(checkDataFromAnswers(answers, { ...input, assessmentProfile }));
    set({ assessmentProfile, currentScore: report.score, currentScoreReport: report });
  }
}));

function checkDataFromAnswers(answers: QuestionnaireAnswers, input?: Partial<ScoreInput>): CheckData {
  return {
    ...questionnaireAnswersToCheckData(answers),
    assessment_profile: input?.assessmentProfile,
    encryption: input?.encryption,
    externalFindings: input?.externalFindings,
    wlanFindings: input?.wlanFindings,
    wlanSecurityFindings: input?.wlanSecurityFindings
  };
}
