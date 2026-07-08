import { create } from "zustand";

import { calculateScore, type CheckData, type ScoreInput, type ScoreReport } from "@/lib/security/scoring";

type CheckState = {
  currentScore: number;
  currentScoreReport: ScoreReport;
  answers: Record<string, boolean>;
  setAnswer: (key: string, value: boolean) => void;
  recalculate: (input?: Partial<ScoreInput>) => void;
};

const defaultAnswers = {
  backups: true,
  mfa: false,
  staffTraining: true,
  patching: false,
  dmarc: false
};

const initialScoreReport = calculateScore(checkDataFromAnswers(defaultAnswers));

export const useCheckStore = create<CheckState>((set, get) => ({
  currentScore: initialScoreReport.score,
  currentScoreReport: initialScoreReport,
  answers: defaultAnswers,
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

function checkDataFromAnswers(answers: Record<string, boolean>, input?: Partial<ScoreInput>): CheckData {
  return {
    mfa_enabled: answers.mfa,
    backup_tested: answers.backups,
    backup_frequency: answers.backups ? "daily" : "none",
    dmarc_exists: answers.dmarc,
    updates_current: answers.patching,
    staff_training: answers.staffTraining,
    privacy_documents_current: answers.privacyDocuments,
    encryption: "UNKNOWN",
    externalFindings: input?.externalFindings,
    wlanFindings: input?.wlanFindings,
    wlanSecurityFindings: input?.wlanSecurityFindings
  };
}
