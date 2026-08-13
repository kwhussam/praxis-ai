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
      /merged_manifest/.test(path) &&
      /(\/release\/|processRelease)/.test(path)
    ) {
      matches.push(path);
    }
  }
  return matches;
}

const manifestPath = findManifests(mergedRoot).sort((left, right) => left.length - right.length)[0];
if (!manifestPath) throw new Error(`No merged release manifest found below ${mergedRoot}`);
const manifest = readFileSync(manifestPath, "utf8");

for (const expected of ['android:allowBackup="false"', 'android:usesCleartextTraffic="false"']) {
  if (!manifest.includes(expected)) throw new Error(`Merged release manifest is missing ${expected}`);
}
for (const forbidden of ["READ_EXTERNAL_STORAGE", "WRITE_EXTERNAL_STORAGE", "SYSTEM_ALERT_WINDOW"]) {
  if (manifest.includes(forbidden)) throw new Error(`Merged release manifest still grants ${forbidden}`);
}

console.log(`Merged Android release manifest verified: ${manifestPath}`);
