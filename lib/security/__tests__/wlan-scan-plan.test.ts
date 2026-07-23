import { resolveScanPhaseIds } from "@/lib/security/wlanScanPlan";

describe("resolveScanPlan", () => {
  it("returns the complete plan when no targeted phases are requested", () => {
    expect(resolveScanPhaseIds()).toEqual([
      "network_info",
      "encryption_check",
      "port_scan",
      "device_discovery",
      "dns_check",
      "traffic_analysis"
    ]);
  });

  it("adds only the prerequisites needed for a targeted device rerun", () => {
    expect(resolveScanPhaseIds(["device_discovery"])).toEqual([
      "network_info",
      "port_scan",
      "device_discovery"
    ]);
  });

  it("keeps a targeted gateway rerun small", () => {
    expect(resolveScanPhaseIds(["port_scan"])).toEqual([
      "network_info",
      "port_scan"
    ]);
  });
});
