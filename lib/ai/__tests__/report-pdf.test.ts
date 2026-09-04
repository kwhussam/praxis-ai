let mockResponse: Response;
const mockApiCalls: Array<{ path: string; options: Record<string, unknown> }> = [];
const mockWriteCalls: Array<{ uri: string; bytes: number[] }> = [];
const mockDirectoryCalls: Array<{ uri: string; options: Record<string, unknown> }> = [];
const mockFileCreateCalls: Array<{ uri: string; options: Record<string, unknown> }> = [];
const mockDeleteCalls: string[] = [];
const mockShareCalls: Array<{ path: string; options: Record<string, unknown> }> = [];
let mockSharingAvailable = true;
let mockWriteShouldFail = false;
// Entries the fake filesystem currently holds; drives the idempotent-delete contract.
const mockExisting = new Set<string>();

declare const jest: { mock(moduleName: string, factory: () => unknown): void };
declare function beforeEach(fn: () => void): void;

jest.mock("@/lib/api/client", () => ({
  apiResponse: async (path: string, options: Record<string, unknown>) => {
    mockApiCalls.push({ path, options });
    return mockResponse;
  }
}));

// SDK 57 File/Directory API. The constructors join their segments into a file:// URI and the
// filesystem operations are synchronous.
jest.mock("expo-file-system", () => {
  // Strip trailing slashes per segment and rejoin, so a Directory's trailing slash never
  // produces a double and the file:/// scheme stays intact.
  function join(parts: unknown[]): string {
    return parts
      .map((part) => (typeof part === "string" ? part : (part as { uri: string }).uri))
      .map((uri) => uri.replace(/\/+$/, ""))
      .join("/");
  }

  class MockDirectory {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = `${join(parts)}/`;
    }
    get exists() {
      return mockExisting.has(this.uri);
    }
    create(options: Record<string, unknown>) {
      mockDirectoryCalls.push({ uri: this.uri, options });
      mockExisting.add(this.uri);
    }
    delete() {
      mockDeleteCalls.push(this.uri);
      mockExisting.delete(this.uri);
    }
  }

  class MockFile {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = join(parts);
    }
    get exists() {
      return mockExisting.has(this.uri);
    }
    create(options: Record<string, unknown>) {
      mockFileCreateCalls.push({ uri: this.uri, options });
      mockExisting.add(this.uri);
    }
    write(bytes: Uint8Array) {
      if (mockWriteShouldFail) throw new Error("disk_write_failed");
      mockWriteCalls.push({ uri: this.uri, bytes: Array.from(bytes) });
      mockExisting.add(this.uri);
    }
    delete() {
      mockDeleteCalls.push(this.uri);
      mockExisting.delete(this.uri);
    }
  }

  return {
    Directory: MockDirectory,
    File: MockFile,
    Paths: { cache: { uri: "file:///cache" } }
  };
});

jest.mock("expo-sharing", () => ({
  isAvailableAsync: async () => mockSharingAvailable,
  shareAsync: async (path: string, options: Record<string, unknown>) => {
    mockShareCalls.push({ path, options });
  }
}));

import { clearCachedReportPdfs, exportReportPdf, shareReportPdf } from "@/lib/ai/report-pdf";

const practiceId = "11111111-1111-4111-8111-111111111111";
const reportId = "66666666-6666-4666-8666-666666666666";
const cacheRoot = "file:///cache/praxisshield-report-cache/";
const tenantDirectory = `${cacheRoot}${practiceId}/`;
const pdfPath = `${tenantDirectory}PraxisShield-Bericht-${reportId}.pdf`;

