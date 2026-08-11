import { create, type StoreApi } from "zustand";

import { defaultInventoryRepository } from "@/lib/inventory/defaultInventoryRepository";
import {
  createAccessPoint,
  createInventoryItem,
  createInventoryProvenance,
  createKnownDevice,
  createPracticeSeedInventory,
  createRouterFirewallRule
} from "@/lib/inventory/inventory";
import {
  INVENTORY_SNAPSHOT_VERSION,
  type InventoryPracticeSnapshot,
  type InventoryRepository
} from "@/lib/inventory/repository";
import type {
  AccessPoint,
  AccessPointDraft,
  InventoryDraft,
  InventoryItem,
  KnownDevice,
  KnownDeviceDraft,
  RouterFirewallRule,
  RouterFirewallRuleDraft,
  RouterWifiConfiguration
} from "@/lib/inventory/types";
import type { Practice } from "@/lib/store/session";

export type InventoryPersistenceStatus = "idle" | "loading" | "saving" | "ready" | "volatile" | "error";

export type InventoryPersistenceState = {
  status: InventoryPersistenceStatus;
  revision: number;
  reason?: string;
};

type PracticeInventoryData = {
  items: InventoryItem[];
  knownDevices: KnownDevice[];
  accessPoints: AccessPoint[];
  routerWifiConfig: RouterWifiConfiguration | null;
  routerFirewallRules: RouterFirewallRule[];
};

type PracticeMutation = (data: PracticeInventoryData) => PracticeInventoryData;

type InventoryState = {
  itemsByPractice: Record<string, InventoryItem[]>;
  knownDevicesByPractice: Record<string, KnownDevice[]>;
  accessPointsByPractice: Record<string, AccessPoint[]>;
  routerWifiConfigByPractice: Record<string, RouterWifiConfiguration>;
  routerFirewallRulesByPractice: Record<string, RouterFirewallRule[]>;
  persistenceByPractice: Record<string, InventoryPersistenceState>;
  ensurePracticeInventory: (practice: Practice | null) => Promise<void>;
  getPersistenceState: (practiceId?: string) => InventoryPersistenceState;
  getItems: (practiceId?: string) => InventoryItem[];
  getKnownDevices: (practiceId?: string) => KnownDevice[];
  getAccessPoints: (practiceId?: string) => AccessPoint[];
  getRouterWifiConfig: (practiceId?: string) => RouterWifiConfiguration | null;
  getRouterFirewallRules: (practiceId?: string) => RouterFirewallRule[];
  addItem: (practiceId: string, draft: InventoryDraft) => void;
  removeItem: (practiceId: string, itemId: string) => void;
  addKnownDevice: (practiceId: string, draft: KnownDeviceDraft) => void;
  removeKnownDevice: (practiceId: string, deviceId: string) => void;
  confirmKnownDevice: (practiceId: string, deviceId: string, confirmedAt?: Date) => void;
  addAccessPoint: (practiceId: string, draft: AccessPointDraft) => void;
  removeAccessPoint: (practiceId: string, accessPointId: string) => void;
  updateRouterWifiConfig: (practiceId: string, config: Omit<RouterWifiConfiguration, "updatedAt" | "provenance">) => void;
  addRouterFirewallRule: (practiceId: string, draft: RouterFirewallRuleDraft) => void;
  importRouterFirewallRules: (practiceId: string, drafts: RouterFirewallRuleDraft[]) => void;
  removeRouterFirewallRule: (practiceId: string, ruleId: string) => void;
  deletePersistedPractice: (practiceId: string) => Promise<boolean>;
  clear: () => void;
};

type InventorySet = StoreApi<InventoryState>["setState"];
type InventoryGet = StoreApi<InventoryState>["getState"];

const pendingMutations = new Map<string, PracticeMutation[]>();
let lifecycleGeneration = 0;
let inventoryRepository: InventoryRepository = defaultInventoryRepository;

const emptyPersistenceState: InventoryPersistenceState = { status: "idle", revision: 0 };

