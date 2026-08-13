declare const jest: {
  mock(moduleName: string, factory: () => unknown): void;
};

jest.mock("react-native", () => ({
  NativeModules: { PraxisShieldNetworkProbe: {} },
  Platform: { OS: "ios" }
}));

import { discoverMdnsServices } from "@/lib/security/networkProbes";

describe("native network probe platform capabilities", () => {
  it("reports a missing iOS mDNS implementation as unsupported", async () => {
    const results = await discoverMdnsServices(["_dicom._tcp"], 1);

    expect(results).toEqual([
      {
        type: "_dicom._tcp",
        addresses: [],
        source: "unsupported",
        confidence: "low",
        errorCode: "ios_mdns_unsupported"
      }
    ]);
  });
});
