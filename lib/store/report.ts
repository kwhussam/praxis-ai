import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { CheckData, Report } from "@/lib/ai/report";
import { SAMPLE_REPORT, SAMPLE_REPORT_SOURCE } from "@/lib/ai/sample-report";
import { createStringStorage } from "@/lib/store/storage";

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

const storage = createStringStorage("praxisshield-ai-reports");
export const SAMPLE_STORED_REPORT: StoredReport = {
  id: "sample-report",
  report: SAMPLE_REPORT,
  source: SAMPLE_REPORT_SOURCE,
  createdAt: new Date(2026, 0, 15, 9, 0, 0).toISOString()
};

export const useReportStore = create<ReportState>()(
  persist(
    (set) => ({
      latest: SAMPLE_STORED_REPORT,
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
      clear: () => set({ latest: SAMPLE_STORED_REPORT })
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
