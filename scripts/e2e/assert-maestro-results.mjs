import { existsSync, readFileSync } from "node:fs";

const reportPaths = process.argv.slice(2);
if (reportPaths.length === 0) throw new Error("Usage: assert-maestro-results.mjs <results.xml> [...]");

function counter(attributes, name) {
  const raw = attributes.match(new RegExp(`\\b${name}="(\\d+)"`))?.[1];
  if (raw === undefined) throw new Error(`<testsuite> is missing the ${name} attribute.`);
  return Number(raw);
}

function analyzeReport(reportPath) {
  if (!existsSync(reportPath)) {
    throw new Error(`Maestro wrote no JUnit report at ${reportPath}; treat the smoke as failed.`);
  }

  const report = readFileSync(reportPath, "utf8").trim();
  if (!report.startsWith("<?xml") || !report.endsWith("</testsuites>")) {
    throw new Error(`${reportPath} is not a complete Maestro JUnit document.`);
  }

  const suiteOpenings = [...report.matchAll(/<testsuite\b([^>]*)>/g)];
  const suiteClosings = [...report.matchAll(/<\/testsuite>/g)];
  if (suiteOpenings.length === 0 || suiteOpenings.length !== suiteClosings.length) {
    throw new Error(`${reportPath} contains an incomplete <testsuite> structure.`);
  }

  let tests = 0;
  let failures = 0;
  for (const [, attributes] of suiteOpenings) {
    tests += counter(attributes, "tests");
    failures += counter(attributes, "failures") + Number(attributes.match(/\berrors="(\d+)"/)?.[1] ?? 0);
  }

  const testCases = [...report.matchAll(/<testcase\b/g)].length;
  if (testCases !== tests) {
    throw new Error(`${reportPath} counters are inconsistent: tests=${tests}, testcase elements=${testCases}.`);
  }

  const failureElements = [...report.matchAll(/<(failure|error)\b/g)].length;
  if (failureElements !== failures) {
    throw new Error(`${reportPath} counters are inconsistent: failures=${failures}, failure elements=${failureElements}.`);
  }

  const failedFlows = [...report.matchAll(/<testcase\b[^>]*\bname="([^"]*)"[^>]*>([\s\S]*?)<\/testcase>/g)]
    .filter(([, , body]) => /<(failure|error)\b/.test(body))
    .map(([, name]) => name);
  return { tests, failures, failedFlows };
}

const totals = reportPaths.map(analyzeReport).reduce(
  (result, report) => ({
    tests: result.tests + report.tests,
    failures: result.failures + report.failures,
    failedFlows: [...result.failedFlows, ...report.failedFlows]
  }),
  { tests: 0, failures: 0, failedFlows: [] }
);
const { tests, failures, failedFlows } = totals;

if (tests === 0) {
  console.error("Maestro executed 0 flows. The suite did not run - check flow discovery.");
  process.exit(1);
}

if (failures > 0) {
  console.error(`Maestro smoke FAILED: ${failures} of ${tests} flows did not pass.`);
  for (const flow of failedFlows) console.error(`- ${flow}`);
  process.exit(1);
}

console.log(`Maestro smoke passed: ${tests} flows, 0 failures.`);
