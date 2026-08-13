import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const sbomPath = resolve(process.argv[2] ?? "build/security/praxisshield.cdx.json");
const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
const sbom = JSON.parse(readFileSync(sbomPath, "utf8"));

assert(sbom.bomFormat === "CycloneDX", "SBOM is not CycloneDX");
assert(/^1\.[5-9]$/.test(String(sbom.specVersion)), "SBOM uses an unsupported CycloneDX version");
assert(/^urn:uuid:[0-9a-f-]{36}$/i.test(String(sbom.serialNumber)), "SBOM serial number is missing or invalid");
assert(sbom.metadata?.component?.type === "application", "SBOM root component is not an application");
assert(sbom.metadata?.component?.version === packageJson.version, "SBOM application version does not match package.json");
assert(sbom.metadata?.component?.purl === `pkg:npm/${packageJson.name}@${packageJson.version}`, "SBOM root purl does not match package.json");
assert(Array.isArray(sbom.components) && sbom.components.length > 0, "SBOM contains no dependency components");
assert(Array.isArray(sbom.dependencies) && sbom.dependencies.length > 0, "SBOM contains no dependency graph");

const invalidComponents = sbom.components.filter((component) =>
  typeof component?.name !== "string" ||
  typeof component?.version !== "string" ||
  typeof component?.purl !== "string" ||
  typeof component?.["bom-ref"] !== "string"
);
assert(invalidComponents.length === 0, `SBOM has ${invalidComponents.length} incomplete component(s)`);

console.log(`CycloneDX SBOM verified: ${sbom.components.length} dependency components`);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
