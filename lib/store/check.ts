import { create } from "zustand";

import { calculateShieldScore, type ScoreInput } from "@/lib/security/scoring";

type CheckState = {
  currentScore: number;
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

export const useCheckStore = create<CheckState>((set, get) => ({
  currentScore: 68,
  answers: defaultAnswers,
  setAnswer: (key, value) =>
    set((state) => ({
      answers: { ...state.answers, [key]: value }
    })),
  recalculate: (input) => {
    const answers = get().answers;
    const score = calculateShieldScore({
      questionnaire: answers,
      externalFindings: input?.externalFindings ?? [],
      wlanFindings: input?.wlanFindings ?? [],
      wlanSecurityFindings: input?.wlanSecurityFindings
    });
    set({ currentScore: score });
  }
}));
