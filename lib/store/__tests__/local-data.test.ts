declare const jest: {
  mock(moduleName: string, factory: () => unknown): void;
};

declare function afterEach(fn: () => void): void;

import { SAMPLE_REPORT, SAMPLE_REPORT_SOURCE } from "@/lib/ai/sample-report";
import { useInventoryStore } from "@/lib/store/inventory";
import { useReportStore } from "@/lib/store/report";
import { useSessionStore, type Practice } from "@/lib/store/session";

jest.mock("@/lib/security/wlan", () => ({
  clearWlanScanCache: () => undefined
}));

jest.mock("@/lib/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => undefined
    },
    from: () => undefined
  }
}));

const practiceA: Practice = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Praxis A",
  plan: "free"
};

const practiceB: Practice = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Praxis B",
  plan: "free"
};

describe("local tenant cache handling", () => {
  afterEach(() => {
    useReportStore.getState().clear();
    useInventoryStore.getState().clear();
    useSessionStore.setState({ practice: null, session: null });
  });

  it("clears locally cached tenant data on logout", () => {
    useSessionStore.getState().setPractice(practiceA);
    seedTenantCaches(practiceA.id);

    useSessionStore.getState().clear();

    expect(useReportStore.getState().latest).toBeNull();
    expect(useInventoryStore.getState().getItems(practiceA.id)).toHaveLength(0);
    expect(useSessionStore.getState().practice).toBeNull();
    expect(useSessionStore.getState().session).toBeNull();
  });

  it("clears locally cached tenant data when practice changes", () => {
    useSessionStore.getState().setPractice(practiceA);
    seedTenantCaches(practiceA.id);

    useSessionStore.getState().setPractice(practiceB);

    expect(useReportStore.getState().latest).toBeNull();
    expect(useInventoryStore.getState().getItems(practiceA.id)).toHaveLength(0);
    expect(useSessionStore.getState().practice?.id).toBe(practiceB.id);
  });
});

function seedTenantCaches(practiceId: string) {
  useReportStore.getState().saveReport(SAMPLE_REPORT, SAMPLE_REPORT_SOURCE);
  useInventoryStore.getState().addItem(practiceId, {
    type: "critical_system",
    name: "PVS",
    criticality: "critical"
  });
}
