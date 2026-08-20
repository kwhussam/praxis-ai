declare const __dirname: string;
export {};

const fs = require("fs") as {
  readFileSync(filePath: string, encoding: "utf8"): string;
};
const path = require("path") as {
  resolve(...parts: string[]): string;
};

const repoRoot = path.resolve(__dirname, "../..");
const { hardenAndroidReleaseSigning } = require("../../plugins/with-secure-android-backup.js") as {
  hardenAndroidReleaseSigning(contents: string): string;
};
const { androidUsesCleartextTraffic } = require("../../plugins/with-secure-android-backup.js") as {
  androidUsesCleartextTraffic(environment?: Record<string, string | undefined>): "true" | "false";
};

function read(relativePath: string) {
  return fs.readFileSync(path.resolve(repoRoot, relativePath), "utf8");
}

describe("SP2-06 native release configuration", () => {
  const appConfig = JSON.parse(read("app.json")) as {
    expo: {
      version?: string;
      ios?: { buildNumber?: string; entitlements?: Record<string, unknown>; infoPlist?: Record<string, unknown> };
      android?: { versionCode?: number; allowBackup?: boolean; blockedPermissions?: string[]; permissions?: string[] };
      plugins?: unknown[];
    };
  };

  it("keeps explicit, positive native release versions bound to the product version", () => {
    const packageVersion = (JSON.parse(read("package.json")) as { version: string }).version;
    expect(appConfig.expo.version).toBe(packageVersion);
    expect(appConfig.expo.android?.versionCode).toBeGreaterThan(0);
    expect(appConfig.expo.ios?.buildNumber).toMatch(/^[1-9][0-9]*$/);
  });

  it("keeps the iOS Wi-Fi information entitlement in the prebuild contract", () => {
    expect(appConfig.expo.ios?.entitlements?.["com.apple.developer.networking.wifi-info"]).toBe(true);
  });

  it("declares local-network and location purpose strings without unused Bonjour service claims", () => {
    expect(typeof appConfig.expo.ios?.infoPlist?.NSLocalNetworkUsageDescription).toBe("string");
    expect(typeof appConfig.expo.ios?.infoPlist?.NSLocationWhenInUseUsageDescription).toBe("string");
    expect(appConfig.expo.ios?.infoPlist?.NSBonjourServices).toBe(undefined);
  });

  it("disables Android backup and excludes every app data domain from backup and device transfer", () => {
    expect(appConfig.expo.android?.allowBackup).toBe(false);
    expect(appConfig.expo.plugins).toContain("./plugins/with-secure-android-backup");

    const plugin = read("plugins/with-secure-android-backup.js");
    expect(plugin).toContain('application.$["android:allowBackup"] = "false"');
    expect(plugin).toContain('application.$["android:fullBackupContent"] = "@xml/backup_rules"');
    expect(plugin).toContain('application.$["android:dataExtractionRules"] = "@xml/data_extraction_rules"');
    expect(plugin).toContain('application.$["android:usesCleartextTraffic"] = androidUsesCleartextTraffic()');
    expect(plugin).toContain("Release signing is injected only by the protected CI/EAS credential provider.");
    expect(plugin).toContain("PraxisShield release signing contract v1");
    expect(plugin).toContain('System.getenv("ANDROID_KEYSTORE_PATH")');
    expect(plugin).toContain("praxisShieldReleaseSigningRequested");
    expect(plugin).toContain("Incomplete PraxisShield Android release signing configuration");
    expect(plugin).toContain("Could not remove the Expo template's debug signing");

    for (const domain of ["root", "file", "database", "sharedpref", "external"]) {
      expect(plugin).toContain(`<exclude domain="${domain}" path="."/>`);
    }

    expect(plugin).toContain("<cloud-backup>");
    expect(plugin).toContain("<device-transfer>");
    for (const domain of ["root", "file", "database", "sharedpref", "external"]) {
      const occurrences = plugin.split(`<exclude domain="${domain}" path="."/>`).length - 1;
      expect(occurrences).toBe(3);
    }
    for (const domain of ["device_root", "device_file", "device_database", "device_sharedpref"]) {
      expect(plugin).not.toContain(`domain="${domain}"`);
    }
  });

  it("keeps Android cleartext fail-closed outside an explicitly marked local E2E build", () => {
    expect(androidUsesCleartextTraffic({})).toBe("false");
    expect(androidUsesCleartextTraffic({ EXPO_PUBLIC_APP_ENV: "test" })).toBe("false");
    expect(androidUsesCleartextTraffic({ PRAXISSHIELD_ALLOW_LOCAL_CLEARTEXT: "1" })).toBe("false");
    expect(androidUsesCleartextTraffic({
      EXPO_PUBLIC_APP_ENV: "test",
      PRAXISSHIELD_ALLOW_LOCAL_CLEARTEXT: "1"
    })).toBe("true");
  });

  it("creates an idempotent, fail-closed protected Android signing configuration", () => {
    const fixture = `android {\n    buildTypes {\n        release {\n            signingConfig signingConfigs.debug\n            shrinkResources false\n        }\n    }\n}\n`;
    const secured = hardenAndroidReleaseSigning(fixture);

    expect(secured).not.toContain("signingConfig signingConfigs.debug");
    expect(secured).toContain("PraxisShield release signing contract v1");
    expect(secured).toContain("Incomplete PraxisShield Android release signing configuration");
    expect(secured).toContain("signingConfig signingConfigs.release");
    expect(hardenAndroidReleaseSigning(secured)).toBe(secured);
    expect(() => hardenAndroidReleaseSigning("android { buildTypes { release { } } }")).toThrow();
  });

  it("keeps production storage and overlay permissions out while retaining explicit Wi-Fi permissions", () => {
    for (const permission of [
      "android.permission.READ_EXTERNAL_STORAGE",
      "android.permission.WRITE_EXTERNAL_STORAGE",
      "android.permission.SYSTEM_ALERT_WINDOW"
    ]) {
      expect(appConfig.expo.android?.blockedPermissions?.includes(permission)).toBe(true);
    }
    for (const permission of ["ACCESS_FINE_LOCATION", "NEARBY_WIFI_DEVICES", "ACCESS_WIFI_STATE", "ACCESS_NETWORK_STATE"]) {
      expect(appConfig.expo.android?.permissions?.includes(permission)).toBe(true);
    }

    const plugin = read("plugins/with-secure-android-backup.js");
    expect(plugin).toContain('"android:usesPermissionFlags"] = "neverForLocation"');
  });

  it("generates both native probe implementations from committed plugin sources", () => {
    const plugin = read("plugins/with-network-security-probe.js");
    const swiftProbe = read("plugins/native/ios/PraxisShieldNetworkProbe.swift");
    const objcBridge = read("plugins/native/ios/PraxisShieldNetworkProbeBridge.m");

    expect(plugin).toContain('"PraxisShieldNetworkProbe.swift"');
    expect(plugin).toContain('"PraxisShieldNetworkProbeBridge.m"');
    expect(plugin).toContain("project.addSourceFile(projectPath, {}, groupKey)");
    expect(plugin).toContain("line.trim() !== reactImport");
    expect(plugin).not.toContain("fs.existsSync(bridgingHeader)");
    expect(plugin).toContain('error?.code !== "ENOENT"');
    expect(swiftProbe).toContain("class PraxisShieldNetworkProbe");
    expect(swiftProbe).toContain("typealias PromiseResolveBlock = (Any?) -> Void");
    expect(swiftProbe).toContain("typealias PromiseRejectBlock = (String?, String?, Error?) -> Void");
    expect(swiftProbe).not.toContain("RCTPromiseResolveBlock");
    expect(swiftProbe).not.toContain("RCTPromiseRejectBlock");
    expect(objcBridge).toContain("#import <React/RCTBridgeModule.h>");
    expect(objcBridge).toContain("RCT_EXTERN_MODULE(PraxisShieldNetworkProbe");
    expect(objcBridge).toContain("RCTPromiseResolveBlock");
    expect(objcBridge).toContain("RCTPromiseRejectBlock");
  });

  it("runs Maestro against the explicit flow directory and gates the authoritative JUnit result", () => {
    const smokeRunner = read("scripts/e2e/smoke.sh");
    const maestroConfig = read(".maestro/config.yaml");
    const smokeConfig = read(".maestro/smoke-config.yaml");

    expect(smokeRunner).toContain('cd "$ROOT_DIR/.maestro"');
    expect(smokeRunner).toContain('MAESTRO_CONFIG="$ROOT_DIR/.maestro/smoke-config.yaml"');
    expect(smokeRunner).toContain("MAESTRO_TARGETS=(flows/*.yaml)");
    expect(smokeRunner).toContain('for MAESTRO_TARGET in "${MAESTRO_TARGETS[@]}"');
    expect(smokeRunner).not.toContain('MAESTRO_TARGET="."');
    expect(smokeRunner).toContain("No Maestro flows found");
    expect(smokeRunner).toContain('assert-maestro-results.mjs" "${RESULT_FILES[@]}"');
    expect(smokeRunner).toContain("node scripts/e2e/seed-canonical-report.mjs");
    expect(smokeRunner).not.toContain('if [[ "$SUITE" == "pdf" ]]; then\n  node scripts/e2e/seed-canonical-report.mjs');
    expect(maestroConfig).toContain('flows:\n  - "flows/*.yaml"');
    expect(maestroConfig).toContain("flowsOrder:");
    expect(maestroConfig).toContain("continueOnFailure: false");
    expect(maestroConfig).not.toContain("continueOnFailure: true");
    expect(smokeConfig).not.toContain("executionOrder:");
  });

  it("recovers the local auth gateway after a Supabase reset before validating seed users", () => {
    const environmentRunner = read("scripts/e2e/env-up.sh");

    expect(environmentRunner).toContain('AUTH_HEALTH_URL="$LOCAL_SUPABASE_URL/auth/v1/health"');
    expect(environmentRunner).toContain('wait_for_auth_gateway "$AUTH_HEALTH_URL" 30');
    expect(environmentRunner).toContain('if [[ "$http_code" == "502" ]]');
    expect(environmentRunner).toContain("consecutive_bad_gateway >= 3");
    expect(environmentRunner).not.toContain('wait_for_http "$AUTH_HEALTH_URL" 5');
    expect(environmentRunner).toContain('KONG_CONTAINER="$(container_id supabase_kong_)"');
    expect(environmentRunner).toContain('docker restart "$KONG_CONTAINER"');
    expect(environmentRunner.indexOf('wait_for_auth_gateway "$AUTH_HEALTH_URL"')).toBeLessThan(
      environmentRunner.indexOf("node scripts/e2e/verify-seed.mjs")
    );
  });
});
