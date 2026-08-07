import {
  COLLECTION_STATUSES,
  collected,
  collectionStatusForProvider,
  deriveEvidenceFreshness,
  hasInvalidEvidenceWindow,
  notCollected
} from "@/lib/assessment/collection";
import { calculateCollectionCoverage } from "@/lib/assessment/coverage";

describe("shared assessment collection contract", () => {
  it("keeps the complete closed set of collection states", () => {
    expect(COLLECTION_STATUSES).toEqual([
      "collected",
      "not_checked",
      "unsupported",
      "permission_denied",
      "timeout",
      "error",
      "unavailable"
    ]);
  });

  it("derives fresh, stale and unknown without guessing", () => {
    const now = new Date("2026-08-07T08:00:00.000Z");
    expect(deriveEvidenceFreshness({ observed_at: "2026-08-07T07:59:00.000Z", expires_at: "2026-08-07T08:01:00.000Z" }, now)).toBe("fresh");
    expect(deriveEvidenceFreshness({ observed_at: "2026-08-07T07:00:00.000Z", expires_at: "2026-08-07T08:00:00.000Z" }, now)).toBe("stale");
    expect(deriveEvidenceFreshness({ observed_at: "2026-08-07T07:00:00.000Z" }, now)).toBe("unknown");
    expect(deriveEvidenceFreshness({ observed_at: "2026-08-07T09:00:00.000Z", expires_at: "2026-08-07T10:00:00.000Z" }, now)).toBe("unknown");
    expect(hasInvalidEvidenceWindow({ observed_at: "2026-08-07T09:00:00.000Z" }, now)).toBe(true);
    expect(hasInvalidEvidenceWindow({ observed_at: "2026-08-07T07:00:00.000Z" }, now)).toBe(false);
  });

  it("creates successful and unsuccessful observations without conflating empty values", () => {
    const now = new Date("2026-08-07T08:00:00.000Z");
    expect(collected([], { now, ttlMs: 60_000 })).toMatchObject({
      status: "collected",
      value: [],
      expires_at: "2026-08-07T08:01:00.000Z",
      freshness: "fresh"
    });
    expect(notCollected("timeout", "Sensor timeout", { now })).toMatchObject({
      status: "timeout",
      freshness: "unknown"
    });
  });

  it("maps monitoring providers into the same collection vocabulary", () => {
    expect(collectionStatusForProvider("active")).toBe("collected");
    expect(collectionStatusForProvider("not_configured")).toBe("not_checked");
    expect(collectionStatusForProvider("unavailable")).toBe("unavailable");
    expect(collectionStatusForProvider("timeout")).toBe("timeout");
  });

  it("excludes unsupported capabilities from the denominator and reports them separately", () => {
    expect(calculateCollectionCoverage({ wifi: "collected", devices: "timeout", router: "unsupported" })).toEqual({
      score: 50,
      status: "insufficient",
      active: 1,
      total: 2,
      missing: ["devices"],
      unsupported: ["router"]
    });
  });

  it("allows iOS full coverage for all capabilities actually supported there", () => {
    expect(calculateCollectionCoverage({
      currentWifi: "collected",
      visibleWifiNetworks: "unsupported",
      localDevices: "unsupported"
    })).toEqual({
      score: 100,
      status: "sufficient",
      active: 1,
      total: 1,
      missing: [],
      unsupported: ["visibleWifiNetworks", "localDevices"]
    });
  });
});
