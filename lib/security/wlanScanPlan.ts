export type WlanScanPhaseId =
  | "network_info"
  | "encryption_check"
  | "port_scan"
  | "device_discovery"
  | "dns_check"
  | "traffic_analysis";

export function resolveScanPhaseIds(requested?: WlanScanPhaseId[]): WlanScanPhaseId[] {
  if (!requested || requested.length === 0) {
    return [
      "network_info",
      "encryption_check",
      "port_scan",
      "device_discovery",
      "dns_check",
      "traffic_analysis"
    ];
  }

  const selected = new Set<WlanScanPhaseId>(["network_info", ...requested]);
  if (selected.has("device_discovery")) selected.add("port_scan");
  if (selected.has("traffic_analysis")) {
    selected.add("port_scan");
    selected.add("device_discovery");
  }
  return [
    "network_info",
    "encryption_check",
    "port_scan",
    "device_discovery",
    "dns_check",
    "traffic_analysis"
  ].filter((phase): phase is WlanScanPhaseId => selected.has(phase as WlanScanPhaseId));
}
