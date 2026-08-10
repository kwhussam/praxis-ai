import { EncryptedInventoryRepository } from "@/lib/inventory/encryptedInventoryRepository";
import { localInventoryCipher } from "@/lib/inventory/localInventoryCrypto";
import { SecureStoreInventoryKeyStore, SQLiteInventoryBlobStore } from "@/lib/inventory/nativeInventoryPersistence";

export const defaultInventoryRepository = new EncryptedInventoryRepository(
  new SecureStoreInventoryKeyStore(),
  new SQLiteInventoryBlobStore(),
  localInventoryCipher
);
