import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const outputPath = resolve(process.argv[2] ?? "build/security/praxisshield.cdx.json");
const result = spawnSync(
  process.platform === "win32" ? "npm.cmd" : "npm",
  ["sbom", "--sbom-format", "cyclonedx", "--sbom-type", "application", "--package-lock-only"],
  { cwd: process.cwd(), encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
);

if (result.status !== 0) {
  if (result.stderr) process.stderr.write(result.stderr);
  throw new Error(`npm sbom failed with exit code ${result.status ?? "unknown"}`);
}

JSON.parse(result.stdout);
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, result.stdout, { encoding: "utf8", mode: 0o600 });
console.log(`CycloneDX SBOM generated: ${outputPath}`);
