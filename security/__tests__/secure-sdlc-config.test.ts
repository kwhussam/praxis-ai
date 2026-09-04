declare const __dirname: string;
export {};

const { execFileSync } = require("child_process") as {
  execFileSync(file: string, args: string[], options: Record<string, unknown>): string;
};
const { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } = require("fs") as {
  existsSync(path: string): boolean;
  mkdtempSync(prefix: string): string;
  mkdirSync(path: string, options: { recursive: boolean }): void;
  readdirSync(path: string): string[];
  readFileSync(path: string, encoding: "utf8"): string;
  rmSync(path: string, options: { recursive: boolean; force: boolean }): void;
  writeFileSync(path: string, contents: string, encoding: "utf8"): void;
};
const { tmpdir } = require("os") as { tmpdir(): string };
const { join, resolve } = require("path") as { join(...parts: string[]): string; resolve(...parts: string[]): string };

const repositoryRoot = resolve(__dirname, "../..");
const workflowsDir = join(repositoryRoot, ".github/workflows");
const sarifGate = join(repositoryRoot, "scripts/gate-sarif.mjs");
const dependencyGate = join(repositoryRoot, "scripts/gate-dependencies.mjs");
const dependencyAllowlistPath = join(repositoryRoot, "security/dependency-allowlist.json");
const vendorHardening = join(repositoryRoot, "scripts/apply-vendor-hardening.mjs");
const doctorGate = join(repositoryRoot, "scripts/gate-expo-doctor.mjs");
const actionInventoryPath = join(repositoryRoot, "security/github-action-inventory.json");
const actionInventory = JSON.parse(readFileSync(actionInventoryPath, "utf8")) as {
  schemaVersion: number;
  reviewedAt: string;
  minimumRunnerVersion: string;
  actions: Record<string, {
    sha: string;
    release: string;
    runtime: "node24" | "composite";
    source: string;
  }>;
};
const dependencyGateFailureCases: Array<[
  string,
  (allowlist: ReturnType<typeof dependencyAllowlist>) => void
]> = [
  ["unknown advisory", (allowlist) => { allowlist.exceptions = []; }],
  ["expired exception", (allowlist) => { allowlist.exceptions[0].expiresAt = "2020-01-02"; }],
  ["metadata drift", (allowlist) => { allowlist.exceptions[0].affectedRange = "<1.0.0"; }],
  ["installed version drift", (allowlist) => { allowlist.exceptions[0].observedVersions = ["8.4.48"]; }],
  ["runtime scope", (allowlist) => { allowlist.exceptions[0].scope = "runtime"; }]
];

