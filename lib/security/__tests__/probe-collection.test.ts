import { calculateCollectionCoverage } from "@/lib/assessment/coverage";
import { mdnsCollectionResult } from "@/lib/security/probeCollection";

describe("mDNS collection capability", () => {
  it("maps a platform boundary to unsupported and excludes it from coverage", () => {
    const mdns = mdnsCollectionResult([
      { type: "_dicom._tcp", addresses: [], source: "unsupported", confidence: "low", errorCode: "ios_mdns_unsupported" }
    ]);

    expect(mdns.status).toBe("unsupported");
    expect(calculateCollectionCoverage({ currentWifi: "collected", mdnsDiscovery: mdns.status })).toEqual({
      score: 100,
      status: "sufficient",
      active: 1,
      total: 1,
      missing: [],
      unsupported: ["mdnsDiscovery"]
    });
  });

  it("keeps a technical module failure unavailable and inside the coverage denominator", () => {
    const mdns = mdnsCollectionResult([
      { type: "_dicom._tcp", addresses: [], source: "unavailable", confidence: "low", errorCode: "native_mdns_module_unavailable" }
    ]);

    expect(mdns.status).toBe("unavailable");
    expect(calculateCollectionCoverage({ currentWifi: "collected", mdnsDiscovery: mdns.status })).toMatchObject({
      score: 50,
      status: "insufficient",
      missing: ["mdnsDiscovery"],
      unsupported: []
    });
  });
});
