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
  latestQuestionnaireCheckId: string | null;
  currentScore: number;
  currentScoreReport: ScoreReport;
  assessmentProfile: AssessmentProfile;
  answers: QuestionnaireAnswers;
  answeredKeys: QuestionnaireAnswerKey[];
  setAssessmentProfile: (profile: AssessmentProfile) => void;
  setAnswer: (key: QuestionnaireAnswerKey, value: QuestionnaireAnswerValue) => void;
  replaceAnswers: (answers: QuestionnaireAnswers, answeredKeys?: QuestionnaireAnswerKey[]) => void;
  setLatestQuestionnaireCheck: (checkId: string, scoreReport: ScoreReport) => void;
  recalculate: (input?: Partial<ScoreInput>) => void;
};

const initialScoreReport = calculateScore(checkDataFromAnswers(DEFAULT_QUESTIONNAIRE_ANSWERS));

export const useCheckStore = create<CheckState>((set, get) => ({
  latestQuestionnaireCheckId: null,
  currentScore: initialScoreReport.score,
  currentScoreReport: initialScoreReport,
  assessmentProfile: "general",
  answers: DEFAULT_QUESTIONNAIRE_ANSWERS,
  answeredKeys: [],
  setAssessmentProfile: (assessmentProfile) => {
    const report = calculateScore(checkDataFromAnswers(get().answers, { assessmentProfile }));
    set({ assessmentProfile, currentScore: report.score, currentScoreReport: report });
  },
  setAnswer: (key, value) =>
    set((state) => ({
      answers: { ...state.answers, [key]: value },
      answeredKeys: state.answeredKeys.includes(key) ? state.answeredKeys : [...state.answeredKeys, key]
    })),
  replaceAnswers: (answers, answeredKeys = []) => set({ answers, answeredKeys }),
  setLatestQuestionnaireCheck: (latestQuestionnaireCheckId, currentScoreReport) =>
    set({
      latestQuestionnaireCheckId,
      currentScore: currentScoreReport.score,
      currentScoreReport
    }),
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
