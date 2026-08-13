import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

const options = parseArguments(process.argv.slice(2));
const artifactPath = resolve(required(options, "artifact"));
const sbomPath = resolve(required(options, "sbom"));
const outputPath = resolve(required(options, "output"));
const platform = required(options, "platform");
const signingIdentity = required(options, "signing-identity").replace(/[^A-Fa-f0-9]/g, "").toUpperCase();
if (!/^[A-F0-9]{64}$/.test(signingIdentity)) throw new Error("Signing identity must be a SHA-256 fingerprint");

const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
const appJson = JSON.parse(readFileSync(resolve("app.json"), "utf8"));
const manifest = {
  schema_version: "praxisshield.release-evidence.v1",
  product: packageJson.name,
  version: packageJson.version,
  platform,
  build_number: platform === "android" ? String(appJson.expo.android.versionCode) : String(appJson.expo.ios.buildNumber),
  artifact: {
    name: basename(artifactPath),
    sha256: sha256(artifactPath),
    signing_certificate_sha256: signingIdentity
  },
  sbom: {
    name: basename(sbomPath),
    format: "CycloneDX",
    sha256: sha256(sbomPath)
  },
  source: {
    repository: process.env.GITHUB_REPOSITORY ?? "local",
    commit_sha: process.env.GITHUB_SHA ?? "local",
    workflow_run_id: process.env.GITHUB_RUN_ID ?? "local"
  }
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
console.log(`Release evidence manifest created: ${outputPath}`);

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function required(values, name) {
  const value = values[name];
  if (!value) throw new Error(`Missing --${name}`);
  return value;
}

function parseArguments(args) {
  const values = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index]?.replace(/^--/, "");
    const value = args[index + 1];
    if (!key || !value) throw new Error("Release manifest arguments must be --name value pairs");
    values[key] = value;
  }
  return values;
}
