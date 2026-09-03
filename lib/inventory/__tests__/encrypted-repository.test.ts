declare const jest: {
  mock(moduleName: string, factory: () => unknown): void;
  resetModules(): void;
};
declare function beforeEach(fn: () => void): void;

import { EncryptedInventoryRepository, type LocalInventoryBlobStore, type LocalInventoryKeyStore } from "@/lib/inventory/encryptedInventoryRepository";
import { createInventoryItem } from "@/lib/inventory/inventory";
import { localInventoryCipher } from "@/lib/inventory/localInventoryCrypto";
import { INVENTORY_SNAPSHOT_VERSION, type InventoryPracticeSnapshot } from "@/lib/inventory/repository";

let mockRandomCounter = 0;

jest.mock("expo-crypto", () => ({
  getRandomBytesAsync: async (length: number) => Uint8Array.from(
    { length },
    (_, index) => (index + mockRandomCounter++) % 256
  )
}));

describe("EncryptedInventoryRepository", () => {
  beforeEach(() => {
    mockRandomCounter = 0;
  });

  it("persistiert einen praxisgebundenen Snapshot nur als AES-GCM-Envelope", async () => {
    const keys = new MemoryKeyStore();
    const blobs = new MemoryBlobStore();
    const repository = new EncryptedInventoryRepository(keys, blobs, localInventoryCipher);
    const snapshot = inventorySnapshot("practice-a", 1, "Praxisverwaltungssystem");

    expect(await repository.save(snapshot, 0)).toEqual({ status: "saved", revision: 1 });
    expect(blobs.rows.get("practice-a")?.envelope).not.toContain("Praxisverwaltungssystem");
    expect(await repository.load("practice-a")).toEqual({ status: "ready", snapshot });
  });

  it("entschlüsselt unter Hermes ohne globalen TextDecoder auch Unicode-Inhalte", async () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "TextDecoder");
    Object.defineProperty(globalThis, "TextDecoder", { configurable: true, value: undefined });
    try {
      const keys = new MemoryKeyStore();
      const blobs = new MemoryBlobStore();
      const repository = new EncryptedInventoryRepository(keys, blobs, localInventoryCipher);
      const snapshot = inventorySnapshot("practice-a", 1, "Ärzte-PVS 🔐");

      expect(await repository.save(snapshot, 0)).toEqual({ status: "saved", revision: 1 });
      expect(await repository.load("practice-a")).toEqual({ status: "ready", snapshot });
    } finally {
      if (descriptor) Object.defineProperty(globalThis, "TextDecoder", descriptor);
      else delete (globalThis as { TextDecoder?: unknown }).TextDecoder;
    }
  });

  it("verhindert das Verschieben eines Ciphertexts zwischen Praxen über AAD", async () => {
    const sharedKey = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
    const keys = new MemoryKeyStore(sharedKey);
    const blobs = new MemoryBlobStore();
    const repository = new EncryptedInventoryRepository(keys, blobs, localInventoryCipher);
    await repository.save(inventorySnapshot("practice-a", 1, "PVS-A"), 0);
    keys.values.set("practice-b", sharedKey.slice());

    const row = blobs.rows.get("practice-a");
    expect(row).toBeDefined();
    blobs.rows.set("practice-b", { ...row! });

    expect(await repository.load("practice-b")).toEqual({ status: "error", reason: "decrypt_failed" });
  });

  it("lehnt manipulierte authentifizierte Envelope-Metadaten ab", async () => {
    const keys = new MemoryKeyStore();
    const blobs = new MemoryBlobStore();
    const repository = new EncryptedInventoryRepository(keys, blobs, localInventoryCipher);
    await repository.save(inventorySnapshot("practice-a", 1, "PVS-A"), 0);
    const row = blobs.rows.get("practice-a")!;
    const envelope = JSON.parse(row.envelope) as { createdAt: string; alg: string };
    envelope.createdAt = "2026-08-11T00:00:00.000Z";
    blobs.rows.set("practice-a", { ...row, envelope: JSON.stringify(envelope) });

    expect(await repository.load("practice-a")).toEqual({ status: "error", reason: "decrypt_failed" });
  });

  it("verwendet für identische Snapshots niemals dieselbe IV", async () => {
    const key = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
    const context = { practiceId: "practice-a", revision: 1 };
    const first = await localInventoryCipher.encrypt(key, "gleich", context);
    const second = await localInventoryCipher.encrypt(key, "gleich", context);

    expect(first.ivB64u).not.toBe(second.ivB64u);
    expect(first.ciphertextB64u).not.toBe(second.ciphertextB64u);
  });

  it("lehnt unbekannte lokale Schemaversionen ab, ohne sie zu überschreiben", async () => {
    const key = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
    const keys = new MemoryKeyStore(key);
    keys.values.set("practice-a", key.slice());
    const blobs = new MemoryBlobStore();
    const envelope = await localInventoryCipher.encrypt(
      key,
      JSON.stringify({ ...inventorySnapshot("practice-a", 1, "Legacy"), version: 99 }),
      { practiceId: "practice-a", revision: 1 }
    );
    blobs.rows.set("practice-a", { revision: 1, envelope: JSON.stringify(envelope) });
    const repository = new EncryptedInventoryRepository(keys, blobs, localInventoryCipher);

    expect(await repository.load("practice-a")).toEqual({ status: "error", reason: "invalid_payload" });
    expect(blobs.rows.get("practice-a")?.revision).toBe(1);
  });

  it("bleibt ohne SecureStore flüchtig und schreibt niemals in SQLite", async () => {
    const keys = new MemoryKeyStore();
    keys.available = false;
    const blobs = new MemoryBlobStore();
    const repository = new EncryptedInventoryRepository(keys, blobs, localInventoryCipher);

    expect(await repository.save(inventorySnapshot("practice-a", 1, "PVS-A"), 0)).toEqual({
      status: "volatile",
      reason: "secure_store_unavailable"
    });
    expect(blobs.rows.size).toBe(0);
  });

  it("bleibt flüchtig, wenn der Keychain-Zugriff trotz gemeldeter Verfügbarkeit wirft", async () => {
    // isAvailableAsync() kann true melden und jeder echte Zugriff trotzdem scheitern, etwa bei
    // fehlendem Entitlement. Dann darf kein Snapshot unter einem unsicheren Schlüssel entstehen.
    const keys = new MemoryKeyStore();
    keys.accessError = new Error("errSecMissingEntitlement");
    const blobs = new MemoryBlobStore();
    const repository = new EncryptedInventoryRepository(keys, blobs, localInventoryCipher);

    expect(await repository.save(inventorySnapshot("practice-a", 1, "PVS-A"), 0)).toEqual({
      status: "volatile",
      reason: "secure_store_unavailable"
    });
    expect(blobs.rows.size).toBe(0);
    expect(await repository.load("practice-a")).toEqual({
      status: "volatile",
      reason: "secure_store_unavailable"
    });
  });

  it("meldet einen brechenden Keychain beim Lesen eines vorhandenen Snapshots flüchtig", async () => {
    const keys = new MemoryKeyStore();
    const blobs = new MemoryBlobStore();
    const repository = new EncryptedInventoryRepository(keys, blobs, localInventoryCipher);
    await repository.save(inventorySnapshot("practice-a", 1, "PVS-A"), 0);

    // Der Blob bleibt liegen, aber der Schlüssel ist nicht mehr erreichbar: flüchtig statt
    // eines generischen, wiederholbaren Speicherfehlers.
    keys.accessError = new Error("errSecInteractionNotAllowed");

    expect(await repository.load("practice-a")).toEqual({
      status: "volatile",
      reason: "secure_store_unavailable"
    });
    expect(blobs.rows.size).toBe(1);
  });

  it("erkennt Revisionskonflikte ohne den neueren Snapshot zu überschreiben", async () => {
    const keys = new MemoryKeyStore();
    const blobs = new MemoryBlobStore();
    const repository = new EncryptedInventoryRepository(keys, blobs, localInventoryCipher);
    await repository.save(inventorySnapshot("practice-a", 1, "Version 1"), 0);
    await repository.save(inventorySnapshot("practice-a", 2, "Version 2"), 1);

    expect(await repository.save(inventorySnapshot("practice-a", 2, "Veraltet"), 1)).toEqual({
      status: "conflict",
      actualRevision: 2
    });
    const loaded = await repository.load("practice-a");
    expect(loaded.status === "ready" ? loaded.snapshot.items[0]?.name : null).toBe("Version 2");
  });

  it("meldet Schlüsselverlust geschlossen und vernichtet Schlüssel plus Blob bei Löschung", async () => {
    const keys = new MemoryKeyStore();
    const blobs = new MemoryBlobStore();
    const repository = new EncryptedInventoryRepository(keys, blobs, localInventoryCipher);
    await repository.save(inventorySnapshot("practice-a", 1, "PVS-A"), 0);
    keys.values.delete("practice-a");
    expect(await repository.load("practice-a")).toEqual({ status: "error", reason: "key_missing" });

    expect(await repository.delete("practice-a")).toEqual({ status: "deleted" });
    expect(keys.values.has("practice-a")).toBe(false);
    expect(blobs.rows.has("practice-a")).toBe(false);
  });
});

