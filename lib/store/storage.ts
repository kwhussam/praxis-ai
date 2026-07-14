import { MMKV } from "react-native-mmkv";

type StringStorage = {
  getString: (key: string) => string | undefined;
  set: (key: string, value: string) => void;
  delete: (key: string) => void;
};

const storages = new Map<string, StringStorage>();
const volatileStorages = new Map<string, StringStorage>();

export function createStringStorage(id: string, options?: { encryptionKey?: string }): StringStorage {
  const existing = storages.get(id);
  if (existing) return existing;

  const storage = createNativeStorage(id, options) ?? createMemoryStorage();
  storages.set(id, storage);
  return storage;
}

export function createVolatileStringStorage(id: string): StringStorage {
  const existing = volatileStorages.get(id);
  if (existing) return existing;

  const storage = createMemoryStorage();
  volatileStorages.set(id, storage);
  return storage;
}

function createNativeStorage(id: string, options?: { encryptionKey?: string }) {
  try {
    return new MMKV({
      id,
      encryptionKey: options?.encryptionKey
    });
  } catch (error) {
    console.warn(`MMKV storage "${id}" is unavailable; falling back to in-memory storage.`, error);
    return null;
  }
}

function createMemoryStorage(): StringStorage {
  const values = new Map<string, string>();

  return {
    getString: (key) => values.get(key),
    set: (key, value) => {
      values.set(key, value);
    },
    delete: (key) => {
      values.delete(key);
    }
  };
}