describe("SP3-01 secure SDLC configuration", () => {
  it("pins every third-party GitHub Action to an immutable commit SHA", () => {
    const workflows = readdirSync(workflowsDir).filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"));
    const unpinned: string[] = [];

    for (const workflow of workflows) {
      const lines = readFileSync(join(workflowsDir, workflow), "utf8").split("\n");
      lines.forEach((line, index) => {
        const action = line.match(/^\s*-?\s*uses:\s*([^\s#]+)/)?.[1];
        if (action && !action.startsWith("./") && !/@[0-9a-f]{40}$/i.test(action)) {
          unpinned.push(`${workflow}:${index + 1}:${action}`);
        }
      });
    }

    expect(unpinned).toEqual([]);
  });

  it("allows only fully inventoried Actions at their reviewed release and runtime", () => {
    const workflows = readdirSync(workflowsDir).filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"));
    const seen = new Set<string>();
    const unknown: string[] = [];

    for (const workflow of workflows) {
      const lines = readFileSync(join(workflowsDir, workflow), "utf8").split("\n");
      lines.forEach((line, index) => {
        const action = line.match(/^\s*-?\s*uses:\s*([^\s#]+)/)?.[1];
        if (!action || action.startsWith("./")) return;

        const separator = action.lastIndexOf("@");
        const name = action.slice(0, separator);
        const ref = action.slice(separator + 1);
        const expected = actionInventory.actions[name];
        if (!expected) {
          unknown.push(`${workflow}:${index + 1}:${name}`);
          return;
        }

        seen.add(name);
        expect(ref).toBe(expected.sha);
        expect(line).toContain(`# ${expected.release}`);
      });
    }

    expect(unknown).toEqual([]);
    expect([...seen].sort()).toEqual(Object.keys(actionInventory.actions).sort());
  });

  it("documents every JavaScript Action as Node 24 and every non-JS Action as composite", () => {
    expect(actionInventory.schemaVersion).toBe(1);
    expect(actionInventory.reviewedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(actionInventory.minimumRunnerVersion).toBe("2.327.1");

    for (const [name, action] of Object.entries(actionInventory.actions)) {
      expect(["node24", "composite"]).toContain(action.runtime);
      expect(action.sha).toMatch(/^[0-9a-f]{40}$/);
      const repository = name.split("/").slice(0, 2).join("/");
      expect(action.source).toBe(`https://github.com/${repository}/releases/tag/${action.release}`);
    }

    const compositeActions = Object.entries(actionInventory.actions)
      .filter(([, action]) => action.runtime === "composite")
      .map(([name]) => name);
    expect(compositeActions).toEqual(["supabase/setup-cli"]);
  });

  it("keeps high/critical dependency, SBOM and SAST gates fail-closed", () => {
    const workflow = readFileSync(join(workflowsDir, "security.yml"), "utf8");
    const packageJson = JSON.parse(readFileSync(join(repositoryRoot, "package.json"), "utf8"));
    expect(packageJson.scripts["security:dependencies"]).toBe("node scripts/gate-dependencies.mjs");
    expect(workflow).toContain("npm run security:dependencies");
    expect(workflow).toContain("fail-on-severity: high");
    expect(workflow).toContain("queries: security-extended");
    expect(workflow).toContain("security:sarif:gate");
    expect(workflow).toContain("if-no-files-found: error");
  });

  it("documents that the controlled dependency maintenance closed every active exception", () => {
    const allowlist = JSON.parse(readFileSync(dependencyAllowlistPath, "utf8")) as {
      policy: {
        decision: string;
        remediationPlan: string;
        nextStage: string;
        targetDate: string;
        hardExpiry: string;
      };
      exceptions: Array<{ expiresAt: string }>;
    };
    const packageLock = JSON.parse(readFileSync(join(repositoryRoot, "package-lock.json"), "utf8")) as {
      packages: Record<string, unknown>;
    };

    expect(allowlist.policy.decision).toContain("No active High/Critical dependency exceptions");
    expect(allowlist.policy.remediationPlan).toBe("docs/SP3_01B_SUPPLY_CHAIN_UPGRADE_PLAN.md");
    expect(allowlist.policy.nextStage).toBe("production_device_gates");
    expect(allowlist.policy.targetDate).toBe("2026-09-07");
    expect(allowlist.policy.hardExpiry).toBe("2026-09-13");
    expect(existsSync(resolve(repositoryRoot, allowlist.policy.remediationPlan))).toBe(true);
    expect(allowlist.exceptions).toEqual([]);
    // React Native 0.85 reinstates @react-native/metro-config as a real dependency of
    // react-native-worklets and @react-native/community-cli-plugin, so its absence is no
    // longer a usable proxy. Metro 0.84 dropped image-size entirely, so assert the actual
    // security property directly and at every nesting level instead of at the root only.
    const imageSizeInstallations = Object.keys(packageLock.packages).filter(
      (packagePath) =>
        packagePath === "node_modules/image-size" ||
        packagePath.endsWith("/node_modules/image-size")
    );
    expect(imageSizeInstallations).toEqual([]);
    expect(allowlist.exceptions.every(({ expiresAt }) => expiresAt === allowlist.policy.hardExpiry)).toBe(true);
    expect(allowlist.policy.targetDate < allowlist.policy.hardExpiry).toBe(true);
  });

  it("runs feature-branch CI once through the pull-request event", () => {
    const workflow = readFileSync(join(workflowsDir, "ci.yml"), "utf8");

    expect(workflow).not.toContain("on: [push, pull_request]");
    expect(workflow).toContain("push:\n    branches: [main]");
    expect(workflow).toContain("pull_request:\n    branches: [main]");
  });

  it("keeps the xmldom override compatible with every SDK 57 plist installation", () => {
    const packageJson = JSON.parse(readFileSync(join(repositoryRoot, "package.json"), "utf8"));
    const packageLock = JSON.parse(readFileSync(join(repositoryRoot, "package-lock.json"), "utf8"));
    const installedPlists = Object.entries(packageLock.packages)
      .filter(([packagePath]) =>
        packagePath === "node_modules/@expo/plist" || packagePath.endsWith("/node_modules/@expo/plist")
      ) as Array<[string, { version: string }]>;

    expect(packageJson.overrides["@xmldom/xmldom"]).toBe("^0.9.11");
    // The security property is the floor, not one exact patch: @expo/plist still declares the
    // unpatched ^0.8.8 line, so the override must keep the resolution on 0.9 at >= 0.9.11.
    // Dropping the override would resolve back to 0.8.x and fail here; lowering the floor would
    // fail too. Pinning the resolved patch instead would contradict the caret range.
    const xmldomVersion = packageLock.packages["node_modules/@xmldom/xmldom"].version as string;
    const [xmldomMajor, xmldomMinor, xmldomPatch] = xmldomVersion.split(".").map(Number);
    expect([xmldomMajor, xmldomMinor]).toEqual([0, 9]);
    expect(xmldomPatch).toBeGreaterThanOrEqual(11);
    expect(packageJson.scripts.postinstall).toBe("node scripts/apply-vendor-hardening.mjs");
    expect(packageJson.devDependencies["patch-package"]).toBe(undefined);
    // SDK 57 installs @expo/plist once per consumer rather than relying on root hoisting.
    // Every single installation must carry the hardening, because the override
    // forces xmldom 0.9 while @expo/plist itself still declares the ^0.8.8 API.
    expect(installedPlists.length).toBeGreaterThan(0);
    for (const [packagePath, metadata] of installedPlists) {
      expect(metadata.version).toBe("0.8.1");
      expect(readFileSync(join(repositoryRoot, packagePath, "build/parse.js"), "utf8"))
        .toContain('parseFromString(xml.trimStart(), "text/xml")');
    }

    // The unpatched upstream call throws under xmldom 0.9, so a working parse proves the
    // hardening is actually in effect rather than merely present as a string.
    const expoPlist = require(
      join(repositoryRoot, installedPlists[0][0])
    ) as { default: { parse(xml: string): unknown } };
    expect(expoPlist.default.parse(`
      <?xml version="1.0" encoding="UTF-8"?>
      <plist version="1.0"><dict/></plist>
    `)).toEqual({});
  });

  it("keeps every SDK 57 Android permission lookup fail-closed", () => {
    const packageLock = JSON.parse(readFileSync(join(repositoryRoot, "package-lock.json"), "utf8"));
    const corePaths = Object.entries(packageLock.packages)
      .filter(([packagePath]) =>
        packagePath === "node_modules/expo-modules-core" ||
        packagePath.endsWith("/node_modules/expo-modules-core")
      ) as Array<[string, { version: string }]>;

    expect(existsSync(vendorHardening)).toBe(true);
    expect(corePaths).toHaveLength(1);
    expect(corePaths[0][1].version).toBe("57.0.16");
    const installedSource = readFileSync(join(
      repositoryRoot,
      corePaths[0][0],
      "android/src/main/java/expo/modules/adapters/react/permissions/PermissionsService.kt"
    ), "utf8");
    expect(installedSource).toContain("requestedPermissions?.contains(permission) == true");
    expect(installedSource).not.toContain("requestedPermissions!!.contains(permission)");
    expect(execFileSync("node", [vendorHardening], { encoding: "utf8", cwd: repositoryRoot }))
      .toContain("Vendor hardening verified");
  });

  it("runs Expo Doctor for real and blocks every undocumented finding", () => {
    const baseline = JSON.parse(
      readFileSync(join(repositoryRoot, "security/mobile-upgrade-baseline.json"), "utf8")
    ) as { current: { expoDoctor: { version: string; passed: number; total: number; expectedFailedChecks: string[] } } };
    const doctor = baseline.current.expoDoctor;
    const packageJson = JSON.parse(readFileSync(join(repositoryRoot, "package.json"), "utf8"));
    const ci = readFileSync(join(workflowsDir, "ci.yml"), "utf8");

    // The gate must exist, be pinned through the baseline, and actually run in CI before the
    // test suite. Recording a Doctor result without executing it proves nothing.
    expect(existsSync(doctorGate)).toBe(true);
    expect(packageJson.scripts["security:expo-doctor"]).toBe("node scripts/gate-expo-doctor.mjs");
    expect(ci).toContain("npm run security:expo-doctor");
    // Compare against the exact "Verify" step, not the substring: "npm run verify:native-config"
    // also contains "npm run verify" and would make this ordering check pass for the wrong reason.
    const verifyStep = ci.indexOf("run: npm run verify\n");
    expect(verifyStep).toBeGreaterThan(-1);
    expect(ci.indexOf("run: npm run security:expo-doctor")).toBeLessThan(verifyStep);
    expect(doctor.version).toMatch(/^\d+\.\d+\.\d+$/);
    // SDK 57 closed the Hermes V1 regression: React Native 0.86.3 ships hermes-compiler
    // 250829098.0.17, past the 250829098.0.16 fix, and Doctor reports a clean run. There is
    // therefore no documented exception left, and every finding is now undocumented.
    expect(doctor.expectedFailedChecks).toEqual([]);
    expect(doctor.passed).toBe(doctor.total);

    const fixtureRoot = mkdtempSync(join(tmpdir(), "praxisshield-doctor-gate-"));
    try {
      const write = (name: string, contents: string) => {
        const path = join(fixtureRoot, name);
        writeFileSync(path, contents, "utf8");
        return path;
      };
      const run = (path: string) =>
        execFileSync("node", [doctorGate, "--report-file", path], {
          encoding: "utf8",
          cwd: repositoryRoot
        });

      const clean = write("clean.txt",
        `Running ${doctor.total} checks on your project...\n` +
        `${doctor.total}/${doctor.total} checks passed. No issues detected!\n`);
      expect(run(clean)).toContain("Expo Doctor gate passed");

      // The Hermes V1 regression coming back must block. This is the specific reason the SDK 56
      // exception existed; once removed from the baseline it can never pass again unnoticed.
      const hermesAgain = write("hermes-again.txt",
        `Running ${doctor.total} checks on your project...\n` +
        `${doctor.total - 1}/${doctor.total} checks passed. 1 checks failed.\n\n` +
        "\u2716 Check for Expo SDK versions affected by Hermes V1 regressions\n");
      expect(() => run(hermesAgain)).toThrow();

      // Any other new finding must block just the same.
      const otherRegression = write("regression.txt",
        `Running ${doctor.total} checks on your project...\n` +
        `${doctor.total - 1}/${doctor.total} checks passed. 1 checks failed.\n\n` +
        "\u2716 Check that packages match versions required by installed Expo SDK\n");
      expect(() => run(otherRegression)).toThrow();

      // A changed check count means Doctor itself moved; re-review instead of silent drift.
      const countDrift = write("count-drift.txt",
        `Running ${doctor.total + 1} checks on your project...\n` +
        `${doctor.total + 1}/${doctor.total + 1} checks passed. No issues detected!\n`);
      expect(() => run(countDrift)).toThrow();

      // Unparsable output means Doctor did not really report; never treat that as success.
      expect(() => run(write("broken.txt", "Doctor crashed\n"))).toThrow();
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it("accepts only exact, active build-toolchain dependency exceptions", () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), "praxisshield-dependency-gate-"));
    try {
      const auditPath = join(fixtureRoot, "audit.json");
      const allowlistPath = join(fixtureRoot, "allowlist.json");
      writeFileSync(auditPath, JSON.stringify(dependencyAudit()), "utf8");
      writeFileSync(allowlistPath, JSON.stringify(dependencyAllowlist(daysFromNow(7))), "utf8");

      expect(execFileSync("node", [dependencyGate, "--audit-file", auditPath, "--allowlist", allowlistPath], {
        encoding: "utf8"
      })).toContain("1 temporary build-toolchain exceptions accepted");
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it("fails closed for unknown, expired, changed or runtime exceptions", () => {
    for (const [, mutate] of dependencyGateFailureCases) {
      const fixtureRoot = mkdtempSync(join(tmpdir(), "praxisshield-dependency-gate-"));
      try {
        const auditPath = join(fixtureRoot, "audit.json");
        const allowlistPath = join(fixtureRoot, "allowlist.json");
        const allowlist = dependencyAllowlist(daysFromNow(7));
        mutate(allowlist);
        writeFileSync(auditPath, JSON.stringify(dependencyAudit()), "utf8");
        writeFileSync(allowlistPath, JSON.stringify(allowlist), "utf8");

        expect(() => execFileSync("node", [dependencyGate, "--audit-file", auditPath, "--allowlist", allowlistPath], {
          encoding: "utf8",
          stdio: "pipe"
        })).toThrow();
      } finally {
        rmSync(fixtureRoot, { recursive: true, force: true });
      }
    }
  });

  it("fails closed when a stale exception remains after an advisory is fixed", () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), "praxisshield-dependency-gate-"));
    try {
      const auditPath = join(fixtureRoot, "audit.json");
      const allowlistPath = join(fixtureRoot, "allowlist.json");
      const audit = dependencyAudit();
      audit.vulnerabilities = {};
      writeFileSync(auditPath, JSON.stringify(audit), "utf8");
      writeFileSync(allowlistPath, JSON.stringify(dependencyAllowlist(daysFromNow(7))), "utf8");

      expect(() => execFileSync("node", [dependencyGate, "--audit-file", auditPath, "--allowlist", allowlistPath], {
        encoding: "utf8",
        stdio: "pipe"
      })).toThrow();
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it("requires protected signing identities, manifests and attestations for both mobile platforms", () => {
    const android = readFileSync(join(workflowsDir, "release-android.yml"), "utf8");
    const ios = readFileSync(join(workflowsDir, "release-ios.yml"), "utf8");

    expect(android).toContain("environment: production-android");
    expect(android).toContain("ANDROID_SIGNING_CERT_SHA256");
    expect(android).toContain("PRODUCTION_API_BASE_URL");
    expect(android).toContain("verify-android-release-signature.mjs");
    expect(android).toContain("verify-release-ref.mjs");
    expect(android).toContain("git merge-base --is-ancestor");
    expect(android).toContain("create-release-manifest.mjs");
    expect(android).toContain("actions/attest@");

    expect(ios).toContain("environment: production-ios");
    expect(ios).toContain("APPLE_SIGNING_CERT_SHA256");
    expect(ios).toContain("PRODUCTION_API_BASE_URL");
    expect(ios).toContain("PROFILE_APP_ID");
    expect(ios).toContain("verify-ios-release-signature.mjs");
    expect(ios).toContain("verify-release-ref.mjs");
    expect(ios).toContain("git merge-base --is-ancestor");
    expect(ios).toContain("create-release-manifest.mjs");
    expect(ios).toContain("actions/attest@");
  });

  it("blocks high SARIF but accepts medium-severity results", () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), "praxisshield-sarif-"));
    try {
      mkdirSync(fixtureRoot, { recursive: true });
      const sarifPath = join(fixtureRoot, "results.sarif");
      writeFileSync(sarifPath, sarif("6.9"), "utf8");
      expect(execFileSync("node", [sarifGate, fixtureRoot], { encoding: "utf8" })).toContain("SAST gate passed");

      writeFileSync(sarifPath, sarif("7.0"), "utf8");
      expect(() => execFileSync("node", [sarifGate, fixtureRoot], { encoding: "utf8", stdio: "pipe" })).toThrow();
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });
});

function sarif(securitySeverity: string) {
  return JSON.stringify({
    version: "2.1.0",
    runs: [{
      tool: { driver: { name: "fixture", rules: [{ id: "fixture-rule", properties: { "security-severity": securitySeverity } }] } },
      results: [{ ruleId: "fixture-rule", level: "warning", message: { text: "fixture finding" } }]
    }]
  });
}

function dependencyAudit(): {
  auditReportVersion: number;
  vulnerabilities: Record<string, unknown>;
  metadata: { vulnerabilities: { high: number; critical: number; total: number } };
} {
  return {
    auditReportVersion: 2,
    vulnerabilities: {
      postcss: {
        severity: "high",
        via: [{
          name: "postcss",
          severity: "high",
          url: "https://github.com/advisories/GHSA-2345-6789-cfgh",
          range: "<2.0.0"
        }]
      }
    },
    metadata: { vulnerabilities: { high: 1, critical: 0, total: 1 } }
  };
}

// The dependency gate compares an allowlist entry against the versions actually installed, so
// the fixture has to name the real postcss version. Hardcoding it turned into a maintenance trap
// that broke on every lockfile refresh; deriving it keeps the fixture truthful while the gate
// logic under test stays untouched.
function installedPostcssVersion(): string {
  const lock = JSON.parse(readFileSync(join(repositoryRoot, "package-lock.json"), "utf8")) as {
    packages: Record<string, { version?: string }>;
  };
  const version = Object.entries(lock.packages)
    .filter(([path]) => path === "node_modules/postcss" || path.endsWith("/node_modules/postcss"))
    .map(([, value]) => value.version)
    .find((value): value is string => typeof value === "string");
  if (!version) throw new Error("postcss is not installed; the dependency-gate fixture needs it");
  return version;
}

function dependencyAllowlist(expiresAt: string) {
  return {
    schemaVersion: 1,
    exceptions: [{
      id: "GHSA-2345-6789-cfgh",
      package: "postcss",
      severity: "high",
      url: "https://github.com/advisories/GHSA-2345-6789-cfgh",
      affectedRange: "<2.0.0",
      scope: "build-toolchain",
      observedVersions: [installedPostcssVersion()],
      dependencyPaths: ["builder > postcss"],
      owner: "Security Owner",
      reason: "A sufficiently detailed fixture reason for a temporary toolchain exception.",
      mitigation: "A sufficiently detailed fixture mitigation that limits build-time exposure.",
      remediation: "A sufficiently detailed fixture remediation requiring the dependency upgrade.",
      reviewedAt: daysFromNow(0),
      expiresAt
    }]
  };
}

function daysFromNow(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
