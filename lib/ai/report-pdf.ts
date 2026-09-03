// SDK 57 migration: the deprecated expo-file-system/legacy entry point is gone from this module.
// The File/Directory API is synchronous, so the exported functions keep their async signatures
// while the filesystem work itself no longer needs awaiting.
import { Directory, File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

import { apiResponse } from "@/lib/api/client";

type ExportOptions = {
  practiceId: string;
  reportId: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REPORT_CACHE_DIRECTORY = "praxisshield-report-cache";

/**
 * Downloads the canonical server artifact and only caches its bytes locally.
 * No report content, timestamps or layout decisions are accepted from the app.
 */
export async function exportReportPdf({ practiceId, reportId }: ExportOptions) {
  return (await exportReportPdfFile({ practiceId, reportId })).uri;
}

/** Opens the native PDF share/view dialog and removes the plaintext temp file afterwards. */
export async function shareReportPdf(options: ExportOptions) {
  const file = await exportReportPdfFile(options);

  try {
    if (!(await Sharing.isAvailableAsync())) {
      throw new Error("Auf diesem Gerät ist kein sicherer PDF-Teilen-Dialog verfügbar.");
    }
    await Sharing.shareAsync(file.uri, {
      mimeType: "application/pdf",
      UTI: "com.adobe.pdf",
      dialogTitle: "PraxisShield-Bericht öffnen oder teilen"
    });
  } finally {
    // The receiving app owns any user-approved copy. PraxisShield retains no
    // plaintext export after the native dialog has closed or failed.
    deleteIfPresent(file);
  }
}

/** Removes canonical PDF cache files for one tenant or for every tenant on logout. */
export async function clearCachedReportPdfs(practiceId?: string) {
  deleteIfPresent(practiceId ? reportCacheDirectory(practiceId) : reportCacheRoot());
}

async function exportReportPdfFile({ practiceId, reportId }: ExportOptions) {
  requireUuid(practiceId, "Practice-ID");
  requireUuid(reportId, "Report-ID");

  const response = await apiResponse("/api/report/pdf", {
    method: "POST",
    body: { practiceId, reportId },
    timeoutMs: 60_000
  });
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/pdf")) {
    throw new Error("Der Server hat kein gültiges PDF geliefert.");
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  // Verify the integrity of the server artifact before anything touches the filesystem, so a
  // malformed response fails as a controlled, translated error instead of leaving a partial file.
  if (
    bytes.length < 5 ||
    bytes[0] !== 0x25 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x44 ||
    bytes[3] !== 0x46 ||
    bytes[4] !== 0x2d
  ) {
    throw new Error("Die PDF-Signatur der Serverantwort ist ungültig.");
  }

  const directory = reportCacheDirectory(practiceId);
  directory.create({ intermediates: true, idempotent: true });

  const file = new File(directory, `PraxisShield-Bericht-${reportId}.pdf`);
  // The new API writes the raw bytes directly; the previous base64 round-trip is gone.
  file.create({ overwrite: true });
  file.write(bytes);
  return file;
}

function reportCacheDirectory(practiceId: string) {
  requireUuid(practiceId, "Practice-ID");
  return new Directory(reportCacheRoot(), practiceId);
}

function reportCacheRoot() {
  const cache = Paths.cache;
  // Exported PDFs must never live in a persistent or backup-eligible location. If the platform
  // cannot offer a cache directory, refuse instead of falling back to document storage.
  if (!cache?.uri) {
    throw new Error("Auf diesem Gerät ist kein nicht-persistenter PDF-Cache verfügbar.");
  }
  return new Directory(cache, REPORT_CACHE_DIRECTORY);
}

/**
 * The SDK 57 API throws when deleting a missing entry. Cache cleanup on logout, practice switch
 * and after a failed share must stay idempotent, so absence is a success, not an error.
 */
function deleteIfPresent(entry: File | Directory) {
  if (entry.exists) entry.delete();
}

function requireUuid(value: string, label: string) {
  if (!UUID_RE.test(value)) throw new Error(`${label} ist ungültig.`);
}
