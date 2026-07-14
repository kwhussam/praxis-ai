import { createClient } from "@supabase/supabase-js";

import { AppConfig } from "@/lib/config/environment";
import { createSecureAuthStorage } from "@/lib/store/secureAuthStorage";

if (!AppConfig.supabaseUrl || !AppConfig.supabaseAnonKey) {
  console.warn("Missing Supabase environment variables. Using client will fail until .env is configured.");
}

const authStorage = createSecureAuthStorage("praxisshield-auth");

export const supabase = createClient(AppConfig.supabaseUrl, AppConfig.supabaseAnonKey, {
  auth: {
    storage: {
      getItem: (key) => authStorage.getItem(key),
      setItem: (key, value) => authStorage.setItem(key, value),
      removeItem: (key) => authStorage.removeItem(key)
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
