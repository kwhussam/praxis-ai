import { MMKV } from "react-native-mmkv";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Missing Supabase environment variables. Using client will fail until .env is configured.");
}

const authStorage = new MMKV({ id: "praxisshield-auth" });

export const supabase = createClient(supabaseUrl ?? "", supabaseAnonKey ?? "", {
  auth: {
    storage: {
      getItem: (key) => authStorage.getString(key) ?? null,
      setItem: (key, value) => authStorage.set(key, value),
      removeItem: (key) => authStorage.delete(key)
    },
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false
  },
  realtime: {
    params: {
      eventsPerSecond: 8
    }
  }
});
