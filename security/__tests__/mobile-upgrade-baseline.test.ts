declare const __dirname: string;
export {};

const { existsSync, readFileSync } = require("fs") as {
  existsSync(filePath: string): boolean;
  readFileSync(filePath: string, encoding: "utf8"): string;
};
const { resolve } = require("path") as { resolve(...parts: string[]): string };

const repositoryRoot = resolve(__dirname, "../..");

type BuildProperties = {
  android: {
    minSdkVersion: number;
    compileSdkVersion: number;
    targetSdkVersion: number;
  };
  ios: { deploymentTarget: string };
};

type AppPlugin = string | [string, BuildProperties | Record<string, unknown>];

type AppConfig = {
  newArchEnabled?: boolean;
  android: { usesCleartextTraffic?: boolean };
  plugins: AppPlugin[];
};

type PackageJson = {
  dependencies: Record<string, string>;
  engines: { node: string };
  packageManager: string;
  overrides: Record<string, string>;
  expo: { install: { exclude: string[] } };
};

type PackageLock = {
  packages: Record<string, { version?: string }>;
};

type MigrationStage = {
  id: string;
  newArchitecture: string;
  purpose: string;
};

type MigrationRisk = {
  id: string;
  severity: string;
  status: string;
  reason: string;
  packages: string[];
};

type CriticalContract = {
  id: string;
  platforms: string[];
  tests: string[];
};

type UpgradeBaseline = {
  schemaVersion: number;
  capturedAt: string;
  baseCommit: string;
  current: {
    expoSdk: string;
    expo: string;
    reactNative: string;
    react: string;
    newArchitecture: string;
    node: string;
    npm: string;
    platforms: {
      androidMinSdk: number;
      androidCompileSdk: number;
      androidTargetSdk: number;
      iosDeploymentTarget: string;
    };
    expoDoctor: {
      version: string;
      passed: number;
      total: number;
      reactNativeDirectory: string;
      expectedOpenFinding: string | null;
    };
  };
  migration: {
    stages: MigrationStage[];
    recommendedFinalSdk: string;
  };
  directDependencies: Record<string, string>;
  architectureSensitivePackages: Record<string, string[]>;
  configPlugins: string[];
  riskRegister: MigrationRisk[];
  criticalContracts: CriticalContract[];
  goldenCommands: string[];
  sources: string[];
};

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(resolve(repositoryRoot, relativePath), "utf8")) as T;
}

const baseline = readJson<UpgradeBaseline>("security/mobile-upgrade-baseline.json");
const packageJson = readJson<PackageJson>("package.json");
const packageLock = readJson<PackageLock>("package-lock.json");
const appConfig = readJson<{ expo: AppConfig }>("app.json").expo;

