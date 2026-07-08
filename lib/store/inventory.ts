import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { createInventoryItem, createKnownDevice, createPracticeSeedInventory } from "@/lib/inventory/inventory";
import type { InventoryDraft, InventoryItem, KnownDevice, KnownDeviceDraft } from "@/lib/inventory/types";
import type { Practice } from "@/lib/store/session";
import { createStringStorage } from "@/lib/store/storage";

type InventoryState = {
  itemsByPractice: Record<string, InventoryItem[]>;
  knownDevicesByPractice: Record<string, KnownDevice[]>;
  ensurePracticeInventory: (practice: Practice | null) => void;
  getItems: (practiceId?: string) => InventoryItem[];
  getKnownDevices: (practiceId?: string) => KnownDevice[];
  addItem: (practiceId: string, draft: InventoryDraft) => void;
  removeItem: (practiceId: string, itemId: string) => void;
  addKnownDevice: (practiceId: string, draft: KnownDeviceDraft) => void;
  removeKnownDevice: (practiceId: string, deviceId: string) => void;
  confirmKnownDevice: (practiceId: string, deviceId: string, confirmedAt?: Date) => void;
};

const storage = createStringStorage("praxisshield-inventory");

export const useInventoryStore = create<InventoryState>()(
  persist(
    (set, get) => ({
      itemsByPractice: {},
      knownDevicesByPractice: {},
      ensurePracticeInventory: (practice) => {
        if (!practice) return;
        const existing = get().itemsByPractice[practice.id];
        if (existing) return;

        set((state) => ({
          itemsByPractice: {
            ...state.itemsByPractice,
            [practice.id]: createPracticeSeedInventory(practice)
          }
        }));
      },
      getItems: (practiceId) => (practiceId ? get().itemsByPractice[practiceId] ?? [] : []),
      getKnownDevices: (practiceId) => (practiceId ? get().knownDevicesByPractice[practiceId] ?? [] : []),
      addItem: (practiceId, draft) =>
        set((state) => ({
          itemsByPractice: {
            ...state.itemsByPractice,
            [practiceId]: [...(state.itemsByPractice[practiceId] ?? []), createInventoryItem(draft)]
          }
        })),
      removeItem: (practiceId, itemId) =>
        set((state) => ({
          itemsByPractice: {
            ...state.itemsByPractice,
            [practiceId]: (state.itemsByPractice[practiceId] ?? []).filter((item) => item.id !== itemId)
          }
        })),
      addKnownDevice: (practiceId, draft) =>
        set((state) => ({
          knownDevicesByPractice: {
            ...state.knownDevicesByPractice,
            [practiceId]: [...(state.knownDevicesByPractice[practiceId] ?? []), createKnownDevice(draft)]
          }
        })),
      removeKnownDevice: (practiceId, deviceId) =>
        set((state) => ({
          knownDevicesByPractice: {
            ...state.knownDevicesByPractice,
            [practiceId]: (state.knownDevicesByPractice[practiceId] ?? []).filter((device) => device.id !== deviceId)
          }
        })),
      confirmKnownDevice: (practiceId, deviceId, confirmedAt = new Date()) =>
        set((state) => ({
          knownDevicesByPractice: {
            ...state.knownDevicesByPractice,
            [practiceId]: (state.knownDevicesByPractice[practiceId] ?? []).map((device) =>
              device.id === deviceId
                ? { ...device, lastConfirmedAt: confirmedAt.toISOString(), updatedAt: confirmedAt.toISOString() }
                : device
            )
          }
        }))
    }),
    {
      name: "inventory",
      storage: createJSONStorage(() => ({
        getItem: (name) => storage.getString(name) ?? null,
        setItem: (name, value) => storage.set(name, value),
        removeItem: (name) => storage.delete(name)
      }))
    }
  )
);
