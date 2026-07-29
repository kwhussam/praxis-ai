import * as SecureStore from "expo-secure-store";

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
  if (await secureStoreAvailable()) await SecureStore.setItemAsync(KEY, code, options());
}

export async function getPendingInvitationCode() {
  if (memoryCode) return memoryCode;
  if (!(await secureStoreAvailable())) return null;
  const value = await SecureStore.getItemAsync(KEY, options());
  if (!value || !CODE_PATTERN.test(value)) return null;
  memoryCode = value;
  return value;
}

export async function clearPendingInvitationCode() {
  memoryCode = null;
  if (await secureStoreAvailable()) await SecureStore.deleteItemAsync(KEY, options());
}

function options() { return { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }; }
function secureStoreAvailable() { return SecureStore.isAvailableAsync().catch(() => false); }
