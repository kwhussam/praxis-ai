import { MMKV } from "react-native-mmkv";
import { createClient } from "@supabase/supabase-js";

import { AppConfig } from "@/lib/config/environment";

if (!AppConfig.supabaseUrl || !AppConfig.supabaseAnonKey) {
  console.warn("Missing Supabase environment variables. Using client will fail until .env is configured.");
}

const authStorage = new MMKV({ id: "praxisshield-auth" });

export const supabase = createClient(AppConfig.supabaseUrl, AppConfig.supabaseAnonKey, {
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
