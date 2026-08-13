import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const inputPath = resolve(process.argv[2] ?? "build/security/codeql-sarif");
const files = findSarifFiles(inputPath);
if (files.length === 0) throw new Error(`No SARIF result found below ${inputPath}`);

const blocking = [];
let resultCount = 0;
for (const file of files) {
  const sarif = JSON.parse(readFileSync(file, "utf8"));
  for (const run of sarif.runs ?? []) {
    const rules = new Map((run.tool?.driver?.rules ?? []).map((rule) => [rule.id, rule]));
    for (const result of run.results ?? []) {
      resultCount += 1;
      const rule = rules.get(result.ruleId);
      const rawSeverity = result.properties?.["security-severity"] ?? rule?.properties?.["security-severity"];
      const securitySeverity = Number.parseFloat(String(rawSeverity ?? ""));
      const critical = Number.isFinite(securitySeverity) && securitySeverity >= 9;
      const unclassifiedError = result.level === "error" && !Number.isFinite(securitySeverity);
      if (critical || unclassifiedError) {
        blocking.push({
          ruleId: result.ruleId ?? "unknown-rule",
          level: result.level ?? "warning",
          securitySeverity: Number.isFinite(securitySeverity) ? securitySeverity : null,
          message: result.message?.text ?? "CodeQL finding without message"
        });
      }
    }
  }
}

if (blocking.length > 0) {
  for (const finding of blocking) console.error(JSON.stringify(finding));
  throw new Error(`SAST gate blocked ${blocking.length} critical or unclassified-error finding(s)`);
}
console.log(`SAST gate passed: ${resultCount} finding(s), none critical`);

function findSarifFiles(path) {
  const entry = statSync(path);
  if (entry.isFile()) return /\.sarif(?:\.json)?$/i.test(path) ? [path] : [];
  return readdirSync(path, { withFileTypes: true }).flatMap((child) => {
    const childPath = resolve(path, child.name);
    if (child.isDirectory()) return findSarifFiles(childPath);
    return /\.sarif(?:\.json)?$/i.test(child.name) ? [childPath] : [];
  });
}
