type AppEnvironment = "development" | "demo" | "production" | "test";

function readEnvironment(): AppEnvironment {
  const value = process.env.EXPO_PUBLIC_APP_ENV;
  if (value === "demo" || value === "production" || value === "test") return value;
  return "development";
}

export const AppConfig = {
  appEnv: readEnvironment(),
  isDemoMode: readEnvironment() === "demo",
  isProduction: readEnvironment() === "production",
  features: {
    externalCheckEnabled: process.env.EXPO_PUBLIC_EXTERNAL_CHECK_ENABLED === "true"
  },
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "",
  apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:8787"
} as const;

if (AppConfig.isProduction && (!AppConfig.supabaseUrl || !AppConfig.supabaseAnonKey)) {
  throw new Error("FATAL: Supabase-Konfiguration fehlt im Produktionsmodus.");
}

if (AppConfig.isProduction && !AppConfig.apiBaseUrl.startsWith("https://")) {
  throw new Error("FATAL: API-Base-URL muss im Produktionsmodus HTTPS nutzen.");
}
