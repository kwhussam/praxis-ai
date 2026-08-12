let mockResponse: Response;
const mockApiCalls: Array<{ path: string; options: Record<string, unknown> }> = [];
const mockWriteCalls: Array<{ path: string; contents: string; options: Record<string, unknown> }> = [];
const mockDirectoryCalls: Array<{ path: string; options: Record<string, unknown> }> = [];
const mockDeleteCalls: Array<{ path: string; options: Record<string, unknown> }> = [];

declare const jest: { mock(moduleName: string, factory: () => unknown): void };
declare function beforeEach(fn: () => void): void;

jest.mock("@/lib/api/client", () => ({
  apiResponse: async (path: string, options: Record<string, unknown>) => {
    mockApiCalls.push({ path, options });
    return mockResponse;
  }
}));

jest.mock("expo-file-system", () => ({
  cacheDirectory: "file:///cache/",
  EncodingType: { Base64: "base64" },
  makeDirectoryAsync: async (path: string, options: Record<string, unknown>) => {
    mockDirectoryCalls.push({ path, options });
  },
  deleteAsync: async (path: string, options: Record<string, unknown>) => {
    mockDeleteCalls.push({ path, options });
  },
  writeAsStringAsync: async (path: string, contents: string, options: Record<string, unknown>) => {
    mockWriteCalls.push({ path, contents, options });
  }
}));

import { clearCachedReportPdfs, exportReportPdf } from "@/lib/ai/report-pdf";

const practiceId = "11111111-1111-4111-8111-111111111111";
const reportId = "66666666-6666-4666-8666-666666666666";

describe("exportReportPdf", () => {
  beforeEach(() => {
    mockApiCalls.length = 0;
    mockWriteCalls.length = 0;
    mockDirectoryCalls.length = 0;
    mockDeleteCalls.length = 0;
  });

  it("cached ausschließlich die Bytes des kanonischen Server-PDFs", async () => {
    const pdf = "%PDF-1.4\ncanonical-fixture";
    mockResponse = new Response(pdf, { headers: { "content-type": "application/pdf" } });

    const path = await exportReportPdf({ practiceId, reportId });

    expect(mockApiCalls).toEqual([{
      path: "/api/report/pdf",
      options: {
        method: "POST",
        body: { practiceId, reportId },
        timeoutMs: 60_000
      }
    }]);
    expect(path).toBe(`file:///cache/praxisshield-report-cache/${practiceId}/PraxisShield-Bericht-${reportId}.pdf`);
    expect(mockDirectoryCalls).toEqual([{
      path: `file:///cache/praxisshield-report-cache/${practiceId}/`,
      options: { intermediates: true }
    }]);
    expect(mockWriteCalls).toEqual([{
      path,
      contents: btoa(pdf),
      options: { encoding: "base64" }
    }]);
  });

  it("löscht den Tenant-Cache beim Praxiswechsel und den gesamten Cache beim Logout", async () => {
    await clearCachedReportPdfs(practiceId);
    await clearCachedReportPdfs();

    expect(mockDeleteCalls).toEqual([
      {
        path: `file:///cache/praxisshield-report-cache/${practiceId}/`,
        options: { idempotent: true }
      },
      {
        path: "file:///cache/praxisshield-report-cache/",
        options: { idempotent: true }
      }
    ]);
  });

  it("sendet weder Reportinhalt noch frei wählbare Metadaten", async () => {
    mockResponse = new Response("%PDF-1.4\nfixture", { headers: { "content-type": "application/pdf" } });
    await exportReportPdf({ practiceId, reportId });

    const body = (mockApiCalls[0].options.body ?? {}) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["practiceId", "reportId"]);
  });

  it("verwirft Antworten ohne PDF-Signatur vor dem lokalen Schreiben", async () => {
    mockResponse = new Response("not-a-pdf", { headers: { "content-type": "application/pdf" } });

    await expect(exportReportPdf({ practiceId, reportId })).rejects.toThrow("PDF-Signatur");
    expect(mockWriteCalls).toHaveLength(0);
  });
});
