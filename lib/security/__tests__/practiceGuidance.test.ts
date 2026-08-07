import { guidanceFromMonitoring } from "@/lib/security/practiceGuidance";

describe("guidanceFromMonitoring", () => {
  it("erteilt bei geringer Messabdeckung keine Entwarnung trotz gutem Teilwert", () => {
    const guidance = guidanceFromMonitoring(100, 0, 33);

    expect(guidance.tone).toBe("warning");
    expect(guidance.headline).toContain("nicht vollständig");
    expect(guidance.summary).toContain("33 %");
    expect(guidance.actions[0]).toContain("Prüfquellen");
  });

  it("nutzt bei ausreichender Abdeckung weiterhin den gemessenen Risikowert", () => {
    const guidance = guidanceFromMonitoring(92, 0, 100);

    expect(guidance.tone).toBe("safe");
  });
});
