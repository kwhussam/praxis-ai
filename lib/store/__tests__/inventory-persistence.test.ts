declare const jest: { mock(moduleName: string, factory: () => unknown): void };
declare function beforeEach(fn: () => void): void;

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

import { createInventoryItem } from "@/lib/inventory/inventory";
import { INVENTORY_SNAPSHOT_VERSION, type InventoryPracticeSnapshot, type InventoryRepository } from "@/lib/inventory/repository";
import { setInventoryRepositoryForTests, useInventoryStore } from "@/lib/store/inventory";
import type { Practice } from "@/lib/store/session";

const practice: Practice = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Praxis A",
  domain: "praxis-a.test",
  email: "kontakt@praxis-a.test",
  plan: "free"
};

describe("inventory store persistence", () => {
  let repository: FakeInventoryRepository;

  beforeEach(() => {
    useInventoryStore.getState().clear();
    repository = new FakeInventoryRepository();
    setInventoryRepositoryForTests(repository);
  });

  afterEach(() => {
    useInventoryStore.getState().clear();
  });

  it("hydratisiert einen verschlüsselten Snapshot nach einem simulierten Neustart", async () => {
    repository.loadResult = { status: "ready", snapshot: snapshot(4, "Persistiertes PVS") };

    await useInventoryStore.getState().ensurePracticeInventory(practice);

    expect(useInventoryStore.getState().getItems(practice.id)[0]?.name).toBe("Persistiertes PVS");
    expect(useInventoryStore.getState().getPersistenceState(practice.id)).toEqual({ status: "ready", revision: 4 });
    expect(repository.saves).toHaveLength(0);
  });

  it("legt Profil-Seeds ausschließlich local_only an und persistiert den ersten Snapshot", async () => {
    repository.loadResult = { status: "empty" };

    await useInventoryStore.getState().ensurePracticeInventory(practice);
    await flushPromises();

    const seeds = useInventoryStore.getState().getItems(practice.id);
    expect(seeds).toHaveLength(2);
    expect(seeds.every((item) => item.provenance.source === "practice_profile")).toBe(true);
    expect(seeds.every((item) => item.provenance.synthetic && item.provenance.syncPolicy === "local_only")).toBe(true);
    expect(repository.saves[0]).toMatchObject({ expectedRevision: 0, snapshot: { revision: 1 } });
  });

  it("verliert Mutationen während der Hydrierung nicht", async () => {
    const deferred = repository.deferLoad();
    const hydration = useInventoryStore.getState().ensurePracticeInventory(practice);
    useInventoryStore.getState().addItem(practice.id, {
      type: "critical_system",
      name: "Während Laden erfasst",
      criticality: "critical"
    });
    deferred.resolve({ status: "empty" });

    await hydration;
    await flushPromises();

    expect(useInventoryStore.getState().getItems(practice.id).map((item) => item.name)).toContain("Während Laden erfasst");
    expect(repository.saves[0]?.snapshot.items.map((item) => item.name)).toContain("Während Laden erfasst");
  });

  it("meldet einen Snapshot erst nach bestätigtem Write als bereit", async () => {
    repository.loadResult = { status: "ready", snapshot: snapshot(3, "Version 3") };
    const deferred = repository.deferSave();
    await useInventoryStore.getState().ensurePracticeInventory(practice);

    useInventoryStore.getState().addItem(practice.id, {
      type: "device",
      name: "Noch nicht dauerhaft",
      criticality: "medium"
    });

    expect(useInventoryStore.getState().getPersistenceState(practice.id)).toEqual({ status: "saving", revision: 4 });
    deferred.resolve({ status: "saved", revision: 4 });
    await flushPromises();
    expect(useInventoryStore.getState().getPersistenceState(practice.id)).toEqual({ status: "ready", revision: 4 });
  });

  it("kennzeichnet fehlenden SecureStore sichtbar als flüchtig und synchronisiert nicht", async () => {
    repository.loadResult = { status: "volatile", reason: "secure_store_unavailable" };
    await useInventoryStore.getState().ensurePracticeInventory(practice);
    useInventoryStore.getState().addItem(practice.id, {
      type: "device",
      name: "Nur im Speicher",
      criticality: "medium"
    });
    await flushPromises();

    expect(useInventoryStore.getState().getPersistenceState(practice.id)).toEqual({
      status: "volatile",
      revision: 0,
      reason: "secure_store_unavailable"
    });
    expect(repository.saves).toHaveLength(0);
  });

  it("stoppt bei Revisionskonflikten und überschreibt nicht still", async () => {
    repository.loadResult = { status: "ready", snapshot: snapshot(3, "Version 3") };
    repository.nextSaveResult = { status: "conflict", actualRevision: 4 };
    await useInventoryStore.getState().ensurePracticeInventory(practice);
    useInventoryStore.getState().addItem(practice.id, {
      type: "device",
      name: "Konflikt",
      criticality: "high"
    });
    await flushPromises();

    expect(useInventoryStore.getState().getPersistenceState(practice.id)).toEqual({
      status: "error",
      revision: 4,
      reason: "revision_conflict"
    });
  });

  it("schließt bei unerwartetem Repositoryfehler und blockiert weitere Mutationen", async () => {
    repository.throwOnLoad = true;
    await useInventoryStore.getState().ensurePracticeInventory(practice);
    useInventoryStore.getState().addItem(practice.id, {
      type: "device",
      name: "Darf nicht angelegt werden",
      criticality: "medium"
    });

    expect(useInventoryStore.getState().getPersistenceState(practice.id)).toEqual({
      status: "error",
      revision: 0,
      reason: "storage_failed"
    });
    expect(useInventoryStore.getState().getItems(practice.id)).toHaveLength(0);
  });

  it("ignoriert verspätete Hydrierung nach Logout oder Praxiswechsel", async () => {
    const deferred = repository.deferLoad();
    const hydration = useInventoryStore.getState().ensurePracticeInventory(practice);
    useInventoryStore.getState().clear();
    deferred.resolve({ status: "ready", snapshot: snapshot(2, "Darf nicht erscheinen") });
    await hydration;

    expect(useInventoryStore.getState().getItems(practice.id)).toHaveLength(0);
    expect(useInventoryStore.getState().getPersistenceState(practice.id).status).toBe("idle");
  });

  it("entfernt bei Praxislöschung Ciphertext und Schlüssel über das Repository", async () => {
    repository.loadResult = { status: "ready", snapshot: snapshot(1, "PVS") };
    await useInventoryStore.getState().ensurePracticeInventory(practice);

    expect(await useInventoryStore.getState().deletePersistedPractice(practice.id)).toBe(true);
    expect(repository.deletedPracticeIds).toEqual([practice.id]);
    expect(useInventoryStore.getState().getItems(practice.id)).toHaveLength(0);
  });
});

