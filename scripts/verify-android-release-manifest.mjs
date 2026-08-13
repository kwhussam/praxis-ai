import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const mergedRoot = resolve("android/app/build/intermediates");

function findManifests(directory) {
  if (!existsSync(directory)) return [];
  const matches = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      matches.push(...findManifests(path));
    } else if (
      entry.name === "AndroidManifest.xml" &&
      /\/merged_manifests?\/[^/]*release(?:\/|$)/i.test(path)
    ) {
      matches.push(path);
    }
  }
  return matches;
}

const manifestPaths = findManifests(mergedRoot).sort((left, right) => left.localeCompare(right));
if (manifestPaths.length === 0) throw new Error(`No merged release manifest found below ${mergedRoot}`);

for (const manifestPath of manifestPaths) {
  const manifest = readFileSync(manifestPath, "utf8");
  for (const expected of ['android:allowBackup="false"', 'android:usesCleartextTraffic="false"']) {
    if (!manifest.includes(expected)) throw new Error(`${manifestPath} is missing ${expected}`);
  }
  for (const forbidden of ["READ_EXTERNAL_STORAGE", "WRITE_EXTERNAL_STORAGE", "SYSTEM_ALERT_WINDOW"]) {
    if (manifest.includes(forbidden)) throw new Error(`${manifestPath} still grants ${forbidden}`);
  }
}

console.log(`Verified ${manifestPaths.length} merged Android release manifest(s):\n${manifestPaths.join("\n")}`);