export const useInventoryStore = create<InventoryState>()((set, get) => ({
  itemsByPractice: {},
  knownDevicesByPractice: {},
  accessPointsByPractice: {},
  routerWifiConfigByPractice: {},
  routerFirewallRulesByPractice: {},
  persistenceByPractice: {},

  ensurePracticeInventory: async (practice) => {
    if (!practice) return;
    const currentPersistence = get().persistenceByPractice[practice.id];
    if (currentPersistence && currentPersistence.status !== "idle" && currentPersistence.status !== "error") return;

    const generation = lifecycleGeneration;
    set((state) => ({
      persistenceByPractice: {
        ...state.persistenceByPractice,
        [practice.id]: { status: "loading", revision: currentPersistence?.revision ?? 0 }
      }
    }));

    let result: Awaited<ReturnType<InventoryRepository["load"]>>;
    try {
      result = await inventoryRepository.load(practice.id);
    } catch {
      result = { status: "error", reason: "storage_failed" };
    }
    if (generation !== lifecycleGeneration) return;

    if (result.status === "error") {
      const reason = result.reason;
      set((state) => ({
        persistenceByPractice: {
          ...state.persistenceByPractice,
          [practice.id]: { status: "error", revision: currentPersistence?.revision ?? 0, reason }
        }
      }));
      return;
    }

    const loadedData = result.status === "ready"
      ? dataFromSnapshot(result.snapshot)
      : emptyPracticeData(createPracticeSeedInventory(practice));
    const queued = pendingMutations.get(practice.id) ?? [];
    pendingMutations.delete(practice.id);
    const hydratedData = queued.reduce((data, mutate) => mutate(data), loadedData);

    if (result.status === "volatile") {
      const reason = result.reason;
      set((state) => ({
        ...writePracticeData(state, practice.id, hydratedData),
        persistenceByPractice: {
          ...state.persistenceByPractice,
          [practice.id]: { status: "volatile", revision: 0, reason }
        }
      }));
      return;
    }

    const persistedRevision = result.status === "ready" ? result.snapshot.revision : 0;
    const needsSave = result.status === "empty" || queued.length > 0;
    const nextRevision = needsSave ? persistedRevision + 1 : persistedRevision;
    set((state) => ({
      ...writePracticeData(state, practice.id, hydratedData),
      persistenceByPractice: {
        ...state.persistenceByPractice,
        [practice.id]: { status: needsSave ? "saving" : "ready", revision: nextRevision }
      }
    }));

    if (needsSave) schedulePersist(practice.id, hydratedData, persistedRevision, nextRevision, generation, set, get);
  },

  getPersistenceState: (practiceId) => practiceId
    ? get().persistenceByPractice[practiceId] ?? emptyPersistenceState
    : emptyPersistenceState,
  getItems: (practiceId) => (practiceId ? get().itemsByPractice[practiceId] ?? [] : []),
  getKnownDevices: (practiceId) => (practiceId ? get().knownDevicesByPractice[practiceId] ?? [] : []),
  getAccessPoints: (practiceId) => (practiceId ? get().accessPointsByPractice[practiceId] ?? [] : []),
  getRouterWifiConfig: (practiceId) => (practiceId ? get().routerWifiConfigByPractice[practiceId] ?? null : null),
  getRouterFirewallRules: (practiceId) => (practiceId ? get().routerFirewallRulesByPractice[practiceId] ?? [] : []),

  addItem: (practiceId, draft) => {
    const item = createInventoryItem(draft);
    mutatePractice(practiceId, (data) => ({ ...data, items: [...data.items, item] }), set, get);
  },
  removeItem: (practiceId, itemId) =>
    mutatePractice(practiceId, (data) => ({ ...data, items: data.items.filter((item) => item.id !== itemId) }), set, get),
  addKnownDevice: (practiceId, draft) => {
    const device = createKnownDevice(draft);
    mutatePractice(practiceId, (data) => ({ ...data, knownDevices: [...data.knownDevices, device] }), set, get);
  },
  removeKnownDevice: (practiceId, deviceId) =>
    mutatePractice(practiceId, (data) => ({
      ...data,
      knownDevices: data.knownDevices.filter((device) => device.id !== deviceId)
    }), set, get),
  confirmKnownDevice: (practiceId, deviceId, confirmedAt = new Date()) => {
    const timestamp = confirmedAt.toISOString();
    mutatePractice(practiceId, (data) => ({
      ...data,
      knownDevices: data.knownDevices.map((device) => device.id === deviceId
        ? {
            ...device,
            lastConfirmedAt: timestamp,
            updatedAt: timestamp,
            provenance: { ...device.provenance, confirmedAt: timestamp }
          }
        : device)
    }), set, get);
  },
  addAccessPoint: (practiceId, draft) => {
    const accessPoint = createAccessPoint(draft);
    mutatePractice(practiceId, (data) => ({ ...data, accessPoints: [...data.accessPoints, accessPoint] }), set, get);
  },
  removeAccessPoint: (practiceId, accessPointId) =>
    mutatePractice(practiceId, (data) => ({
      ...data,
      accessPoints: data.accessPoints.filter((accessPoint) => accessPoint.id !== accessPointId)
    }), set, get),
  updateRouterWifiConfig: (practiceId, config) => {
    const now = new Date();
    mutatePractice(practiceId, (data) => ({
      ...data,
      routerWifiConfig: {
        ...config,
        provenance: createInventoryProvenance(undefined, now),
        updatedAt: now.toISOString()
      }
    }), set, get);
  },
  addRouterFirewallRule: (practiceId, draft) => {
    const rule = createRouterFirewallRule(draft);
    mutatePractice(practiceId, (data) => ({
      ...data,
      routerFirewallRules: [...data.routerFirewallRules, rule]
    }), set, get);
  },
  importRouterFirewallRules: (practiceId, drafts) => {
    const importedAt = new Date();
    const rules = drafts.map((draft) => createRouterFirewallRule(draft, new Date(), importedAt));
    mutatePractice(practiceId, (data) => ({
      ...data,
      routerFirewallRules: [...data.routerFirewallRules, ...rules]
    }), set, get);
  },
  removeRouterFirewallRule: (practiceId, ruleId) =>
    mutatePractice(practiceId, (data) => ({
      ...data,
      routerFirewallRules: data.routerFirewallRules.filter((rule) => rule.id !== ruleId)
    }), set, get),

  deletePersistedPractice: async (practiceId) => {
    let result: Awaited<ReturnType<InventoryRepository["delete"]>>;
    try {
      result = await inventoryRepository.delete(practiceId);
    } catch {
      return false;
    }
    if (result.status !== "deleted") return false;
    pendingMutations.delete(practiceId);
    set((state) => removePracticeData(state, practiceId));
    return true;
  },

  clear: () => {
    lifecycleGeneration += 1;
    pendingMutations.clear();
    set({
      itemsByPractice: {},
      knownDevicesByPractice: {},
      accessPointsByPractice: {},
      routerWifiConfigByPractice: {},
      routerFirewallRulesByPractice: {},
      persistenceByPractice: {}
    });
  }
}));

