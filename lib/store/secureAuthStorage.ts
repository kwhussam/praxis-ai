import * as SecureStore from "expo-secure-store";

type AuthStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

const memoryFallback = new Map<string, string>();
const CHUNK_MARKER = "__PRAXISSHIELD_SECURE_CHUNKS_V1__:";
const MAX_CHUNK_LENGTH = 500;

export function createSecureAuthStorage(namespace: string): AuthStorage {
  return {
    async getItem(key) {
      if (!(await canUseSecureStore())) {
        return memoryFallback.get(key) ?? null;
      }

      const storeKey = secureStoreKey(namespace, key);
      const options = secureStoreOptions(namespace);
      const storedValue = await SecureStore.getItemAsync(storeKey, options);
      const chunkCount = parseChunkCount(storedValue);

      if (chunkCount === null) {
        return storedValue ?? memoryFallback.get(key) ?? null;
      }

      const chunks = await Promise.all(
        Array.from({ length: chunkCount }, (_, index) =>
          SecureStore.getItemAsync(chunkKey(storeKey, index), options)
        )
      );

      if (chunks.some((chunk) => chunk === null)) {
        return memoryFallback.get(key) ?? null;
      }

      return chunks.join("");
    },
    async setItem(key, value) {
      memoryFallback.set(key, value);
      if (!(await canUseSecureStore())) return;

      const storeKey = secureStoreKey(namespace, key);
      const options = secureStoreOptions(namespace);
      const previousValue = await SecureStore.getItemAsync(storeKey, options);
      const previousChunkCount = parseChunkCount(previousValue) ?? 0;
      const chunks = splitIntoChunks(value);

      if (chunks.length === 1) {
        await SecureStore.setItemAsync(storeKey, value, options);
        await deleteChunks(storeKey, previousChunkCount, options);
        return;
      }

      await Promise.all(
        chunks.map((chunk, index) =>
          SecureStore.setItemAsync(chunkKey(storeKey, index), chunk, options)
        )
      );
      await SecureStore.setItemAsync(storeKey, `${CHUNK_MARKER}${chunks.length}`, options);

      if (previousChunkCount > chunks.length) {
        await deleteChunks(storeKey, previousChunkCount, options, chunks.length);
      }
    },
    async removeItem(key) {
      memoryFallback.delete(key);
      if (!(await canUseSecureStore())) return;

      const storeKey = secureStoreKey(namespace, key);
      const options = secureStoreOptions(namespace);
      const storedValue = await SecureStore.getItemAsync(storeKey, options);
      const chunkCount = parseChunkCount(storedValue) ?? 0;

      await deleteChunks(storeKey, chunkCount, options);
      await SecureStore.deleteItemAsync(storeKey, options);
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

function chunkKey(storeKey: string, index: number) {
  return `${storeKey}.chunk.${index}`;
}

function parseChunkCount(value: string | null) {
  if (!value?.startsWith(CHUNK_MARKER)) return null;

  const count = Number(value.slice(CHUNK_MARKER.length));
  return Number.isSafeInteger(count) && count > 0 ? count : null;
}

function splitIntoChunks(value: string) {
  if (value.length === 0) return [""];

  const chunks: string[] = [];
  for (let index = 0; index < value.length; index += MAX_CHUNK_LENGTH) {
    chunks.push(value.slice(index, index + MAX_CHUNK_LENGTH));
  }
  return chunks;
}

async function deleteChunks(
  storeKey: string,
  count: number,
  options: ReturnType<typeof secureStoreOptions>,
  startIndex = 0
) {
  await Promise.all(
    Array.from({ length: Math.max(0, count - startIndex) }, (_, offset) =>
      SecureStore.deleteItemAsync(chunkKey(storeKey, startIndex + offset), options)
    )
  );
}

function fnv1a32(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
