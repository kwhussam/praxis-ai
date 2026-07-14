import { clearWlanScanCache } from "@/lib/security/wlan";
import { useInventoryStore } from "@/lib/store/inventory";
import { useReportStore } from "@/lib/store/report";

export function clearLocalTenantCaches() {
  useReportStore.getState().clear();
  useInventoryStore.getState().clear();
  clearWlanScanCache();
}
