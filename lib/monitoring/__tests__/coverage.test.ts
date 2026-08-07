import { calculateMonitoringCoverage } from "@/lib/assessment/coverage";

describe("monitoring coverage", () => {
  it("prevents a sufficient status when providers are not configured or unavailable", () => {
    const coverage = calculateMonitoringCoverage({
      cloudflareDns: "active",
      sslLabs: "active",
      shodan: "not_configured",
      hibp: "not_configured",
      virusTotal: "unavailable",
      securityTrails: "timeout"
    });

    expect(coverage.score).toBe(33);
    expect(coverage.status).toBe("insufficient");
    expect(coverage.missing).toEqual(["shodan", "hibp", "virusTotal", "securityTrails"]);
  });

  it("marks complete provider execution as sufficient", () => {
    const coverage = calculateMonitoringCoverage({
      cloudflareDns: "active",
      sslLabs: "active",
      shodan: "active",
      hibp: "active",
      virusTotal: "active",
      securityTrails: "active"
    });

    expect(coverage).toMatchObject({ score: 100, status: "sufficient", active: 6, total: 6, missing: [] });
  });

  it("fails closed when no provider contract is present", () => {
    expect(calculateMonitoringCoverage({})).toMatchObject({ score: 0, status: "insufficient" });
  });
});
