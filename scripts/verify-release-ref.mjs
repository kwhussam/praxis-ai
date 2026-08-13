import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const appJson = JSON.parse(readFileSync("app.json", "utf8"));
const ref = process.env.GITHUB_REF ?? "";
const event = process.env.GITHUB_EVENT_NAME ?? "";

if (appJson.expo?.version !== packageJson.version) throw new Error("Expo and package versions do not match");
if (!Number.isInteger(appJson.expo?.android?.versionCode) || appJson.expo.android.versionCode < 1) {
  throw new Error("Android versionCode must be a positive integer");
}
if (!/^[1-9][0-9]*$/.test(String(appJson.expo?.ios?.buildNumber ?? ""))) {
  throw new Error("iOS buildNumber must be a positive integer string");
}

if (event === "push" && ref.startsWith("refs/tags/")) {
  const tag = ref.slice("refs/tags/".length);
  if (tag !== `v${packageJson.version}`) {
    throw new Error(`Release tag ${tag} does not match package version v${packageJson.version}`);
  }
} else if (event === "workflow_dispatch" && ref === "refs/heads/main") {
  // A manual production release is allowed only from the reviewed default branch and still
  // requires approval from the protected GitHub environment.
} else {
  throw new Error(`Production release is not permitted for event ${event || "unknown"} on ${ref || "unknown ref"}`);
}

console.log(`Release source verified: ${ref}`);
