declare const __dirname: string;
export {};

declare const require: (path: string) => unknown;

const { readFileSync } = require("fs") as { readFileSync(p: string, e: "utf8"): string };
const { resolve } = require("path") as { resolve(...parts: string[]): string };

type WlanEvidence = {
  ok: boolean;
  measured: string[];
  nativeMeasured: string[];
  platformLimited: string[];
  notCollected: string[];
  errors: string[];
};

const { evaluateWlanEvidence } = require("../../scripts/e2e/wlan-evidence.js") as {
  evaluateWlanEvidence: (info: unknown) => WlanEvidence;
};

const repositoryRoot = resolve(__dirname, "../..");

describe("WLAN end-to-end probe evidence", () => {
  it("accepts a run that actually measured something", () => {
    const result = evaluateWlanEvidence({
      collection: {
        currentWifi: { status: "collected" },
        securityProtocol: { status: "collected" }
      },
      nativeProbeEvidence: {
        tcp: { status: "collected", source: "measured", sampleCount: 4, errorCodes: [] },
        ssdp: { status: "collected", source: "measured", sampleCount: 1, errorCodes: [] }
      }
    });
    expect(result.ok).toBe(true);
    expect(result.measured).toEqual(["currentWifi", "securityProtocol"]);
    expect(result.nativeMeasured).toEqual(["tcp", "ssdp"]);
  });

  it("separates a genuine platform limit from a module failure", () => {
    const result = evaluateWlanEvidence({
      collection: {
        currentWifi: { status: "collected" },
        visibleWifiNetworks: { status: "unsupported", reason: "iOS exposes no scan API" },
        mdnsDiscovery: { status: "unsupported", reason: "ios_mdns_unsupported" }
      },
      nativeProbeEvidence: {
        tcp: { status: "collected", source: "measured", sampleCount: 4, errorCodes: [] },
        ssdp: { status: "collected", source: "measured", sampleCount: 1, errorCodes: [] }
      }
    });
    expect(result.ok).toBe(true);
    expect(result.platformLimited).toEqual(["mdnsDiscovery", "visibleWifiNetworks"]);
    expect(result.errors).toEqual([]);
  });

  it("fails the New Architecture proof when a native module cannot be resolved", () => {
    const result = evaluateWlanEvidence({
      collection: {
        currentWifi: { status: "collected" },
        localDevices: { status: "collected" }
      },
      nativeProbeEvidence: {
        tcp: {
          status: "unavailable",
          source: "unavailable",
          sampleCount: 4,
          errorCodes: ["native_tcp_module_unavailable"]
        },
        ssdp: { status: "collected", source: "measured", sampleCount: 1, errorCodes: [] }
      }
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("native_tcp_module_unavailable");
  });

  it("fails when SSDP reports a native module failure", () => {
    const result = evaluateWlanEvidence({
      collection: { currentWifi: { status: "collected" } },
      nativeProbeEvidence: {
        tcp: { status: "collected", source: "measured", sampleCount: 4, errorCodes: [] },
        ssdp: {
          status: "unavailable",
          source: "unavailable",
          sampleCount: 1,
          errorCodes: ["native_udp_module_unavailable"]
        }
      }
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("native_udp_module_unavailable");
  });

  it("fails when a probe crashed at runtime", () => {
    const result = evaluateWlanEvidence({
      collection: { currentWifi: { status: "collected" } },
      nativeProbeEvidence: {
        tcp: { status: "collected", source: "measured", sampleCount: 4, errorCodes: [] },
        ssdp: {
          status: "unavailable",
          source: "unavailable",
          sampleCount: 1,
          errorCodes: ["native_ssdp_probe_failed"]
        }
      }
    });
    expect(result.ok).toBe(false);
  });

  it("fails unavailable native evidence even when the runtime returns an arbitrary error message", () => {
    const result = evaluateWlanEvidence({
      collection: { currentWifi: { status: "collected" } },
      nativeProbeEvidence: {
        tcp: {
          status: "unavailable",
          source: "unavailable",
          sampleCount: 4,
          errorCodes: ["TurboModule invocation rejected"]
        },
        ssdp: { status: "collected", source: "measured", sampleCount: 1, errorCodes: [] }
      }
    });

    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("tcp did not provide native measured evidence");
  });

  it("rejects collected WiFi metadata when the native bridge produced no evidence", () => {
    const result = evaluateWlanEvidence({
      collection: {
        currentWifi: { status: "collected" },
        visibleWifiNetworks: { status: "unsupported" }
      }
    });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("missing native probe evidence: tcp");
    expect(result.errors).toContain("missing native probe evidence: ssdp");
  });

  it("rejects a scan row without any collection block", () => {
    expect(evaluateWlanEvidence({}).ok).toBe(false);
    expect(evaluateWlanEvidence({}).errors.join(" ")).toContain("no collection block");
  });

  it("keeps the Maestro script in sync with the shared rules", () => {
    const script = readFileSync(
      resolve(repositoryRoot, ".maestro/scripts/verify-wlan-sync.js"),
      "utf8"
    );
    // The Maestro engine cannot require modules, so the rules are mirrored inline.
    expect(script).toContain("select=id,network_info");
    expect(script).toContain("_module_unavailable$|_probe_failed$");
    expect(script).toContain('requiredNativeProbes = ["tcp", "ssdp"]');
    expect(script).toContain("did not provide native measured evidence");
    expect(script).toContain("no collection block");
    expect(script).toContain("nativeMeasured");
    expect(script).toContain("probeEvidenceOk");
  });
});
