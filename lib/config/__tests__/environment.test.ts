declare const afterEach: (fn: () => void) => void;
declare const jest: {
  resetModules(): void;
};

describe("AppConfig production guards", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
  });

  function loadConfig() {
    return require("../environment").AppConfig;
  }

  it("throws when production is missing Supabase config", () => {
    process.env.EXPO_PUBLIC_APP_ENV = "production";
    process.env.EXPO_PUBLIC_SUPABASE_URL = "";
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = "";
    process.env.EXPO_PUBLIC_API_BASE_URL = "https://api.praxisshield.ai";
    jest.resetModules();

    expect(() => loadConfig()).toThrow("Supabase-Konfiguration fehlt");
  });

  it("throws when production apiBaseUrl is not https://", () => {
    process.env.EXPO_PUBLIC_APP_ENV = "production";
    process.env.EXPO_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    process.env.EXPO_PUBLIC_API_BASE_URL = "http://api.praxisshield.ai";
    jest.resetModules();

    expect(() => loadConfig()).toThrow("API-Base-URL muss im Produktionsmodus HTTPS nutzen");
  });

  it("does not throw when production config is valid", () => {
    process.env.EXPO_PUBLIC_APP_ENV = "production";
    process.env.EXPO_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    process.env.EXPO_PUBLIC_API_BASE_URL = "https://api.praxisshield.ai";
    jest.resetModules();

    expect(() => loadConfig()).not.toThrow();
  });

  it("does not enforce https:// outside production", () => {
    process.env.EXPO_PUBLIC_APP_ENV = "development";
    process.env.EXPO_PUBLIC_API_BASE_URL = "http://localhost:8787";
    jest.resetModules();

    expect(() => loadConfig()).not.toThrow();
  });
});
