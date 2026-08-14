#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const BLOCKING_SEVERITIES = new Set(["high", "critical"]);
const REQUIRED_SCOPE = "build-toolchain";
const MAX_EXCEPTION_DAYS = 31;
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function evaluateDependencyAudit({ auditReport, allowlist, packageLock, packageJson, now = new Date() }) {
  const failures = [];

  if (auditReport?.auditReportVersion !== 2 || !isObject(auditReport.vulnerabilities)) {
    return { failures: ["npm audit did not return a supported auditReportVersion=2 report"], accepted: [] };
  }

  const exceptions = validateAllowlist(allowlist, now, failures);
  const actualAdvisories = collectBlockingAdvisories(auditReport.vulnerabilities, failures);
  const actualById = new Map(actualAdvisories.map((advisory) => [advisory.id, advisory]));
  const exceptionById = new Map(exceptions.map((exception) => [exception.id, exception]));

  for (const advisory of actualAdvisories) {
    const exception = exceptionById.get(advisory.id);
    if (!exception) {
      failures.push(`${advisory.id} (${advisory.package}, ${advisory.severity}) is not allowlisted`);
      continue;
    }

    compareExact(exception, advisory, "package", failures);
    compareExact(exception, advisory, "severity", failures);
    compareExact(exception, advisory, "url", failures);
    compareExact(exception, advisory, "affectedRange", failures);

    if (exception.scope !== REQUIRED_SCOPE) {
      failures.push(`${exception.id} has forbidden scope ${JSON.stringify(exception.scope)}`);
    }
    if (isDirectDependency(packageJson, exception.package)) {
      failures.push(`${exception.id} affects direct application dependency ${exception.package}`);
    }

    const installedVersions = versionsForPackage(packageLock, exception.package);
    const expectedVersions = [...(exception.observedVersions ?? [])].sort();
    if (JSON.stringify(installedVersions) !== JSON.stringify(expectedVersions)) {
      failures.push(
        `${exception.id} installed versions changed: expected ${expectedVersions.join(", ") || "none"}, ` +
        `found ${installedVersions.join(", ") || "none"}`
      );
    }
  }

  for (const exception of exceptions) {
    if (!actualById.has(exception.id)) {
      failures.push(`${exception.id} is stale: npm audit no longer reports this advisory`);
    }
  }

  return {
    failures,
    accepted: actualAdvisories.filter((advisory) => exceptionById.has(advisory.id))
  };
}

function validateAllowlist(allowlist, now, failures) {
  if (allowlist?.schemaVersion !== 1 || !Array.isArray(allowlist.exceptions)) {
    failures.push("dependency allowlist must use schemaVersion=1 and contain an exceptions array");
    return [];
  }

  const ids = new Set();
  const exceptions = [];
  for (const [index, exception] of allowlist.exceptions.entries()) {
    const location = `exceptions[${index}]`;
    if (!isObject(exception)) {
      failures.push(`${location} must be an object`);
      continue;
    }

    for (const field of [
      "id", "package", "severity", "url", "affectedRange", "scope", "owner",
      "reason", "mitigation", "remediation", "reviewedAt", "expiresAt"
    ]) {
      if (typeof exception[field] !== "string" || exception[field].trim() === "") {
        failures.push(`${location}.${field} must be a non-empty string`);
      }
    }
    if (!Array.isArray(exception.observedVersions) || exception.observedVersions.length === 0 ||
        exception.observedVersions.some((value) => typeof value !== "string" || value.trim() === "")) {
      failures.push(`${location}.observedVersions must contain at least one version`);
    }
    if (!Array.isArray(exception.dependencyPaths) || exception.dependencyPaths.length === 0 ||
        exception.dependencyPaths.some((value) => typeof value !== "string" || !value.endsWith(` > ${exception.package}`))) {
      failures.push(`${location}.dependencyPaths must contain reviewed paths ending in ${exception.package}`);
    }
    if (ids.has(exception.id)) {
      failures.push(`${location}.id duplicates ${exception.id}`);
    }
    ids.add(exception.id);

    if (!/^GHSA-[23456789cfghjmpqrvwx]{4}-[23456789cfghjmpqrvwx]{4}-[23456789cfghjmpqrvwx]{4}$/.test(exception.id ?? "")) {
      failures.push(`${location}.id must be a canonical GHSA identifier`);
    }
    if (exception.url !== `https://github.com/advisories/${exception.id}`) {
      failures.push(`${location}.url must match its GHSA identifier`);
    }
    if (!BLOCKING_SEVERITIES.has(exception.severity)) {
      failures.push(`${location}.severity must be high or critical`);
    }
    if (exception.scope !== REQUIRED_SCOPE) {
      failures.push(`${location}.scope must be ${REQUIRED_SCOPE}`);
    }
    if ((exception.reason?.length ?? 0) < 40 || (exception.mitigation?.length ?? 0) < 40 ||
        (exception.remediation?.length ?? 0) < 40) {
      failures.push(`${location} must document reason, mitigation and remediation in detail`);
    }

    const reviewedAt = parseDateOnly(exception.reviewedAt);
    const expiresOn = parseDateOnly(exception.expiresAt);
    const expiresAt = parseDateOnly(exception.expiresAt, true);
    if (!reviewedAt || !expiresOn || !expiresAt) {
      failures.push(`${location} reviewedAt/expiresAt must be real YYYY-MM-DD dates`);
    } else {
      const lifetimeDays = (expiresOn.getTime() - reviewedAt.getTime()) / 86_400_000;
      if (reviewedAt.getTime() > now.getTime()) failures.push(`${exception.id} has a future review date`);
      if (expiresAt.getTime() < now.getTime()) failures.push(`${exception.id} expired on ${exception.expiresAt}`);
      if (lifetimeDays > MAX_EXCEPTION_DAYS) {
        failures.push(`${exception.id} exceeds the ${MAX_EXCEPTION_DAYS}-day exception limit`);
      }
    }

    exceptions.push(exception);
  }
  return exceptions;
}

