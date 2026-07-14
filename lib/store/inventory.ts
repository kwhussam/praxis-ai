import { create } from "zustand";

import { createAccessPoint, createInventoryItem, createKnownDevice, createPracticeSeedInventory, createRouterFirewallRule } from "@/lib/inventory/inventory";
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

type InventoryState = {
  itemsByPractice: Record<string, InventoryItem[]>;
  knownDevicesByPractice: Record<string, KnownDevice[]>;
  accessPointsByPractice: Record<string, AccessPoint[]>;
  routerWifiConfigByPractice: Record<string, RouterWifiConfiguration>;
  routerFirewallRulesByPractice: Record<string, RouterFirewallRule[]>;
  ensurePracticeInventory: (practice: Practice | null) => void;
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
  updateRouterWifiConfig: (practiceId: string, config: Omit<RouterWifiConfiguration, "updatedAt">) => void;
  addRouterFirewallRule: (practiceId: string, draft: RouterFirewallRuleDraft) => void;
  importRouterFirewallRules: (practiceId: string, drafts: RouterFirewallRuleDraft[]) => void;
  removeRouterFirewallRule: (practiceId: string, ruleId: string) => void;
  clear: () => void;
};

export const useInventoryStore = create<InventoryState>()((set, get) => ({
      itemsByPractice: {},
      knownDevicesByPractice: {},
      accessPointsByPractice: {},
      routerWifiConfigByPractice: {},
      routerFirewallRulesByPractice: {},
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
      getAccessPoints: (practiceId) => (practiceId ? get().accessPointsByPractice[practiceId] ?? [] : []),
      getRouterWifiConfig: (practiceId) => (practiceId ? get().routerWifiConfigByPractice[practiceId] ?? null : null),
      getRouterFirewallRules: (practiceId) => (practiceId ? get().routerFirewallRulesByPractice[practiceId] ?? [] : []),
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
        })),
      addAccessPoint: (practiceId, draft) =>
        set((state) => ({
          accessPointsByPractice: {
            ...state.accessPointsByPractice,
            [practiceId]: [...(state.accessPointsByPractice[practiceId] ?? []), createAccessPoint(draft)]
          }
        })),
      removeAccessPoint: (practiceId, accessPointId) =>
        set((state) => ({
          accessPointsByPractice: {
            ...state.accessPointsByPractice,
            [practiceId]: (state.accessPointsByPractice[practiceId] ?? []).filter((accessPoint) => accessPoint.id !== accessPointId)
          }
        })),
      updateRouterWifiConfig: (practiceId, config) =>
        set((state) => ({
          routerWifiConfigByPractice: {
            ...state.routerWifiConfigByPractice,
            [practiceId]: {
              ...config,
              updatedAt: new Date().toISOString()
            }
          }
        })),
      addRouterFirewallRule: (practiceId, draft) =>
        set((state) => ({
          routerFirewallRulesByPractice: {
            ...state.routerFirewallRulesByPractice,
            [practiceId]: [...(state.routerFirewallRulesByPractice[practiceId] ?? []), createRouterFirewallRule(draft)]
          }
        })),
      importRouterFirewallRules: (practiceId, drafts) =>
        set((state) => {
          const importedAt = new Date();
          return {
            routerFirewallRulesByPractice: {
              ...state.routerFirewallRulesByPractice,
              [practiceId]: [
                ...(state.routerFirewallRulesByPractice[practiceId] ?? []),
                ...drafts.map((draft) => createRouterFirewallRule(draft, new Date(), importedAt))
              ]
            }
          };
        }),
      removeRouterFirewallRule: (practiceId, ruleId) =>
        set((state) => ({
          routerFirewallRulesByPractice: {
            ...state.routerFirewallRulesByPractice,
            [practiceId]: (state.routerFirewallRulesByPractice[practiceId] ?? []).filter((rule) => rule.id !== ruleId)
          }
        })),
      clear: () =>
        set({
          itemsByPractice: {},
          knownDevicesByPractice: {},
          accessPointsByPractice: {},
          routerWifiConfigByPractice: {},
          routerFirewallRulesByPractice: {}
        })
}));
