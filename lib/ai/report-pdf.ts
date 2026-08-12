import * as FileSystem from "expo-file-system";
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

  const directory = reportCacheDirectory(practiceId);
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });

  const bytes = new Uint8Array(await response.arrayBuffer());
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

  const filePath = `${directory}PraxisShield-Bericht-${reportId}.pdf`;
  await FileSystem.writeAsStringAsync(filePath, bytesToBase64(bytes), {
    encoding: FileSystem.EncodingType.Base64
  });
  return filePath;
}

/** Opens the native PDF share/view dialog and removes the plaintext temp file afterwards. */
export async function shareReportPdf(options: ExportOptions) {
  const filePath = await exportReportPdf(options);

  try {
    if (!(await Sharing.isAvailableAsync())) {
      throw new Error("Auf diesem Gerät ist kein sicherer PDF-Teilen-Dialog verfügbar.");
    }
    await Sharing.shareAsync(filePath, {
      mimeType: "application/pdf",
      UTI: "com.adobe.pdf",
      dialogTitle: "PraxisShield-Bericht öffnen oder teilen"
    });
  } finally {
    // The receiving app owns any user-approved copy. PraxisShield retains no
    // plaintext export after the native dialog has closed or failed.
    await FileSystem.deleteAsync(filePath, { idempotent: true });
  }
}

/** Removes canonical PDF cache files for one tenant or for every tenant on logout. */
export async function clearCachedReportPdfs(practiceId?: string) {
  const directory = practiceId ? reportCacheDirectory(practiceId) : reportCacheRoot();
  await FileSystem.deleteAsync(directory, { idempotent: true });
}

function reportCacheDirectory(practiceId: string) {
  requireUuid(practiceId, "Practice-ID");
  return `${reportCacheRoot()}${practiceId}/`;
}

function reportCacheRoot() {
  if (!FileSystem.cacheDirectory) {
    throw new Error("Auf diesem Gerät ist kein nicht-persistenter PDF-Cache verfügbar.");
  }
  return `${FileSystem.cacheDirectory}${REPORT_CACHE_DIRECTORY}/`;
}

function requireUuid(value: string, label: string) {
  if (!UUID_RE.test(value)) throw new Error(`${label} ist ungültig.`);
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}
