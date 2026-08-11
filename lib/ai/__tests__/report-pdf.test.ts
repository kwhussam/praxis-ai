let mockResponse: Response;
const mockApiCalls: Array<{ path: string; options: Record<string, unknown> }> = [];
const mockWriteCalls: Array<{ path: string; contents: string; options: Record<string, unknown> }> = [];

declare const jest: { mock(moduleName: string, factory: () => unknown): void };
declare function beforeEach(fn: () => void): void;

jest.mock("@/lib/api/client", () => ({
  apiResponse: async (path: string, options: Record<string, unknown>) => {
    mockApiCalls.push({ path, options });
    return mockResponse;
  }
}));

jest.mock("expo-file-system", () => ({
  documentDirectory: "file:///documents/",
  cacheDirectory: "file:///cache/",
  EncodingType: { Base64: "base64" },
  writeAsStringAsync: async (path: string, contents: string, options: Record<string, unknown>) => {
    mockWriteCalls.push({ path, contents, options });
  }
}));

import { exportReportPdf } from "@/lib/ai/report-pdf";

const practiceId = "11111111-1111-4111-8111-111111111111";
const reportId = "66666666-6666-4666-8666-666666666666";

describe("exportReportPdf", () => {
  beforeEach(() => {
    mockApiCalls.length = 0;
    mockWriteCalls.length = 0;
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
    expect(path).toBe(`file:///documents/PraxisShield-Bericht-${reportId}.pdf`);
    expect(mockWriteCalls).toEqual([{
      path,
      contents: btoa(pdf),
      options: { encoding: "base64" }
    }]);
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
