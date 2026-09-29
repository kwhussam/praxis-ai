declare const __dirname: string;
export {};

const fs = require("fs") as {
  mkdirSync(path: string): void;
  mkdtempSync(prefix: string): string;
  rmSync(path: string, options: { recursive: boolean; force: boolean }): void;
  writeFileSync(path: string, contents: string): void;
};
const os = require("os") as { tmpdir(): string };
const path = require("path") as { join(...parts: string[]): string; resolve(...parts: string[]): string };
const childProcess = require("child_process") as {
  spawnSync(command: string, args: string[], options: { encoding: "utf8" }): {
    status: number | null;
    stdout: string;
    stderr: string;
  };
};
const nodeProcess = require("process") as { execPath: string };

const repositoryRoot = path.resolve(__dirname, "../..");
const verifySources = path.join(repositoryRoot, "scripts/e2e/verify-maestro-flow-set.mjs");
const gateResults = path.join(repositoryRoot, "scripts/e2e/assert-maestro-results.mjs");
const checkedInManifest = path.join(repositoryRoot, ".maestro/phase0-flow-manifest.json");
const checkedInFlows = path.join(repositoryRoot, ".maestro/flows");

function fixture(callback: (root: string, manifest: string, flowDir: string) => void) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "praxis-flow-manifest-"));
  const flowDir = path.join(root, "flows");
  const manifest = path.join(root, "manifest.json");
  fs.mkdirSync(flowDir);
  fs.writeFileSync(manifest, JSON.stringify({
    version: 1,
    expectedCount: 2,
    flows: ["01-login", "02-questionnaire"]
  }));
  fs.writeFileSync(path.join(flowDir, "01-login.yaml"), "appId: test\nname: 01-login\n");
  fs.writeFileSync(path.join(flowDir, "02-questionnaire.yaml"), "appId: test\nname: 02-questionnaire\n");
  try {
    callback(root, manifest, flowDir);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function junit(name: string) {
  return '<?xml version="1.0"?><testsuites><testsuite tests="1" failures="0" errors="0">' +
    '<testcase name="' + name + '"/></testsuite></testsuites>';
}

describe("Phase-0 Maestro flow identity", () => {
  it("recognizes the exact checked-in 15-flow baseline", () => {
    const result = childProcess.spawnSync(
      nodeProcess.execPath, [verifySources, checkedInManifest, checkedInFlows], { encoding: "utf8" }
    );
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe("15");
  });

  it("rejects a renamed or undeclared source flow before the database reset", () => {
    fixture((_root, manifest, flowDir) => {
      fs.writeFileSync(path.join(flowDir, "02-questionnaire.yaml"), "appId: test\nname: 01-login\n");
      const result = childProcess.spawnSync(
        nodeProcess.execPath, [verifySources, manifest, flowDir], { encoding: "utf8" }
      );
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("declares a different name");
    });
  });

  it("rejects a missing or substituted flow even if the count stays constant", () => {
    fixture((_root, manifest, flowDir) => {
      fs.rmSync(path.join(flowDir, "02-questionnaire.yaml"), { recursive: false, force: false });
      fs.writeFileSync(path.join(flowDir, "02-login-again.yaml"), "appId: test\nname: 02-login-again\n");
      const result = childProcess.spawnSync(
        nodeProcess.execPath, [verifySources, manifest, flowDir], { encoding: "utf8" }
      );
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("do not match the checked-in manifest");
    });
  });

  it("rejects JUnit testcases whose names differ from their manifest flow", () => {
    fixture((root, manifest) => {
      const loginReport = path.join(root, "01-login.xml");
      const questionnaireReport = path.join(root, "02-questionnaire.xml");
      fs.writeFileSync(loginReport, junit("01-login"));
      fs.writeFileSync(questionnaireReport, junit("01-login"));
      const result = childProcess.spawnSync(nodeProcess.execPath, [
        gateResults, "--expected=2", "--manifest=" + manifest, loginReport, questionnaireReport
      ], { encoding: "utf8" });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("did not execute exactly its expected flow 02-questionnaire");
    });
  });

  it("accepts the same manifest when both JUnit identities are correct", () => {
    fixture((root, manifest) => {
      const loginReport = path.join(root, "01-login.xml");
      const questionnaireReport = path.join(root, "02-questionnaire.xml");
      fs.writeFileSync(loginReport, junit("01-login"));
      fs.writeFileSync(questionnaireReport, junit("02-questionnaire"));
      const result = childProcess.spawnSync(nodeProcess.execPath, [
        gateResults, "--expected=2", "--manifest=" + manifest, loginReport, questionnaireReport
      ], { encoding: "utf8" });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("2 flows, 0 failures");
    });
  });
});