export function setInventoryRepositoryForTests(repository: InventoryRepository) {
  inventoryRepository = repository;
}

export function resetInventoryRepositoryForTests() {
  inventoryRepository = defaultInventoryRepository;
}

function mutatePractice(
  practiceId: string,
  mutation: PracticeMutation,
  set: InventorySet,
  get: InventoryGet
) {
  const persistence = get().persistenceByPractice[practiceId] ?? emptyPersistenceState;
  if (persistence.status === "loading") {
    pendingMutations.set(practiceId, [...(pendingMutations.get(practiceId) ?? []), mutation]);
    return;
  }
  if (persistence.status === "error") return;

  const currentData = readPracticeData(get(), practiceId);
  const nextData = mutation(currentData);
  const shouldPersist = persistence.status === "ready" || persistence.status === "saving";
  const nextRevision = shouldPersist ? persistence.revision + 1 : persistence.revision;
  const generation = lifecycleGeneration;

  set((state) => ({
    ...writePracticeData(state, practiceId, nextData),
    persistenceByPractice: {
      ...state.persistenceByPractice,
      [practiceId]: persistence.status === "idle"
        ? { status: "volatile", revision: 0, reason: "not_hydrated" }
        : shouldPersist
          ? { status: "saving", revision: nextRevision }
          : { ...persistence, revision: nextRevision }
    }
  }));

  if (shouldPersist) {
    schedulePersist(practiceId, nextData, persistence.revision, nextRevision, generation, set, get);
  }
}

