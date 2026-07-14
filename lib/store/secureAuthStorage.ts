import * as SecureStore from "expo-secure-store";

type AuthStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

const memoryFallback = new Map<string, string>();

export function createSecureAuthStorage(namespace: string): AuthStorage {
  return {
    async getItem(key) {
      if (!(await canUseSecureStore())) {
        return memoryFallback.get(key) ?? null;
      }

      const value = await SecureStore.getItemAsync(secureStoreKey(namespace, key));
      return value ?? memoryFallback.get(key) ?? null;
    },
    async setItem(key, value) {
      memoryFallback.set(key, value);
      if (!(await canUseSecureStore())) return;
      await SecureStore.setItemAsync(secureStoreKey(namespace, key), value, secureStoreOptions(namespace));
    },
    async removeItem(key) {
      memoryFallback.delete(key);
      if (!(await canUseSecureStore())) return;
      await SecureStore.deleteItemAsync(secureStoreKey(namespace, key), secureStoreOptions(namespace));
    }
  };
}

async function canUseSecureStore() {
  return SecureStore.isAvailableAsync().catch(() => false);
}

function secureStoreOptions(namespace: string) {
  return {
    keychainService: namespace
  };
}

function secureStoreKey(namespace: string, key: string) {
  const safeKey = key.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80);
  return `${namespace}.${safeKey}.${fnv1a32(key)}`;
}

function fnv1a32(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
