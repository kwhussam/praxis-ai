declare const __dirname: string;
export {};

const fs = require("fs") as {
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

const gate = path.resolve(__dirname, "../../scripts/e2e/assert-maestro-results.mjs");

function runReport(xml?: string) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "praxis-maestro-gate-"));
  const report = path.join(directory, "results.xml");
  if (xml !== undefined) fs.writeFileSync(report, xml);
  const result = childProcess.spawnSync(nodeProcess.execPath, [gate, report], { encoding: "utf8" });
  fs.rmSync(directory, { recursive: true, force: true });
  return result;
}

function runReports(xmlDocuments: string[]) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "praxis-maestro-gate-multi-"));
  const reports = xmlDocuments.map((xml, index) => {
    const report = path.join(directory, `results-${index}.xml`);
    fs.writeFileSync(report, xml);
    return report;
  });
  const result = childProcess.spawnSync(nodeProcess.execPath, [gate, ...reports], { encoding: "utf8" });
  fs.rmSync(directory, { recursive: true, force: true });
  return result;
}

function junit({ tests, failures, body }: { tests: number; failures: number; body: string }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<testsuites><testsuite name="Maestro" tests="${tests}" failures="${failures}" errors="0">${body}</testsuite></testsuites>`;
}

describe("Maestro JUnit smoke gate", () => {
  it("accepts a complete successful report", () => {
    const result = runReport(junit({ tests: 1, failures: 0, body: '<testcase name="login"/>' }));
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("1 flows, 0 failures");
  });

  it("rejects a report containing a failed flow", () => {
    const result = runReport(junit({
      tests: 1,
      failures: 1,
      body: '<testcase name="registration"><failure message="failed"/></testcase>'
    }));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("1 of 1 flows did not pass");
    expect(result.stderr).toContain("registration");
  });

  it("aggregates every serial flow report before deciding the smoke result", () => {
    const result = runReports([
      junit({ tests: 1, failures: 0, body: '<testcase name="login"/>' }),
      junit({
        tests: 1,
        failures: 1,
        body: '<testcase name="questionnaire"><failure message="failed"/></testcase>'
      })
    ]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("1 of 2 flows did not pass");
    expect(result.stderr).toContain("questionnaire");
  });

  const invalidReports: Array<[string, string | undefined, string]> = [
    ["missing report", undefined, "wrote no JUnit report"],
    ["zero-test report", junit({ tests: 0, failures: 0, body: "" }), "executed 0 flows"],
    ["truncated report", '<?xml version="1.0"?><testsuites><testsuite tests="1" failures="0"><testcase name="x"/>', "not a complete"],
    ["counter mismatch", junit({ tests: 2, failures: 0, body: '<testcase name="x"/>' }), "counters are inconsistent"],
    ["missing counter", '<?xml version="1.0"?><testsuites><testsuite tests="1"><testcase name="x"/></testsuite></testsuites>', "missing the failures"]
  ];

  for (const [label, xml, message] of invalidReports) {
    it(`fails closed for a ${label}`, () => {
      const result = runReport(xml);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(message);
    });
  }
});
