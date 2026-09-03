import * as SecureStore from "expo-secure-store";

import { canOperateSecureStore } from "@/lib/security/secureStoreAvailability";

const KEY = "praxisshield.pending-invitation.v1";
const CODE_PATTERN = /^[0-9A-HJKMNP-TV-Z]{10}$/;
let memoryCode: string | null = null;

export function normalizeInvitationCode(raw: string) {
  return raw.replace(/[\s-]+/g, "").toUpperCase();
}

export async function savePendingInvitationCode(raw: string) {
  const code = normalizeInvitationCode(raw);
  if (!CODE_PATTERN.test(code)) throw new Error("invalid_invitation_code");
  memoryCode = code;
  const storeOptions = options();
  if (!(await canOperateSecureStore(storeOptions))) return;
  try {
    await SecureStore.setItemAsync(KEY, code, storeOptions);
  } catch {
    // The handoff remains available for this process only. Never persist an invitation
    // code through an unprotected fallback when Keychain/Keystore access fails.
  }
}

export async function getPendingInvitationCode() {
  if (memoryCode) return memoryCode;
  const storeOptions = options();
  if (!(await canOperateSecureStore(storeOptions))) return null;
  try {
    const value = await SecureStore.getItemAsync(KEY, storeOptions);
    if (!value) return null;
    if (!CODE_PATTERN.test(value)) {
      await SecureStore.deleteItemAsync(KEY, storeOptions);
      return null;
    }
    memoryCode = value;
    return value;
  } catch {
    return null;
  }
}

export async function clearPendingInvitationCode() {
  memoryCode = null;
  const storeOptions = options();
  if (!(await canOperateSecureStore(storeOptions))) return;
  try {
    await SecureStore.deleteItemAsync(KEY, storeOptions);
  } catch {
    // Volatile state is already cleared; a native store error must not block the handoff reset.
  }
}

function options() { return { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }; }
