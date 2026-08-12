import { clearCachedReportPdfs } from "@/lib/ai/report-pdf";
import { clearWlanScanCache } from "@/lib/security/wlan";
import { useInventoryStore } from "@/lib/store/inventory";
import { useReportStore } from "@/lib/store/report";

export function clearLocalTenantCaches(practiceId?: string) {
  useReportStore.getState().clear();
  useInventoryStore.getState().clear();
  clearWlanScanCache();
  // Zustand session transitions are synchronous. File deletion is idempotent and
  // deliberately detached here; explicit logout awaits the same operation first.
  void clearCachedReportPdfs(practiceId).catch(() => undefined);
}