function schedulePersist(
  practiceId: string,
  data: PracticeInventoryData,
  expectedRevision: number,
  revision: number,
  generation: number,
  set: InventorySet,
  get: InventoryGet
) {
  const snapshot = snapshotFromData(practiceId, revision, data);
  void inventoryRepository.save(snapshot, expectedRevision).then((result) => {
    if (generation !== lifecycleGeneration) return;
    const current = get().persistenceByPractice[practiceId];
    if (!current || current.revision < revision) return;
    if (result.status === "saved") {
      if (current.status !== "saving" || current.revision !== revision) return;
      set((state) => ({
        persistenceByPractice: {
          ...state.persistenceByPractice,
          [practiceId]: { status: "ready", revision }
        }
      }));
      return;
    }

    set((state) => ({
      persistenceByPractice: {
        ...state.persistenceByPractice,
        [practiceId]: result.status === "volatile"
          ? { status: "volatile", revision: 0, reason: result.reason }
          : { status: "error", revision: current.revision, reason: result.status === "conflict" ? "revision_conflict" : result.reason }
      }
    }));
  }).catch(() => {
    if (generation !== lifecycleGeneration) return;
    const current = get().persistenceByPractice[practiceId];
    if (!current) return;
    set((state) => ({
      persistenceByPractice: {
        ...state.persistenceByPractice,
        [practiceId]: { status: "error", revision: current.revision, reason: "storage_failed" }
      }
    }));
  });
}

function snapshotFromData(
  practiceId: string,
  revision: number,
  data: PracticeInventoryData
): InventoryPracticeSnapshot {
  return {
    version: INVENTORY_SNAPSHOT_VERSION,
    practiceId,
    revision,
    ...data,
    updatedAt: new Date().toISOString()
  };
}

function dataFromSnapshot(snapshot: InventoryPracticeSnapshot): PracticeInventoryData {
  return {
    items: snapshot.items,
    knownDevices: snapshot.knownDevices,
    accessPoints: snapshot.accessPoints,
    routerWifiConfig: snapshot.routerWifiConfig,
    routerFirewallRules: snapshot.routerFirewallRules
  };
}

function emptyPracticeData(items: InventoryItem[] = []): PracticeInventoryData {
  return { items, knownDevices: [], accessPoints: [], routerWifiConfig: null, routerFirewallRules: [] };
}

function readPracticeData(state: InventoryState, practiceId: string): PracticeInventoryData {
  return {
    items: state.itemsByPractice[practiceId] ?? [],
    knownDevices: state.knownDevicesByPractice[practiceId] ?? [],
    accessPoints: state.accessPointsByPractice[practiceId] ?? [],
    routerWifiConfig: state.routerWifiConfigByPractice[practiceId] ?? null,
    routerFirewallRules: state.routerFirewallRulesByPractice[practiceId] ?? []
  };
}

function writePracticeData(state: InventoryState, practiceId: string, data: PracticeInventoryData) {
  const routerWifiConfigByPractice = { ...state.routerWifiConfigByPractice };
  if (data.routerWifiConfig) routerWifiConfigByPractice[practiceId] = data.routerWifiConfig;
  else delete routerWifiConfigByPractice[practiceId];

  return {
    itemsByPractice: { ...state.itemsByPractice, [practiceId]: data.items },
    knownDevicesByPractice: { ...state.knownDevicesByPractice, [practiceId]: data.knownDevices },
    accessPointsByPractice: { ...state.accessPointsByPractice, [practiceId]: data.accessPoints },
    routerWifiConfigByPractice,
    routerFirewallRulesByPractice: { ...state.routerFirewallRulesByPractice, [practiceId]: data.routerFirewallRules }
  };
}

function removePracticeData(state: InventoryState, practiceId: string) {
  const itemsByPractice = { ...state.itemsByPractice };
  const knownDevicesByPractice = { ...state.knownDevicesByPractice };
  const accessPointsByPractice = { ...state.accessPointsByPractice };
  const routerWifiConfigByPractice = { ...state.routerWifiConfigByPractice };
  const routerFirewallRulesByPractice = { ...state.routerFirewallRulesByPractice };
  const persistenceByPractice = { ...state.persistenceByPractice };
  delete itemsByPractice[practiceId];
  delete knownDevicesByPractice[practiceId];
  delete accessPointsByPractice[practiceId];
  delete routerWifiConfigByPractice[practiceId];
  delete routerFirewallRulesByPractice[practiceId];
  delete persistenceByPractice[practiceId];
  return {
    itemsByPractice,
    knownDevicesByPractice,
    accessPointsByPractice,
    routerWifiConfigByPractice,
    routerFirewallRulesByPractice,
    persistenceByPractice
  };
}
