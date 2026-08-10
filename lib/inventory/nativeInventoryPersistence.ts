import { getRandomBytesAsync } from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { openDatabaseAsync, type SQLiteDatabase } from "expo-sqlite";

import {
  type LocalInventoryBlobStore,
  type LocalInventoryKey,
  type LocalInventoryKeyStore
} from "@/lib/inventory/encryptedInventoryRepository";
import {
  base64UrlToBytes,
  bytesToBase64Url,
  LOCAL_INVENTORY_KEY_BYTES
} from "@/lib/inventory/localInventoryCrypto";

const KEY_NAMESPACE = "praxisshield-inventory-key-v1";
const DATABASE_NAME = "praxisshield-inventory-v1.db";

export class SecureStoreInventoryKeyStore implements LocalInventoryKeyStore {
  async isAvailable() {
    return SecureStore.isAvailableAsync().catch(() => false);
  }

  async load(practiceId: string): Promise<LocalInventoryKey | null> {
    const value = await SecureStore.getItemAsync(keyName(practiceId), options());
    if (!value) return null;
    try {
      const candidate = JSON.parse(value) as { version?: unknown; alg?: unknown; keyB64u?: unknown };
      if (candidate.version !== 1 || candidate.alg !== "A256GCM" || typeof candidate.keyB64u !== "string") return null;
      const bytes = base64UrlToBytes(candidate.keyB64u);
      return bytes.length === LOCAL_INVENTORY_KEY_BYTES ? { version: 1, bytes } : null;
    } catch {
      return null;
    }
  }

  async create(practiceId: string): Promise<LocalInventoryKey> {
    const bytes = await getRandomBytesAsync(LOCAL_INVENTORY_KEY_BYTES);
    await SecureStore.setItemAsync(
      keyName(practiceId),
      JSON.stringify({ version: 1, alg: "A256GCM", keyB64u: bytesToBase64Url(bytes) }),
      options()
    );
    return { version: 1, bytes };
  }

  async delete(practiceId: string) {
    await SecureStore.deleteItemAsync(keyName(practiceId), options());
  }
}

export class SQLiteInventoryBlobStore implements LocalInventoryBlobStore {
  private databasePromise: Promise<SQLiteDatabase> | null = null;

  async read(practiceId: string) {
    const database = await this.database();
    return database.getFirstAsync<{ revision: number; envelope: string }>(
      "select revision, envelope from local_inventory_snapshots where practice_id = ?",
      practiceId
    );
  }

  async compareAndSwap(
    practiceId: string,
    expectedRevision: number,
    revision: number,
    envelope: string,
    updatedAt: string
  ): Promise<{ saved: true } | { saved: false; actualRevision: number }> {
    const database = await this.database();
    let result: { saved: true } | { saved: false; actualRevision: number } = {
      saved: false,
      actualRevision: expectedRevision
    };

    await database.withExclusiveTransactionAsync(async (transaction) => {
      const current = await transaction.getFirstAsync<{ revision: number }>(
        "select revision from local_inventory_snapshots where practice_id = ?",
        practiceId
      );
      const actualRevision = current?.revision ?? 0;
      if (actualRevision !== expectedRevision) {
        result = { saved: false, actualRevision };
        return;
      }

      if (current) {
        const update = await transaction.runAsync(
          "update local_inventory_snapshots set revision = ?, envelope = ?, updated_at = ? where practice_id = ? and revision = ?",
          revision,
          envelope,
          updatedAt,
          practiceId,
          expectedRevision
        );
        result = update.changes === 1 ? { saved: true } : { saved: false, actualRevision };
        return;
      }

      const insert = await transaction.runAsync(
        "insert or ignore into local_inventory_snapshots(practice_id, revision, envelope, updated_at) values (?, ?, ?, ?)",
        practiceId,
        revision,
        envelope,
        updatedAt
      );
      result = insert.changes === 1 ? { saved: true } : { saved: false, actualRevision: 0 };
    });
    return result;
  }

  async delete(practiceId: string) {
    const database = await this.database();
    await database.runAsync("delete from local_inventory_snapshots where practice_id = ?", practiceId);
  }

  private database() {
    if (!this.databasePromise) this.databasePromise = initializeDatabase();
    return this.databasePromise;
  }
}

async function initializeDatabase() {
  const database = await openDatabaseAsync(DATABASE_NAME);
  await database.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS local_inventory_snapshots (
      practice_id TEXT PRIMARY KEY NOT NULL,
      revision INTEGER NOT NULL CHECK (revision >= 1),
      envelope TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  return database;
}

function options() {
  return {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    keychainService: KEY_NAMESPACE
  };
}

function keyName(practiceId: string) {
  const safePracticeId = practiceId.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80);
  return `${KEY_NAMESPACE}.${safePracticeId}`;
}
