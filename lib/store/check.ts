import { create } from "zustand";

import { calculateScore, type CheckData, type ScoreInput, type ScoreReport } from "@/lib/security/scoring";
import { DEFAULT_QUESTIONNAIRE_ANSWERS, questionnaireAnswersToCheckData, type QuestionnaireAnswerValue } from "@/lib/security/questionnaire";

type CheckState = {
  currentScore: number;
  currentScoreReport: ScoreReport;
  answers: Record<string, QuestionnaireAnswerValue>;
  setAnswer: (key: string, value: QuestionnaireAnswerValue) => void;
  recalculate: (input?: Partial<ScoreInput>) => void;
};

const initialScoreReport = calculateScore(checkDataFromAnswers(DEFAULT_QUESTIONNAIRE_ANSWERS));

export const useCheckStore = create<CheckState>((set, get) => ({
  currentScore: initialScoreReport.score,
  currentScoreReport: initialScoreReport,
  answers: DEFAULT_QUESTIONNAIRE_ANSWERS,
  setAnswer: (key, value) =>
    set((state) => ({
      answers: { ...state.answers, [key]: value }
    })),
  recalculate: (input) => {
    const answers = get().answers;
    const report = calculateScore(checkDataFromAnswers(answers, input));
    set({ currentScore: report.score, currentScoreReport: report });
  }
}));

function checkDataFromAnswers(answers: Record<string, QuestionnaireAnswerValue>, input?: Partial<ScoreInput>): CheckData {
  return {
    ...questionnaireAnswersToCheckData(answers),
    encryption: input?.encryption,
    externalFindings: input?.externalFindings,
    wlanFindings: input?.wlanFindings,
    wlanSecurityFindings: input?.wlanSecurityFindings
  };
}
