import {
  parseLocalInventoryEnvelope,
  type LocalInventoryCipher,
  type LocalInventoryEnvelope
} from "@/lib/inventory/localInventoryCrypto";
import {
  parseInventorySnapshot,
  type InventoryPracticeSnapshot,
  type InventoryRepository,
  type InventoryRepositoryDeleteResult,
  type InventoryRepositoryLoadResult,
  type InventoryRepositorySaveResult
} from "@/lib/inventory/repository";

export type LocalInventoryKey = {
  version: 1;
  bytes: Uint8Array;
};

export interface LocalInventoryKeyStore {
  isAvailable(): Promise<boolean>;
  load(practiceId: string): Promise<LocalInventoryKey | null>;
  create(practiceId: string): Promise<LocalInventoryKey>;
  delete(practiceId: string): Promise<void>;
}

export interface LocalInventoryBlobStore {
  read(practiceId: string): Promise<{ revision: number; envelope: string } | null>;
  compareAndSwap(
    practiceId: string,
    expectedRevision: number,
    revision: number,
    envelope: string,
    updatedAt: string
  ): Promise<{ saved: true } | { saved: false; actualRevision: number }>;
  delete(practiceId: string): Promise<void>;
}

export class EncryptedInventoryRepository implements InventoryRepository {
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(
    private readonly keys: LocalInventoryKeyStore,
    private readonly blobs: LocalInventoryBlobStore,
    private readonly cipher: LocalInventoryCipher
  ) {}

  load(practiceId: string): Promise<InventoryRepositoryLoadResult> {
    return this.enqueue(practiceId, () => this.loadUnlocked(practiceId));
  }

  save(snapshot: InventoryPracticeSnapshot, expectedRevision: number): Promise<InventoryRepositorySaveResult> {
    return this.enqueue(snapshot.practiceId, () => this.saveUnlocked(snapshot, expectedRevision));
  }

  delete(practiceId: string): Promise<InventoryRepositoryDeleteResult> {
    return this.enqueue(practiceId, () => this.deleteUnlocked(practiceId));
  }

  private async loadUnlocked(practiceId: string): Promise<InventoryRepositoryLoadResult> {
    if (!(await this.keys.isAvailable())) return { status: "volatile", reason: "secure_store_unavailable" };

    let stored: Awaited<ReturnType<LocalInventoryBlobStore["read"]>>;
    try {
      stored = await this.blobs.read(practiceId);
    } catch {
      return { status: "error", reason: "storage_failed" };
    }
    if (!stored) return { status: "empty" };

    let key: LocalInventoryKey | null;
    try {
      key = await this.keys.load(practiceId);
    } catch {
      // A probe can succeed and the very next Keychain read still fail. Distinguish a broken
      // secure store from any other storage error, so the inventory degrades to volatile
      // instead of surfacing as a generic, retryable failure.
      return (await this.secureStoreBroken())
        ? { status: "volatile", reason: "secure_store_unavailable" }
        : { status: "error", reason: "storage_failed" };
    }
    if (!key) return { status: "error", reason: "key_missing" };

    const envelope = parseLocalInventoryEnvelope(stored.envelope);
    if (!envelope || envelope.keyVersion !== key.version || envelope.revision !== stored.revision) {
      key.bytes.fill(0);
      return { status: "error", reason: "invalid_payload" };
    }

    try {
      const plaintext = await this.cipher.decrypt(key.bytes, envelope, { practiceId, revision: stored.revision });
      const snapshot = parseInventorySnapshot(plaintext, practiceId);
      if (!snapshot || snapshot.revision !== stored.revision) return { status: "error", reason: "invalid_payload" };
      return { status: "ready", snapshot };
    } catch {
      return { status: "error", reason: "decrypt_failed" };
    } finally {
      key.bytes.fill(0);
    }
  }

  private async saveUnlocked(
    snapshot: InventoryPracticeSnapshot,
    expectedRevision: number
  ): Promise<InventoryRepositorySaveResult> {
    if (!(await this.keys.isAvailable())) return { status: "volatile", reason: "secure_store_unavailable" };
    if (snapshot.revision !== expectedRevision + 1 || expectedRevision < 0) {
      return { status: "error", reason: "encrypt_failed" };
    }

    let key: LocalInventoryKey;
    try {
      key = await this.loadOrCreateKey(snapshot.practiceId);
    } catch {
      // Without a key from a working secure store there must be no encrypted snapshot at all:
      // return volatile so the caller keeps the inventory in memory and blocks synchronisation,
      // rather than persisting anything under an unprotected key.
      return (await this.secureStoreBroken())
        ? { status: "volatile", reason: "secure_store_unavailable" }
        : { status: "error", reason: "storage_failed" };
    }

    let envelope: LocalInventoryEnvelope;
    try {
      envelope = await this.cipher.encrypt(key.bytes, JSON.stringify(snapshot), {
        practiceId: snapshot.practiceId,
        revision: snapshot.revision
      });
    } catch {
      return { status: "error", reason: "encrypt_failed" };
    } finally {
      key.bytes.fill(0);
    }

    try {
      const result = await this.blobs.compareAndSwap(
        snapshot.practiceId,
        expectedRevision,
        snapshot.revision,
        JSON.stringify(envelope),
        snapshot.updatedAt
      );
      return result.saved
        ? { status: "saved", revision: snapshot.revision }
        : { status: "conflict", actualRevision: result.actualRevision };
    } catch {
      return { status: "error", reason: "storage_failed" };
    }
  }

  private async deleteUnlocked(practiceId: string): Promise<InventoryRepositoryDeleteResult> {
    if (!(await this.keys.isAvailable())) return { status: "volatile", reason: "secure_store_unavailable" };
    try {
      // Destroy the key first: even if SQLite deletion fails, remaining bytes
      // are cryptographically inaccessible and a retry can remove the row.
      await this.keys.delete(practiceId);
      await this.blobs.delete(practiceId);
      return { status: "deleted" };
    } catch {
      return (await this.secureStoreBroken())
        ? { status: "volatile", reason: "secure_store_unavailable" }
        : { status: "error", reason: "storage_failed" };
    }
  }

  private async loadOrCreateKey(practiceId: string) {
    return (await this.keys.load(practiceId)) ?? this.keys.create(practiceId);
  }

  private async secureStoreBroken() {
    try {
      return !(await this.keys.isAvailable());
    } catch {
      return true;
    }
  }

  private enqueue<T>(practiceId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(practiceId) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(operation);
    this.queues.set(practiceId, current);
    const cleanup = () => {
      if (this.queues.get(practiceId) === current) this.queues.delete(practiceId);
    };
    void current.then(cleanup, cleanup);
    return current;
  }
}
