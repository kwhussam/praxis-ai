import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { createInventoryItem, createPracticeSeedInventory } from "@/lib/inventory/inventory";
import type { InventoryDraft, InventoryItem } from "@/lib/inventory/types";
import type { Practice } from "@/lib/store/session";
import { createStringStorage } from "@/lib/store/storage";

type InventoryState = {
  itemsByPractice: Record<string, InventoryItem[]>;
  ensurePracticeInventory: (practice: Practice | null) => void;
  getItems: (practiceId?: string) => InventoryItem[];
  addItem: (practiceId: string, draft: InventoryDraft) => void;
  removeItem: (practiceId: string, itemId: string) => void;
};

const storage = createStringStorage("praxisshield-inventory");

export const useInventoryStore = create<InventoryState>()(
  persist(
    (set, get) => ({
      itemsByPractice: {},
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