class FakeInventoryRepository implements InventoryRepository {
  loadResult: Awaited<ReturnType<InventoryRepository["load"]>> = { status: "empty" };
  nextSaveResult: Awaited<ReturnType<InventoryRepository["save"]>> | null = null;
  saves: Array<{ snapshot: InventoryPracticeSnapshot; expectedRevision: number }> = [];
  deletedPracticeIds: string[] = [];
  throwOnLoad = false;
  private loadPromise: Promise<Awaited<ReturnType<InventoryRepository["load"]>>> | null = null;
  private savePromise: Promise<Awaited<ReturnType<InventoryRepository["save"]>>> | null = null;

  async load() {
    if (this.throwOnLoad) throw new Error("storage_failed");
    return this.loadPromise ? this.loadPromise : this.loadResult;
  }

  async save(snapshotValue: InventoryPracticeSnapshot, expectedRevision: number) {
    this.saves.push({ snapshot: snapshotValue, expectedRevision });
    return this.savePromise ?? this.nextSaveResult ?? { status: "saved" as const, revision: snapshotValue.revision };
  }

  async delete(practiceId: string) {
    this.deletedPracticeIds.push(practiceId);
    return { status: "deleted" as const };
  }

  deferLoad() {
    let resolve!: (value: Awaited<ReturnType<InventoryRepository["load"]>>) => void;
    this.loadPromise = new Promise((next) => {
      resolve = next;
    });
    return { resolve };
  }

  deferSave() {
    let resolve!: (value: Awaited<ReturnType<InventoryRepository["save"]>>) => void;
    this.savePromise = new Promise((next) => {
      resolve = next;
    });
    return { resolve };
  }
}

function snapshot(revision: number, name: string): InventoryPracticeSnapshot {
  return {
    version: INVENTORY_SNAPSHOT_VERSION,
    practiceId: practice.id,
    revision,
    items: [createInventoryItem({ type: "critical_system", name, criticality: "critical" }, new Date("2026-08-10T12:00:00.000Z"))],
    knownDevices: [],
    accessPoints: [],
    routerWifiConfig: null,
    routerFirewallRules: [],
    updatedAt: "2026-08-10T12:00:00.000Z"
  };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}
