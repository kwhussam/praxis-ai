import { ApiError, apiRequest } from "@/lib/api/client";
import { validateReport, type Report } from "@/lib/ai/report";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ReportListItem = {
  id: string;
  checkId: string | null;
  formatVersion: string | null;
  scoringVersion: string | null;
  summary: Record<string, unknown>;
  pdfPath: string | null;
  createdAt: string;
};

export type LoadedReport = {
  id: string;
  report: Report;
  createdAt: string;
  pdfPath?: string;
};

export class ReportNotFoundError extends Error {
  constructor() {
    super("Bericht nicht gefunden.");
    this.name = "ReportNotFoundError";
  }
}

export async function loadReports(practiceId: string): Promise<ReportListItem[]> {
  requireUuid(practiceId, "Practice-ID");
  const response = await apiRequest<{ reports: ReportListItem[] }>(
    `/api/reports?practiceId=${encodeURIComponent(practiceId)}`
  );
  return response.reports;
}

export async function loadReportById(practiceId: string, reportId: string): Promise<LoadedReport> {
  requireUuid(practiceId, "Practice-ID");
  requireUuid(reportId, "Report-ID");

  try {
    const response = await apiRequest<{
      report: { id: string; content: unknown; createdAt: string; pdfPath?: string };
    }>(`/api/reports/${encodeURIComponent(reportId)}?practiceId=${encodeURIComponent(practiceId)}`);

    if (response.report.id !== reportId) throw new Error("Die Report-ID der Antwort stimmt nicht überein.");
    return {
      id: response.report.id,
      report: validateReport(response.report.content),
      createdAt: response.report.createdAt,
      pdfPath: response.report.pdfPath
    };
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) throw new ReportNotFoundError();
    throw error;
  }
}

function requireUuid(value: string, label: string) {
  if (!UUID_RE.test(value)) throw new Error(`${label} ist ungültig.`);
}
