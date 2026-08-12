declare const jest: {
  mock(moduleName: string, factory: () => unknown): void;
};

declare function afterEach(fn: () => void): void;

const mockClearedPdfCaches: Array<string | undefined> = [];

jest.mock("expo-crypto", () => ({
  getRandomBytesAsync: async (length: number) => new Uint8Array(length)
}));
jest.mock("expo-secure-store", () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: "when-unlocked-this-device-only",
  isAvailableAsync: async () => false,
  getItemAsync: async () => null,
  setItemAsync: async () => undefined,
  deleteItemAsync: async () => undefined
}));
jest.mock("expo-sqlite", () => ({
  openDatabaseAsync: async () => {
    throw new Error("unexpected_native_database_access");
  }
}));

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

jest.mock("@/lib/ai/report-pdf", () => ({
  clearCachedReportPdfs: async (practiceId?: string) => {
    mockClearedPdfCaches.push(practiceId);
  }
}));

describe("local tenant cache handling", () => {
  afterEach(() => {
    mockClearedPdfCaches.length = 0;
    useReportStore.getState().clear();
    useInventoryStore.getState().clear();
    useSessionStore.setState({ practice: null, session: null });
  });

  it("clears locally cached tenant data and every PDF on logout", async () => {
    useSessionStore.getState().setPractice(practiceA);
    seedTenantCaches(practiceA.id);

    useSessionStore.getState().clear();
    await Promise.resolve();

    expect(useReportStore.getState().latest).toBeNull();
    expect(useInventoryStore.getState().getItems(practiceA.id)).toHaveLength(0);
    expect(useSessionStore.getState().practice).toBeNull();
    expect(useSessionStore.getState().session).toBeNull();
    expect(mockClearedPdfCaches).toContain(undefined);
  });

  it("clears locally cached tenant data and prior tenant PDFs when practice changes", async () => {
    useSessionStore.getState().setPractice(practiceA);
    seedTenantCaches(practiceA.id);

    useSessionStore.getState().setPractice(practiceB);
    await Promise.resolve();

    expect(useReportStore.getState().latest).toBeNull();
    expect(useInventoryStore.getState().getItems(practiceA.id)).toHaveLength(0);
    expect(useSessionStore.getState().practice?.id).toBe(practiceB.id);
    expect(mockClearedPdfCaches).toContain(practiceA.id);
  });

  it("clears tenant PDFs when an inaccessible or deleted practice is removed locally", async () => {
    useSessionStore.getState().setPractice(practiceA);
    seedTenantCaches(practiceA.id);

    useSessionStore.getState().clearPractice();
    await Promise.resolve();

    expect(useSessionStore.getState().practice).toBeNull();
    expect(useReportStore.getState().latest).toBeNull();
    expect(useInventoryStore.getState().getItems(practiceA.id)).toHaveLength(0);
    expect(mockClearedPdfCaches).toContain(practiceA.id);
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
