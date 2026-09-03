#!/usr/bin/env node

// Expo Doctor gate.
//
// Recording the expected Doctor result in security/mobile-upgrade-baseline.json only documents
// it; on its own it proves nothing, because a stale literal keeps passing while the project
// rots. This gate runs the pinned Doctor for real and compares its actual result against that
// baseline, so a new SDK incompatibility cannot hide behind a green pipeline.
//
// Fail-closed in both directions:
//   - any check that fails and is NOT the documented expectation blocks;
//   - a documented expectation that no longer fails also blocks, because the baseline is then
//     stale and must be re-reviewed. This mirrors how the dependency gate treats a stale
//     allowlist entry.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function evaluateDoctorReport({ output, expected }) {
  const failures = [];

  if (typeof output !== "string" || output.trim() === "") {
    return { failures: ["Expo Doctor produced no output"], failedChecks: [] };
  }

  const summary = output.match(/(\d+)\/(\d+)\s+checks passed\./);
  if (!summary) {
    failures.push("Expo Doctor output did not contain a parsable '<passed>/<total> checks passed.' summary");
    return { failures, failedChecks: [] };
  }

  const passed = Number(summary[1]);
  const total = Number(summary[2]);

  // Every failed check is printed as a "✖ <name>" heading.
  const failedChecks = [...output.matchAll(/^\s*✖\s+(.+?)\s*$/gm)].map((match) => match[1]);

  if (passed + failedChecks.length !== total) {
    failures.push(
      `Expo Doctor output is inconsistent: ${passed} passed and ${failedChecks.length} ` +
      `printed failures do not add up to ${total} checks`
    );
  }

  if (!Number.isInteger(expected?.total) || !Number.isInteger(expected?.passed)) {
    failures.push("baseline expoDoctor.passed and expoDoctor.total must be integers");
    return { failures, failedChecks };
  }
  if (!Array.isArray(expected.expectedFailedChecks)) {
    failures.push("baseline expoDoctor.expectedFailedChecks must be an array");
    return { failures, failedChecks };
  }

  if (total !== expected.total) {
    failures.push(
      `Expo Doctor now runs ${total} checks, baseline documents ${expected.total}. ` +
      "Re-review the baseline instead of adjusting the number blindly."
    );
  }
  if (passed !== expected.passed) {
    failures.push(`Expo Doctor passed ${passed} checks, baseline documents ${expected.passed}`);
  }

  for (const check of failedChecks) {
    if (!expected.expectedFailedChecks.includes(check)) {
      failures.push(`undocumented Expo Doctor failure: ${JSON.stringify(check)}`);
    }
  }

  for (const check of expected.expectedFailedChecks) {
    if (!failedChecks.includes(check)) {
      failures.push(
        `stale baseline expectation: ${JSON.stringify(check)} no longer fails. ` +
        "Remove it from expectedFailedChecks and update expectedOpenFinding."
      );
    }
  }

  if (expected.expectedFailedChecks.length > 0 && typeof expected.expectedOpenFinding !== "string") {
    failures.push("an expected Doctor failure requires a written expectedOpenFinding rationale");
  }

  return { failures, failedChecks };
}

function runDoctor(version) {
  const command = process.platform === "win32" ? "npx.cmd" : "npx";
  const result = spawnSync(command, ["--yes", `expo-doctor@${version}`], {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024
  });
  if (result.error) throw result.error;
  // Doctor exits 1 whenever any check fails, which is an expected state here. Anything other
  // than a clean 0/1 termination means Doctor itself could not run and must block.
  if (result.signal || ![0, 1].includes(result.status)) {
    throw new Error(
      `Expo Doctor failed operationally (status=${result.status}, signal=${result.signal ?? "none"})`
    );
  }
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
}

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--report-file") {
      const value = argv[index + 1];
      if (!value) throw new Error(`${argument} requires a path`);
      options.reportFile = resolve(value);
      index += 1;
      continue;
    }
    throw new Error(`unknown argument: ${argument}`);
  }
  return options;
}

function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    const baseline = JSON.parse(
      readFileSync(resolve(repositoryRoot, "security/mobile-upgrade-baseline.json"), "utf8")
    );
    const expected = baseline?.current?.expoDoctor;
    if (!expected?.version) {
      throw new Error("baseline current.expoDoctor.version is required to pin Expo Doctor");
    }

    const output = options.reportFile
      ? readFileSync(options.reportFile, "utf8")
      : runDoctor(expected.version);

    const result = evaluateDoctorReport({ output, expected });

    if (result.failures.length > 0) {
      console.error("Expo Doctor gate failed:");
      for (const failure of result.failures) console.error(`- ${failure}`);
      process.exitCode = 1;
      return;
    }

    console.log(
      `Expo Doctor gate passed: ${expected.passed}/${expected.total} checks passed with ` +
      `${result.failedChecks.length} documented finding(s).`
    );
    for (const check of result.failedChecks) console.log(`- expected: ${check}`);
  } catch (error) {
    console.error(`Expo Doctor gate failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
