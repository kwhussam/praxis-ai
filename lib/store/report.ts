import { MMKV } from "react-native-mmkv";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { CheckData, Report } from "@/lib/ai/report";

export type StoredReport = {
  id: string;
  report: Report;
  source: CheckData;
  createdAt: string;
  pdfPath?: string;
};

type ReportState = {
  latest: StoredReport | null;
  saveReport: (report: Report, source: CheckData) => StoredReport;
  setPdfPath: (id: string, pdfPath: string) => void;
  clear: () => void;
};

const storage = new MMKV({ id: "praxisshield-ai-reports" });

export const useReportStore = create<ReportState>()(
  persist(
    (set) => ({
      latest: null,
      saveReport: (report, source) => {
        const storedReport = {
          id: `report-${Date.now()}`,
          report,
          source,
          createdAt: new Date().toISOString()
        };

        set({ latest: storedReport });
        return storedReport;
      },
      setPdfPath: (id, pdfPath) =>
        set((state) => {
          if (!state.latest || state.latest.id !== id) return state;
          return { latest: { ...state.latest, pdfPath } };
        }),
      clear: () => set({ latest: null })
    }),
    {
      name: "ai-report",
      storage: createJSONStorage(() => ({
        getItem: (name) => storage.getString(name) ?? null,
        setItem: (name, value) => storage.set(name, value),
        removeItem: (name) => storage.delete(name)
      }))
    }
  )
);
