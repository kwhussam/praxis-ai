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
    expect(plugin).toContain('application.$["android:usesCleartextTraffic"] = "false"');
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
    expect(plugin).toContain('"PraxisShieldNetworkProbe.swift"');
    expect(plugin).toContain('"PraxisShieldNetworkProbeBridge.m"');
    expect(plugin).toContain("project.addSourceFile(projectPath, {}, groupKey)");
    expect(read("plugins/native/ios/PraxisShieldNetworkProbe.swift")).toContain("class PraxisShieldNetworkProbe");
    expect(read("plugins/native/ios/PraxisShieldNetworkProbeBridge.m")).toContain(
      "RCT_EXTERN_MODULE(PraxisShieldNetworkProbe"
    );
  });
});