class MemoryKeyStore implements LocalInventoryKeyStore {
  available = true;
  values = new Map<string, Uint8Array>();
  // Mirrors a Keychain that reports itself as available and still throws on every access.
  accessError: Error | null = null;

  constructor(private readonly fixedKey?: Uint8Array) {}

  async isAvailable() {
    return this.accessError ? false : this.available;
  }

  async load(practiceId: string) {
    if (this.accessError) throw this.accessError;
    const key = this.values.get(practiceId);
    return key ? { version: 1 as const, bytes: key.slice() } : null;
  }

  async create(practiceId: string) {
    if (this.accessError) throw this.accessError;
    const key = this.fixedKey?.slice() ?? Uint8Array.from({ length: 32 }, (_, index) => index + 1);
    this.values.set(practiceId, key.slice());
    return { version: 1 as const, bytes: key };
  }

  async delete(practiceId: string) {
    if (this.accessError) throw this.accessError;
    this.values.delete(practiceId);
  }
}

class MemoryBlobStore implements LocalInventoryBlobStore {
  rows = new Map<string, { revision: number; envelope: string }>();

  async read(practiceId: string) {
    return this.rows.get(practiceId) ?? null;
  }

  async compareAndSwap(
    practiceId: string,
    expectedRevision: number,
    revision: number,
    envelope: string
  ): Promise<{ saved: true } | { saved: false; actualRevision: number }> {
    const actualRevision = this.rows.get(practiceId)?.revision ?? 0;
    if (actualRevision !== expectedRevision) return { saved: false, actualRevision };
    this.rows.set(practiceId, { revision, envelope });
    return { saved: true };
  }

  async delete(practiceId: string) {
    this.rows.delete(practiceId);
  }
}

function inventorySnapshot(practiceId: string, revision: number, name: string): InventoryPracticeSnapshot {
  return {
    version: INVENTORY_SNAPSHOT_VERSION,
    practiceId,
    revision,
    items: [createInventoryItem({ type: "critical_system", name, criticality: "critical" }, new Date("2026-08-10T10:00:00.000Z"))],
    knownDevices: [],
    accessPoints: [],
    routerWifiConfig: null,
    routerFirewallRules: [],
    updatedAt: "2026-08-10T10:00:00.000Z"
  };
}