describe("exportReportPdf", () => {
  beforeEach(() => {
    mockApiCalls.length = 0;
    mockWriteCalls.length = 0;
    mockDirectoryCalls.length = 0;
    mockFileCreateCalls.length = 0;
    mockDeleteCalls.length = 0;
    mockShareCalls.length = 0;
    mockSharingAvailable = true;
    mockWriteShouldFail = false;
    mockExisting.clear();
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
    expect(path).toBe(pdfPath);
    expect(mockDirectoryCalls).toEqual([{
      uri: tenantDirectory,
      options: { intermediates: true, idempotent: true }
    }]);
    expect(mockFileCreateCalls).toEqual([{ uri: pdfPath, options: { overwrite: true } }]);
    // The bytes are written verbatim; SDK 57 needs no base64 round-trip.
    expect(mockWriteCalls).toEqual([{
      uri: pdfPath,
      bytes: Array.from(new TextEncoder().encode(pdf))
    }]);
  });

  it("legt Exporte ausschließlich im nicht-persistenten Cache ab", async () => {
    mockResponse = new Response("%PDF-1.4\nfixture", { headers: { "content-type": "application/pdf" } });

    const path = await exportReportPdf({ practiceId, reportId });

    // Never the document directory or any other backup-eligible location.
    expect(path.startsWith("file:///cache/")).toBe(true);
    expect(path).not.toContain("document");
    expect(path).toContain(`/${practiceId}/`);
  });

  it("löscht den Tenant-Cache beim Praxiswechsel und den gesamten Cache beim Logout", async () => {
    mockExisting.add(tenantDirectory);
    mockExisting.add(cacheRoot);

    await clearCachedReportPdfs(practiceId);
    await clearCachedReportPdfs();

    expect(mockDeleteCalls).toEqual([tenantDirectory, cacheRoot]);
  });

  it("bleibt bei bereits leerem Cache fehlerfrei und löscht nichts", async () => {
    // SDK 57 throws when deleting a missing entry; logout must stay idempotent.
    await clearCachedReportPdfs(practiceId);
    await clearCachedReportPdfs();

    expect(mockDeleteCalls).toEqual([]);
  });

  it("öffnet das kanonische PDF nativ und löscht die temporäre Klartextdatei danach", async () => {
    mockResponse = new Response("%PDF-1.4\nfixture", { headers: { "content-type": "application/pdf" } });

    await shareReportPdf({ practiceId, reportId });

    expect(mockShareCalls).toEqual([{
      path: pdfPath,
      options: {
        mimeType: "application/pdf",
        UTI: "com.adobe.pdf",
        dialogTitle: "PraxisShield-Bericht öffnen oder teilen"
      }
    }]);
    expect(mockDeleteCalls).toContain(pdfPath);
    expect(mockExisting.has(pdfPath)).toBe(false);
  });

  it("löscht die temporäre Datei auch wenn kein nativer Teilen-Dialog verfügbar ist", async () => {
    mockSharingAvailable = false;
    mockResponse = new Response("%PDF-1.4\nfixture", { headers: { "content-type": "application/pdf" } });

    await expect(shareReportPdf({ practiceId, reportId })).rejects.toThrow("kein sicherer PDF-Teilen-Dialog");

    expect(mockShareCalls).toHaveLength(0);
    expect(mockDeleteCalls).toContain(pdfPath);
    expect(mockExisting.has(pdfPath)).toBe(false);
  });

  it("löscht ein erzeugtes Klartextartefakt wenn das Schreiben fehlschlägt", async () => {
    mockWriteShouldFail = true;
    mockResponse = new Response("%PDF-1.4\nfixture", { headers: { "content-type": "application/pdf" } });

    await expect(shareReportPdf({ practiceId, reportId })).rejects.toThrow("disk_write_failed");

    expect(mockFileCreateCalls).toEqual([{ uri: pdfPath, options: { overwrite: true } }]);
    expect(mockShareCalls).toHaveLength(0);
    expect(mockDeleteCalls).toContain(pdfPath);
    expect(mockExisting.has(pdfPath)).toBe(false);
  });

  it("sendet weder Reportinhalt noch frei wählbare Metadaten", async () => {
    mockResponse = new Response("%PDF-1.4\nfixture", { headers: { "content-type": "application/pdf" } });
    await exportReportPdf({ practiceId, reportId });

    const body = (mockApiCalls[0].options.body ?? {}) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["practiceId", "reportId"]);
  });

  it("verwirft Antworten ohne PDF-Signatur vor jedem Dateisystemzugriff", async () => {
    mockResponse = new Response("not-a-pdf", { headers: { "content-type": "application/pdf" } });

    await expect(exportReportPdf({ practiceId, reportId })).rejects.toThrow("PDF-Signatur");
    // A malformed response must not even create the directory, so no partial artifact remains.
    expect(mockWriteCalls).toHaveLength(0);
    expect(mockFileCreateCalls).toHaveLength(0);
    expect(mockDirectoryCalls).toHaveLength(0);
  });

  it("verwirft einen falschen Content-Type als kontrollierten Fehler", async () => {
    mockResponse = new Response("%PDF-1.4\nfixture", { headers: { "content-type": "text/html" } });

    await expect(exportReportPdf({ practiceId, reportId })).rejects.toThrow("kein gültiges PDF");
    expect(mockWriteCalls).toHaveLength(0);
  });

  it("weist ungültige Praxis- und Report-IDs vor dem Netzwerkaufruf ab", async () => {
    await expect(exportReportPdf({ practiceId: "nicht-uuid", reportId })).rejects.toThrow("Practice-ID");
    await expect(exportReportPdf({ practiceId, reportId: "nicht-uuid" })).rejects.toThrow("Report-ID");
    expect(mockApiCalls).toHaveLength(0);
  });
});
