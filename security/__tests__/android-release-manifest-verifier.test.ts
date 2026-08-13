declare const __dirname: string;
declare const beforeEach: (callback: () => void) => void;
export {};

const { execFileSync } = require("child_process") as {
  execFileSync(file: string, args: string[], options: Record<string, unknown>): string;
};
const { mkdtempSync, mkdirSync, rmSync, writeFileSync } = require("fs") as {
  mkdtempSync(prefix: string): string;
  mkdirSync(path: string, options: { recursive: boolean }): void;
  rmSync(path: string, options: { recursive: boolean; force: boolean }): void;
  writeFileSync(path: string, contents: string, encoding: "utf8"): void;
};
const { tmpdir } = require("os") as { tmpdir(): string };
const { join, resolve } = require("path") as {
  join(...parts: string[]): string;
  resolve(...parts: string[]): string;
};

const verifier = resolve(__dirname, "../../scripts/verify-android-release-manifest.mjs");
const safeManifest = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <application android:allowBackup="false" android:usesCleartextTraffic="false"/>
</manifest>`;

describe("Android merged release manifest verifier", () => {
  let fixtureRoot = "";

  beforeEach(() => {
    fixtureRoot = mkdtempSync(join(tmpdir(), "praxisshield-manifests-"));
  });

  afterEach(() => {
    rmSync(fixtureRoot, { recursive: true, force: true });
  });

  it("checks every release flavor instead of selecting one path", () => {
    const free = manifestPath("freeRelease", "processFreeReleaseMainManifest");
    const paid = manifestPath("paidRelease", "processPaidReleaseMainManifest");
    writeManifest(free, safeManifest);
    writeManifest(paid, safeManifest.replace("</manifest>", '<uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW"/></manifest>'));

    let errorOutput = "";
    try {
      execFileSync("node", [verifier], { cwd: fixtureRoot, encoding: "utf8", stdio: "pipe" });
    } catch (error) {
      errorOutput = String((error as { stderr?: string }).stderr ?? error);
    }
    expect(errorOutput).toContain("paidRelease");

    writeManifest(paid, safeManifest);
    const output = execFileSync("node", [verifier], { cwd: fixtureRoot, encoding: "utf8" });
    expect(output).toContain("Verified 2 merged Android release manifest(s)");
    expect(output).toContain("freeRelease");
    expect(output).toContain("paidRelease");
  });

  function manifestPath(variant: string, task: string) {
    return join(fixtureRoot, "android/app/build/intermediates/merged_manifest", variant, task, "AndroidManifest.xml");
  }

  function writeManifest(path: string, contents: string) {
    mkdirSync(resolve(path, ".."), { recursive: true });
    writeFileSync(path, contents, "utf8");
  }
});