function collectBlockingAdvisories(vulnerabilities, failures) {
  const advisories = new Map();

  for (const [packageName, vulnerability] of Object.entries(vulnerabilities)) {
    if (!BLOCKING_SEVERITIES.has(vulnerability?.severity)) continue;
    const resolved = resolveBlockingLeaves(packageName, vulnerabilities, new Set(), failures);
    if (resolved.length === 0) {
      failures.push(`${packageName} is ${vulnerability.severity} but has no resolvable advisory leaf`);
    }
    for (const advisory of resolved) {
      const existing = advisories.get(advisory.id);
      if (existing && JSON.stringify(existing) !== JSON.stringify(advisory)) {
        failures.push(`${advisory.id} appeared with conflicting audit metadata`);
      }
      advisories.set(advisory.id, advisory);
    }
  }

  return [...advisories.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function resolveBlockingLeaves(packageName, vulnerabilities, visiting, failures) {
  if (visiting.has(packageName)) return [];
  visiting.add(packageName);
  const vulnerability = vulnerabilities[packageName];
  if (!vulnerability || !Array.isArray(vulnerability.via)) return [];

  const leaves = [];
  for (const via of vulnerability.via) {
    if (typeof via === "string") {
      if (!vulnerabilities[via]) {
        failures.push(`${packageName} references missing vulnerability ${via}`);
        continue;
      }
      leaves.push(...resolveBlockingLeaves(via, vulnerabilities, new Set(visiting), failures));
      continue;
    }
    if (!isObject(via) || !BLOCKING_SEVERITIES.has(via.severity)) continue;
    const id = advisoryId(via.url);
    if (!id) {
      failures.push(`${packageName} contains a blocking advisory without a canonical GHSA URL`);
      continue;
    }
    leaves.push({
      id,
      package: via.name,
      severity: via.severity,
      url: via.url,
      affectedRange: via.range
    });
  }
  return leaves;
}

function advisoryId(url) {
  return typeof url === "string" ? url.match(/\/advisories\/(GHSA-[^/?#]+)/)?.[1] ?? null : null;
}

function isDirectDependency(packageJson, packageName) {
  return ["dependencies", "optionalDependencies"].some((field) => packageJson?.[field]?.[packageName]);
}

function versionsForPackage(packageLock, packageName) {
  if (!isObject(packageLock?.packages)) return [];
  const suffix = `/node_modules/${packageName}`;
  const direct = `node_modules/${packageName}`;
  return [...new Set(Object.entries(packageLock.packages)
    .filter(([location, value]) => (location === direct || location.endsWith(suffix)) && typeof value?.version === "string")
    .map(([, value]) => value.version))].sort();
}

function compareExact(exception, advisory, field, failures) {
  if (exception[field] !== advisory[field]) {
    failures.push(
      `${advisory.id} ${field} changed: allowlist=${JSON.stringify(exception[field])}, ` +
      `audit=${JSON.stringify(advisory[field])}`
    );
  }
}

function parseDateOnly(value, endOfDay = false) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--audit-file" || argument === "--allowlist") {
      const value = argv[index + 1];
      if (!value) throw new Error(`${argument} requires a path`);
      options[argument.slice(2)] = resolve(value);
      index += 1;
      continue;
    }
    throw new Error(`unknown argument: ${argument}`);
  }
  return options;
}

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function runNpmAudit() {
  const command = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(command, ["audit", "--audit-level=high", "--json"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024
  });
  if (result.error) throw result.error;
  if (result.signal || ![0, 1].includes(result.status)) {
    throw new Error(`npm audit failed operationally (status=${result.status}, signal=${result.signal ?? "none"})`);
  }
  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    throw new Error(`npm audit returned invalid JSON${result.stderr ? `: ${result.stderr.trim()}` : ""}`);
  }
  if (report.error || report.auditReportVersion !== 2) {
    throw new Error(`npm audit could not obtain a valid registry report: ${report.message ?? "unknown error"}`);
  }
  return report;
}

function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    const auditReport = options["audit-file"] ? readJson(options["audit-file"], "audit report") : runNpmAudit();
    const allowlistPath = options.allowlist ?? resolve(repositoryRoot, "security/dependency-allowlist.json");
    const result = evaluateDependencyAudit({
      auditReport,
      allowlist: readJson(allowlistPath, "dependency allowlist"),
      packageLock: readJson(resolve(repositoryRoot, "package-lock.json"), "package lock"),
      packageJson: readJson(resolve(repositoryRoot, "package.json"), "package manifest")
    });

    if (result.failures.length > 0) {
      console.error("Dependency gate failed:");
      for (const failure of result.failures) console.error(`- ${failure}`);
      process.exitCode = 1;
      return;
    }

    console.log(`Dependency gate passed: ${result.accepted.length} temporary build-toolchain exceptions accepted.`);
    for (const advisory of result.accepted) {
      console.log(`- ${advisory.id}: ${advisory.package} (${advisory.severity})`);
    }
  } catch (error) {
    console.error(`Dependency gate failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
