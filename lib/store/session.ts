import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { MMKV } from "react-native-mmkv";

import type { PlanId } from "@/lib/billing/plans";

type Practice = {
  id: string;
  name: string;
  domain?: string;
  email?: string;
  plan: PlanId;
  whiteLabelPartnerId?: string;
};

type SessionState = {
  practice: Practice | null;
  setPractice: (practice: Practice) => void;
  clear: () => void;
};

const storage = new MMKV({ id: "praxisshield-session" });

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      practice: {
        id: "demo-practice",
        name: "Praxis Dr. Schneider",
        domain: "praxis-schneider.de",
        plan: "monitoring"
      },
      setPractice: (practice) => set({ practice }),
      clear: () => set({ practice: null })
    }),
    {
      name: "session",
      storage: createJSONStorage(() => ({
        getItem: (name) => storage.getString(name) ?? null,
        setItem: (name, value) => storage.set(name, value),
        removeItem: (name) => storage.delete(name)
      }))
    }
  )
);