describe("SP3-01B mobile upgrade baseline", () => {
  it("pins every direct runtime dependency to its resolved lockfile version", () => {
    expect(baseline.schemaVersion).toBe(1);
    expect(baseline.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(baseline.baseCommit).toMatch(/^[0-9a-f]{40}$/);

    const directNames = Object.keys(packageJson.dependencies).sort();
    expect(Object.keys(baseline.directDependencies).sort()).toEqual(directNames);

    for (const name of directNames) {
      expect(baseline.directDependencies[name]).toBe(packageLock.packages[`node_modules/${name}`]?.version);
    }
  });

  it("keeps the current SDK, architecture and native platform floors explicit", () => {
    expect(baseline.current).toMatchObject({
      expoSdk: "54",
      expo: packageLock.packages["node_modules/expo"].version,
      reactNative: packageLock.packages["node_modules/react-native"].version,
      react: packageLock.packages["node_modules/react"].version,
      newArchitecture: "explicitly_disabled",
      node: packageJson.engines.node,
      npm: packageJson.packageManager.replace("npm@", "")
    });

    const buildPropertiesPlugin = appConfig.plugins.find(
      (plugin: unknown) => Array.isArray(plugin) && plugin[0] === "expo-build-properties"
    );
    const buildProperties = Array.isArray(buildPropertiesPlugin)
      ? buildPropertiesPlugin[1] as BuildProperties
      : undefined;
    expect(buildProperties).toBeDefined();
    if (!buildProperties) {
      throw new Error("expo-build-properties configuration is missing");
    }
    expect(baseline.current.platforms).toEqual({
      androidMinSdk: buildProperties.android.minSdkVersion,
      androidCompileSdk: buildProperties.android.compileSdkVersion,
      androidTargetSdk: buildProperties.android.targetSdkVersion,
      iosDeploymentTarget: buildProperties.ios.deploymentTarget
    });
    expect(appConfig.newArchEnabled).toBe(false);
    expect(packageJson.expo?.install?.exclude ?? []).toEqual([]);
  });

  it("keeps the SDK 54 legacy renderer on its verified react-native-svg line", () => {
    const reactNativeVersion = packageLock.packages["node_modules/react-native"].version;
    const svgVersion = packageLock.packages["node_modules/react-native-svg"].version;
    expect(reactNativeVersion).toBe("0.81.5");
    expect(svgVersion).toBe("15.12.1");
    expect(packageJson.dependencies["react-native-svg"]).toBe("15.12.1");

    const paperDelegate = readFileSync(
      resolve(
        repositoryRoot,
        "node_modules/react-native-svg/android/src/paper/java/com/facebook/react/viewmanagers/RNSVGTextManagerDelegate.java"
      ),
      "utf8"
    );
    expect(paperDelegate).not.toContain("BaseViewManagerInterface");
    expect(paperDelegate).toContain("extends BaseViewManager<");
  });

  it("keeps RN 0.81 legacy mode on the screens line with the content-wrapper parent fix", () => {
    const reactNativeVersion = packageLock.packages["node_modules/react-native"].version;
    const screensVersion = packageLock.packages["node_modules/react-native-screens"].version;
    expect(reactNativeVersion).toBe("0.81.5");
    expect(screensVersion).toBe("4.16.0");
    expect(packageJson.dependencies["react-native-screens"]).toBe("~4.16.0");

    const contentWrapper = readFileSync(
      resolve(repositoryRoot, "node_modules/react-native-screens/ios/RNSScreenContentWrapper.mm"),
      "utf8"
    );
    expect(contentWrapper).toContain("findFirstScreenViewAncestor");
    expect(contentWrapper).toContain("currentView = currentView.reactSuperview");
    expect(contentWrapper).toMatch(
      /#ifdef RCT_NEW_ARCH_ENABLED\s+RCTLogWarn\(@"Failed to find parent screen controller/
    );
  });

  it("uses Expo Router's guarded internal splash startup path instead of a local splash patch", () => {
    const routerSplash = readFileSync(
      resolve(repositoryRoot, "node_modules/expo-router/build/utils/splash.js"),
      "utf8"
    );
    const internalStart = routerSplash.indexOf("async function _internal_preventAutoHideAsync()");
    const internalEnd = routerSplash.indexOf("async function _internal_maybeHideAsync()", internalStart);
    const internalStartup = routerSplash.slice(internalStart, internalEnd);

    expect(internalStart).toBeGreaterThan(-1);
    expect(internalEnd).toBeGreaterThan(internalStart);
    expect(routerSplash).toContain("requireOptionalNativeModule)('ExpoSplashScreen')");
    expect(internalStartup).toContain("if (!SplashModule ||");
    expect(internalStartup).toContain("!SplashModule.internalPreventAutoHideAsync");
    expect(internalStartup).toContain("SplashModule.internalPreventAutoHideAsync()");
    expect(internalStartup).not.toContain("SplashModule.preventAutoHideAsync()");
    expect(existsSync(resolve(repositoryRoot, "patches/expo-splash-screen+0.27.7.patch"))).toBe(false);
  });

  it("keeps Expo's React pin and does not install an affected server-component package", () => {
    expect(packageLock.packages["node_modules/react"].version).toBe("19.1.0");
    expect(packageLock.packages["node_modules/react-dom"].version).toBe("19.1.0");
    expect(packageJson.overrides["react-server-dom-webpack"]).toBe(undefined);
    expect(packageLock.packages["node_modules/react-server-dom-webpack"]).toBe(undefined);
    expect(packageLock.packages["node_modules/react-server-dom-parcel"]).toBe(undefined);
    expect(packageLock.packages["node_modules/react-server-dom-turbopack"]).toBe(undefined);
    expect(packageLock.packages["node_modules/expo-router"].version).toBe("6.0.24");
    expect(packageLock.packages["node_modules/jest-expo"].version).toBe("54.0.18");
  });

  it("recovers a delayed Expo dev-menu first run before asserting the auth screen", () => {
    const bootstrap = readFileSync(
      resolve(repositoryRoot, ".maestro/subflows/bootstrap.yaml"),
      "utf8"
    );
    const rootRouteReset = bootstrap.lastIndexOf('link: "praxisshield:///"');
    const scrollRecovery = bootstrap.lastIndexOf("- repeat:");
    const continueRecovery = bootstrap.lastIndexOf("visible: Continue");
    const reloadRecovery = bootstrap.lastIndexOf("visible: Reload");
    const finalAuthAssertion = bootstrap.lastIndexOf("- extendedWaitUntil:");

    expect(rootRouteReset).toBeGreaterThan(-1);
    expect(scrollRecovery).toBeGreaterThan(rootRouteReset);
    expect(continueRecovery).toBeGreaterThan(scrollRecovery);
    expect(reloadRecovery).toBeGreaterThan(continueRecovery);
    expect(finalAuthAssertion).toBeGreaterThan(reloadRecovery);
    expect(bootstrap.slice(continueRecovery, finalAuthAssertion)).toContain('point: "94%,7%"');
  });

  it("keeps SDK-54 auth smokes independent of iOS keyboard submit behavior", () => {
    const registration = readFileSync(
      resolve(repositoryRoot, ".maestro/flows/01-registration.yaml"),
      "utf8"
    );
    const login = readFileSync(
      resolve(repositoryRoot, ".maestro/subflows/login.yaml"),
      "utf8"
    );
    const onboardingLogin = readFileSync(
      resolve(repositoryRoot, ".maestro/subflows/login-to-onboarding.yaml"),
      "utf8"
    );

    expect(registration).toMatch(/- hideKeyboard\s+- tapOn:\s+id: auth-submit/);
    for (const flow of [login, onboardingLogin]) {
      expect(flow).toContain("- pressKey: Enter");
      expect(flow).toMatch(/visible:\s+id: auth-submit\s+commands:\s+- tapOn:\s+id: auth-submit/);
    }
  });

  it("tracks every architecture-sensitive dependency exactly once", () => {
    const groups = baseline.architectureSensitivePackages as Record<string, string[]>;
    const tracked = Object.values(groups).flat();
    expect(new Set(tracked).size).toBe(tracked.length);

    const expected = Object.keys(packageJson.dependencies).filter((name) =>
      name === "react" ||
      name === "react-dom" ||
      name === "moti" ||
      name === "lucide-react-native" ||
      name.startsWith("expo") ||
      name.startsWith("@expo/") ||
      name.startsWith("react-native") ||
      name.startsWith("@react-native") ||
      name.startsWith("@react-navigation/")
    );
    expect([...tracked].sort()).toEqual(expected.sort());
  });

  it("uses an incremental, architecture-isolating path to the current target SDK", () => {
    const stages = baseline.migration.stages;
    expect(stages.map((stage) => stage.id)).toEqual([
      "sdk52",
      "sdk53",
      "sdk54_legacy",
      "sdk54_new_arch",
      "sdk55",
      "sdk56",
      "sdk57"
    ]);
    expect(stages.find((stage) => stage.id === "sdk54_legacy")?.newArchitecture).toBe("explicitly_disabled");
    expect(stages.find((stage) => stage.id === "sdk54_new_arch")?.newArchitecture).toBe("enabled");
    expect(stages.find((stage) => stage.id === "sdk55")?.newArchitecture).toBe("required");
    expect(stages.find((stage) => stage.id === "sdk56")?.purpose).toContain("no production release");
    expect(baseline.migration.recommendedFinalSdk).toBe("57");
  });

  it("keeps all native config plugins and local-cleartext behavior explicit", () => {
    const configuredPlugins = appConfig.plugins.map((plugin: string | [string, unknown]) =>
      typeof plugin === "string" ? plugin : plugin[0]
    );
    expect(baseline.configPlugins).toEqual(configuredPlugins);
    expect(configuredPlugins).toContain("expo-font");
    expect(existsSync(resolve(repositoryRoot, "app.config.js"))).toBe(false);
    expect(appConfig.android.usesCleartextTraffic).toBe(undefined);

    for (const plugin of configuredPlugins.filter((name: string) => name.startsWith("./"))) {
      expect(existsSync(resolve(repositoryRoot, `${plugin}.js`))).toBe(true);
    }
  });

  it("binds every migration risk to installed packages and a non-empty decision state", () => {
    const ids = new Set<string>();
    for (const risk of baseline.riskRegister) {
      expect(ids.has(risk.id)).toBe(false);
      ids.add(risk.id);
      expect(["medium", "high", "critical"]).toContain(risk.severity);
      expect(risk.status).toMatch(/^[a-z0-9_]+$/);
      expect(risk.reason.length).toBeGreaterThan(30);
      for (const packageName of risk.packages) {
        expect(baseline.directDependencies[packageName]).toBeDefined();
      }
    }
    expect(ids).toEqual(new Set([
      "reanimated_legacy_architecture_pin",
      "custom_network_probe_bridge",
      "wifi_collection",
      "encrypted_local_state",
      "file_and_pdf_lifecycle",
      "router_navigation_split",
      "animation_runtime",
      "icon_migration",
      "minimum_platform_bump"
    ]));
  });

  it("keeps every golden security contract attached to executable tests", () => {
    const contractIds = new Set<string>();
    for (const contract of baseline.criticalContracts) {
      expect(contractIds.has(contract.id)).toBe(false);
      contractIds.add(contract.id);
      expect(contract.platforms.length).toBeGreaterThan(0);
      expect(contract.tests.length).toBeGreaterThan(0);
      for (const testPath of contract.tests) {
        expect(existsSync(resolve(repositoryRoot, testPath))).toBe(true);
      }
    }
    expect(contractIds.size).toBe(5);
    expect(baseline.goldenCommands).toContain("npm run verify");
    expect(baseline.goldenCommands).toContain("npx expo prebuild --clean --no-install");
    expect(baseline.goldenCommands.some((command: string) => command.includes("assembleRelease"))).toBe(true);
    expect(baseline.goldenCommands.some((command: string) => command.startsWith("xcodebuild"))).toBe(true);
  });

  it("documents the single accepted Doctor deviation without suppressing directory checks", () => {
    expect(baseline.current.expoDoctor).toEqual({
      version: "1.20.2",
      passed: 17,
      total: 18,
      reactNativeDirectory: "passed",
      expectedOpenFinding: "react-native-reanimated 3.19.5 is intentionally pinned for the SDK 54 Legacy Architecture; Expo expects 4.1.1 for New Architecture projects"
    });
    expect(baseline.sources.length).toBeGreaterThanOrEqual(7);
    for (const source of baseline.sources) {
      expect(source).toMatch(
        /^https:\/\/(docs\.expo\.dev|expo\.dev|reactnative\.dev|docs\.swmansion\.com)\//
      );
    }
  });
});
