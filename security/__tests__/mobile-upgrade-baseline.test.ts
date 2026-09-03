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
  devDependencies: Record<string, string>;
  engines: { node: string };
  packageManager: string;
  overrides: Record<string, string>;
  scripts: Record<string, string>;
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
      expectedFailedChecks: string[];
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
      expoSdk: "56",
      expo: packageLock.packages["node_modules/expo"].version,
      reactNative: packageLock.packages["node_modules/react-native"].version,
      react: packageLock.packages["node_modules/react"].version,
      newArchitecture: "required",
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
    expect(appConfig.newArchEnabled).toBe(undefined);
    expect(packageJson.expo?.install?.exclude ?? []).toEqual([]);
  });

  it("keeps the mandatory New Architecture renderer on Expo's SDK 56 SVG line", () => {
    const reactNativeVersion = packageLock.packages["node_modules/react-native"].version;
    const svgVersion = packageLock.packages["node_modules/react-native-svg"].version;
    expect(reactNativeVersion).toBe("0.85.3");
    expect(svgVersion).toBe("15.15.4");
    expect(packageJson.dependencies["react-native-svg"]).toBe("15.15.4");
    expect(existsSync(resolve(
      repositoryRoot,
      "node_modules/react-native-svg/apple/Utils/RNSVGFabricConversions.h"
    ))).toBe(true);
  });

  it("keeps RN 0.85 on the SDK 56 screens line with the content-wrapper parent fix", () => {
    const reactNativeVersion = packageLock.packages["node_modules/react-native"].version;
    const screensVersion = packageLock.packages["node_modules/react-native-screens"].version;
    expect(reactNativeVersion).toBe("0.85.3");
    expect(screensVersion).toBe("4.26.2");
    expect(packageJson.dependencies["react-native-screens"]).toBe("~4.26.0");

    const contentWrapper = readFileSync(
      resolve(repositoryRoot, "node_modules/react-native-screens/ios/RNSScreenContentWrapper.mm"),
      "utf8"
    );
    expect(contentWrapper).toContain("findFirstScreenViewAncestor");
    expect(contentWrapper).toContain("currentView = currentView.reactSuperview");
    // screens 4.26 dropped the #ifdef RCT_NEW_ARCH_ENABLED guard because the New Architecture
    // is mandatory from SDK 55 on. The ancestor lookup and its fail-loud warning must stay:
    // without them a missing parent screen controller would be silently swallowed.
    expect(contentWrapper).toContain('RCTLogWarn(@"Failed to find parent screen controller');
    expect(contentWrapper).not.toContain("#ifdef RCT_NEW_ARCH_ENABLED");
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
    expect(packageLock.packages["node_modules/react"].version).toBe("19.2.3");
    expect(packageLock.packages["node_modules/react-dom"].version).toBe("19.2.3");
    // react-test-renderer tracks the React line exactly; a drifting renderer would test a
    // different reconciler than the app actually ships.
    expect(packageLock.packages["node_modules/react-test-renderer"].version).toBe("19.2.3");
    expect(packageJson.devDependencies["react-test-renderer"]).toBe("19.2.3");
    expect(packageJson.overrides["react-server-dom-webpack"]).toBe(undefined);
    expect(packageLock.packages["node_modules/react-server-dom-webpack"]).toBe(undefined);
    expect(packageLock.packages["node_modules/react-server-dom-parcel"]).toBe(undefined);
    expect(packageLock.packages["node_modules/react-server-dom-turbopack"]).toBe(undefined);
    expect(packageLock.packages["node_modules/expo-router"].version).toBe("56.2.20");
    expect(packageLock.packages["node_modules/jest-expo"].version).toBe("56.0.5");
    expect(packageJson.devDependencies["babel-preset-expo"]).toBe("~56.0.0");
    expect(packageLock.packages["node_modules/babel-preset-expo"].version).toBe("56.0.20");
    // SDK 56 forked React Navigation into expo-router. A direct @react-navigation dependency
    // is incompatible and must not silently return.
    expect(packageJson.dependencies["@react-navigation/native"]).toBe(undefined);
    expect(packageLock.packages["node_modules/@react-navigation/native"]).toBe(undefined);
  });

  it("recovers a delayed Expo dev-menu first run before asserting the auth screen", () => {
    const bootstrap = readFileSync(
      resolve(repositoryRoot, ".maestro/subflows/bootstrap.yaml"),
      "utf8"
    );
    const rootRouteReset = bootstrap.lastIndexOf('link: "praxisshield:///"');
    const rootConfirmation = bootstrap.indexOf('text: "Open|Öffnen"', rootRouteReset);
    const scrollRecovery = bootstrap.lastIndexOf("- repeat:");
    const continueRecovery = bootstrap.lastIndexOf("visible: Continue");
    const reloadRecovery = bootstrap.lastIndexOf("visible: Reload");
    const finalAuthAssertion = bootstrap.lastIndexOf("- extendedWaitUntil:");

    expect(rootRouteReset).toBeGreaterThan(-1);
    expect(rootConfirmation).toBeGreaterThan(rootRouteReset);
    expect(rootConfirmation).toBeLessThan(scrollRecovery);
    expect(scrollRecovery).toBeGreaterThan(rootRouteReset);
    expect(continueRecovery).toBeGreaterThan(scrollRecovery);
    expect(reloadRecovery).toBeGreaterThan(continueRecovery);
    expect(finalAuthAssertion).toBeGreaterThan(reloadRecovery);
    expect(bootstrap.slice(continueRecovery, finalAuthAssertion)).toContain('point: "94%,7%"');
  });

  it("keeps SDK-55 auth smokes independent of iOS keyboard submit behavior", () => {
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
    const invitation = readFileSync(
      resolve(repositoryRoot, ".maestro/flows/12-invitation-auth-handoff.yaml"),
      "utf8"
    );
    const pdfExport = readFileSync(
      resolve(repositoryRoot, ".maestro/flows/15-pdf-export.yaml"),
      "utf8"
    );

    expect(registration).toMatch(/- hideKeyboard\s+- tapOn:\s+id: auth-submit/);
    for (const flow of [login, onboardingLogin]) {
      expect(flow).toContain("- pressKey: Enter");
      expect(flow).toMatch(/visible:\s+id: auth-submit\s+commands:\s+- tapOn:\s+id: auth-submit/);
      expect(flow).toContain('text: "Später|Not Now"');
    }
    expect(invitation).not.toContain("- hideKeyboard");
    expect(invitation).toContain('point: "50%,35%"');
    expect(pdfExport).toContain('visible: "PraxisShield-Bericht-a2400000.*"');
    expect(pdfExport).toContain('end: "50%,92%"');
    expect(pdfExport).toContain('notVisible: "PraxisShield-Bericht-a2400000.*"');
    expect(pdfExport).toMatch(/visible:\s+id: tab-reports/);
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
      "custom_network_probe_bridge",
      "wifi_collection",
      "encrypted_local_state",
      "file_and_pdf_lifecycle",
      "router_navigation_split",
      "animation_runtime",
      "icon_migration",
      "minimum_platform_bump"
    ]));

    const nativeProbeRisk = baseline.riskRegister.find(
      (risk) => risk.id === "custom_network_probe_bridge"
    );
    expect(nativeProbeRisk?.status).toBe(
      "ios_interop_proven_android_device_proof_deferred"
    );
    expect(nativeProbeRisk?.reason).toContain("iOS simulator");
    expect(nativeProbeRisk?.reason).toContain("physical Android device gate");
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

  it("documents the SDK-56 Doctor expectation that the executable gate enforces", () => {
    // This test only checks that the expectation is written down and internally consistent.
    // It does NOT catch a Doctor regression on its own - a recorded literal always agrees with
    // itself. Enforcement lives in scripts/gate-expo-doctor.mjs, which runs the pinned Doctor
    // and blocks on any undocumented or stale finding; see the secure-sdlc-config suite.
    expect(baseline.current.expoDoctor.version).toBe("1.20.4");
    expect(baseline.current.expoDoctor.passed).toBe(21);
    expect(baseline.current.expoDoctor.total).toBe(22);
    expect(baseline.current.expoDoctor.reactNativeDirectory).toBe("passed");
    expect(baseline.current.expoDoctor.expectedFailedChecks).toEqual([
      "Check for Expo SDK versions affected by Hermes V1 regressions"
    ]);
    expect(
      baseline.current.expoDoctor.passed + baseline.current.expoDoctor.expectedFailedChecks.length
    ).toBe(baseline.current.expoDoctor.total);
    expect(baseline.goldenCommands).toContain("npm run security:expo-doctor");
    expect(baseline.current.expoDoctor.expectedOpenFinding).toContain("Hermes V1");
    expect(baseline.current.expoDoctor.expectedOpenFinding).toContain("0.86.2");
    expect(baseline.current.expoDoctor.expectedOpenFinding).toContain("not released to production");
    expect(baseline.sources.length).toBeGreaterThanOrEqual(7);
    for (const source of baseline.sources) {
      expect(source).toMatch(
        /^https:\/\/(docs\.expo\.dev|expo\.dev|reactnative\.dev|docs\.swmansion\.com)\//
      );
    }
  });

  it("keeps the New Architecture worklets contract fail-closed", () => {
    // SDK 55 requires New Architecture and removed the opt-out config field.
    expect(appConfig.newArchEnabled).toBe(undefined);
    expect(packageJson.dependencies["react-native-worklets"]).toBeDefined();
    expect(packageLock.packages["node_modules/react-native-worklets"]?.version).toBeDefined();
    // Reanimated 4 is the only line that supports the New Architecture; 3.x must not return.
    expect(packageLock.packages["node_modules/react-native-reanimated"].version).toMatch(/^4\./);

    // Reanimated 4 moved the worklet transform into react-native-worklets. Keeping the old
    // plugin still compiles, but worklets then run on the JS thread instead of the UI thread -
    // a defect neither the build nor the runtime test suite would surface.
    const babelConfig = readFileSync(resolve(repositoryRoot, "babel.config.js"), "utf8");
    expect(babelConfig).toContain("react-native-worklets/plugin");
    expect(babelConfig).not.toContain("react-native-reanimated/plugin");
  });
});
