import * as SecureStore from "expo-secure-store";

// SecureStore.isAvailableAsync() only reports whether the native module is linked. It says
// nothing about whether a Keychain/Keystore operation actually succeeds: a missing entitlement,
// a locked device or a broken keychain group still throws on the first real access while
// isAvailableAsync() keeps returning true.
//
// Every caller that stores secrets must therefore probe an actual read before trusting the
// store. Both consumers share this probe so auth tokens and inventory keys can never diverge
// in how they decide that secure storage works.
const PROBE_KEY = "__praxisshield_secure_store_probe__";

export async function canOperateSecureStore(
  options?: SecureStore.SecureStoreOptions
): Promise<boolean> {
  try {
    if (!(await SecureStore.isAvailableAsync())) return false;

    // A missing probe entry resolves to null, which is a successful operation. Only a thrown
    // error means the store cannot be operated.
    await SecureStore.getItemAsync(PROBE_KEY, options);
    return true;
  } catch {
    return false;
  }
}
