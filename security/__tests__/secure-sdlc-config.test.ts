declare const __dirname: string;
export {};

const { execFileSync } = require("child_process") as {
  execFileSync(file: string, args: string[], options: Record<string, unknown>): string;
};
const { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } = require("fs") as {
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

  it("keeps high/critical dependency, SBOM and SAST gates fail-closed", () => {
    const workflow = readFileSync(join(workflowsDir, "security.yml"), "utf8");
    const packageJson = JSON.parse(readFileSync(join(repositoryRoot, "package.json"), "utf8"));
    expect(packageJson.scripts["security:dependencies"]).toBe("npm audit --audit-level=high");
    expect(workflow).toContain("npm run security:dependencies");
    expect(workflow).toContain("fail-on-severity: high");
    expect(workflow).toContain("queries: security-extended");
    expect(workflow).toContain("security:sarif:gate");
    expect(workflow).toContain("if-no-files-found: error");
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
